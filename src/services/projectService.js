import {
    collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
    arrayUnion, arrayRemove, increment, Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ===== 프로젝트 목록 캐시 (localStorage + 메모리) =====
const PROJ_CACHE_KEY = 'projListCache';
let projMemoryCache = null;

function serializeTimestamp(ts) {
    if (ts?.seconds != null) return { _s: ts.seconds, _n: ts.nanoseconds };
    return ts;
}

function deserializeTimestamp(val) {
    if (val && val._s != null) {
        return new Timestamp(val._s, val._n);
    }
    return val;
}

function serializeProjects(projects) {
    return projects.map(p => ({
        ...p,
        createdAt: serializeTimestamp(p.createdAt),
        updatedAt: serializeTimestamp(p.updatedAt),
        lastMessageAt: serializeTimestamp(p.lastMessageAt),
        lastItemUpdatedAt: serializeTimestamp(p.lastItemUpdatedAt),
    }));
}

function deserializeProjects(projects) {
    return projects.map(p => ({
        ...p,
        createdAt: deserializeTimestamp(p.createdAt),
        updatedAt: deserializeTimestamp(p.updatedAt),
        lastMessageAt: deserializeTimestamp(p.lastMessageAt),
        lastItemUpdatedAt: deserializeTimestamp(p.lastItemUpdatedAt),
    }));
}

export function getCachedProjects() {
    if (projMemoryCache) return projMemoryCache;
    try {
        const stored = localStorage.getItem(PROJ_CACHE_KEY);
        if (stored) {
            projMemoryCache = deserializeProjects(JSON.parse(stored));
            return projMemoryCache;
        }
    } catch (e) { /* 무시 */ }
    return null;
}

function setCachedProjects(projects) {
    projMemoryCache = projects;
    try {
        localStorage.setItem(PROJ_CACHE_KEY, JSON.stringify(serializeProjects(projects)));
    } catch (e) { /* 무시 */ }
}

export function clearProjectCache() {
    projMemoryCache = null;
    localStorage.removeItem(PROJ_CACHE_KEY);
}

// ===== 프로젝트 마지막 동기화 시각 (서버 시간 기준) =====
const PROJ_SYNC_TIME_KEY = 'projSyncTime';

function getProjectSyncTime() {
    try {
        const val = localStorage.getItem(PROJ_SYNC_TIME_KEY);
        return val ? Number(val) : null;
    } catch { return null; }
}

function setProjectSyncTime(projects) {
    let maxSeconds = 0;
    for (const p of projects) {
        const s = p.updatedAt?.seconds || 0;
        if (s > maxSeconds) maxSeconds = s;
    }
    if (maxSeconds > 0) {
        localStorage.setItem(PROJ_SYNC_TIME_KEY, String(maxSeconds));
    }
}

/**
 * 프로젝트 delta fetch — 변경분만 가져와 캐시 병합
 */
export async function deltaFetchProjects(userId) {
    const syncSeconds = getProjectSyncTime();
    const cached = getCachedProjects();
    if (!syncSeconds || !cached) return null;

    const syncTimestamp = new Timestamp(syncSeconds, 0);
    const q = query(
        collection(db, 'projects'),
        where('memberUIDs', 'array-contains', userId),
        where('updatedAt', '>', syncTimestamp)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return cached;
    }

    const map = new Map(cached.map(p => [p.id, p]));
    const changedProjects = [];

    snapshot.forEach(d => {
        const data = { id: d.id, ...d.data() };
        changedProjects.push(data);
        if (!(data.memberUIDs || []).includes(userId)) {
            map.delete(d.id);
        } else {
            map.set(d.id, data);
        }
    });

    const result = [...map.values()].sort((a, b) => {
        const aTime = a.updatedAt?.toDate?.() || new Date(0);
        const bTime = b.updatedAt?.toDate?.() || new Date(0);
        return bTime - aTime;
    });

    setCachedProjects(result);
    setProjectSyncTime(changedProjects);
    cleanupOrphanedCaches(result.map(p => p.id));

    return result;
}

function cleanupOrphanedCaches(validIds) {
    const valid = new Set(validIds);
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('itemCache_') || key?.startsWith('itemSyncTime_')) {
            const pid = key.replace(/^(itemCache_|itemSyncTime_)/, '');
            if (!valid.has(pid)) localStorage.removeItem(key);
        }
    }
}

// 프로젝트 생성
export async function createProject(userId, nickname, name, description = '', ownerPlan = 'free', displayName = '', icon = null) {
    const projectRef = await addDoc(collection(db, 'projects'), {
        name,
        description,
        color: null,
        icon: icon || null,
        ownerId: userId,
        ownerNickname: nickname,
        ownerPlan,
        memberCount: 1,
        subscriptionActive: false,
        order: -1,
        memberUIDs: [userId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        members: {
            [userId]: {
                nickname: nickname,
                displayName: displayName,
                role: 'admin',
                joinedAt: new Date().toISOString(),
            }
        }
    });
    return projectRef.id;
}

// 글자수 포인트 계산 (한글=2, 그 외=1, 최대 12포인트 = 한글6자/영문12자)
function getNamePoints(str) {
    let points = 0;
    for (const ch of str) {
        points += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
    }
    return points;
}

// 멤버 활동명 업데이트
export async function updateMemberDisplayName(projectId, targetUid, newDisplayName) {
    // 글자수 포인트 검사 (한글 6자 / 영문 12자 이내)
    if (getNamePoints(newDisplayName) > 12) {
        throw new Error('활동명이 너무 깁니다. (한글 6자/영문 12자 이내)');
    }
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    const members = projectDoc.data()?.members || {};
    // 페이지 내 중복 검사 (자신 제외)
    for (const [uid, m] of Object.entries(members)) {
        if (uid !== targetUid && m.displayName === newDisplayName) {
            throw new Error('이미 사용 중인 활동명입니다.');
        }
    }
    await updateDoc(doc(db, 'projects', projectId), {
        [`members.${targetUid}.displayName`]: newDisplayName,
        updatedAt: serverTimestamp(),
    });
}



// 내 프로젝트 목록 실시간 구독 (+ 캐시 자동 갱신)
export function subscribeToMyProjects(userId, callback) {
    // memberUIDs 배열에 array-contains 쿼리 — 자신의 프로젝트만 읽기
    const q = query(
        collection(db, 'projects'),
        where('memberUIDs', 'array-contains', userId)
    );

    return onSnapshot(q, (snapshot) => {
        const projects = [];
        snapshot.forEach((doc) => {
            projects.push({ id: doc.id, ...doc.data() });
        });
        // 클라이언트에서 updatedAt 기준 정렬
        projects.sort((a, b) => {
            const aTime = a.updatedAt?.toDate?.() || new Date(0);
            const bTime = b.updatedAt?.toDate?.() || new Date(0);
            return bTime - aTime;
        });

        // 캐시에 저장
        setCachedProjects(projects);
        setProjectSyncTime(projects);

        callback(projects);
    });
}

// 프로젝트 상세 조회
export async function getProject(projectId) {
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    if (!projectDoc.exists()) return null;
    return { id: projectDoc.id, ...projectDoc.data() };
}

// 프로젝트 실시간 구독
export function subscribeToProject(projectId, callback) {
    return onSnapshot(doc(db, 'projects', projectId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() });
        }
    });
}

// 프로젝트 수정 (관리자만)
export async function updateProject(projectId, data) {
    await updateDoc(doc(db, 'projects', projectId), {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

// 프로젝트 삭제 (관리자만)
export async function deleteProject(projectId) {
    // 아이템 서브컬렉션도 삭제 필요
    const itemsSnapshot = await getDocs(collection(db, 'projects', projectId, 'items'));
    const batch = writeBatch(db);
    itemsSnapshot.forEach((itemDoc) => {
        batch.delete(itemDoc.ref);
    });
    batch.delete(doc(db, 'projects', projectId));
    await batch.commit();
}

// 멤버 권한 변경
export async function changeMemberRole(projectId, targetUserId, newRole) {
    await updateDoc(doc(db, 'projects', projectId), {
        [`members.${targetUserId}.role`]: newRole,
        updatedAt: serverTimestamp(),
    });
}

// 멤버 제거
export async function removeMember(projectId, targetUserId) {
    const { deleteField } = await import('firebase/firestore');
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    const currentCount = projectDoc.data().memberCount || 1;

    await updateDoc(doc(db, 'projects', projectId), {
        [`members.${targetUserId}`]: deleteField(),
        memberUIDs: arrayRemove(targetUserId),
        memberCount: currentCount - 1,
        updatedAt: serverTimestamp(),
    });
}

// 프로젝트 나가기
export async function leaveProject(projectId, userId) {
    await removeMember(projectId, userId);
}

// ===== 역할 정규화 (기존 readwrite/write → 새 editor 매핑) =====
export function normalizeRole(role) {
    const ROLE_MAP = {
        'write': 'editor',
        'readwrite': 'editor',
        'read': 'viewer',
        'viewer': 'viewer',
        'editor': 'editor',
        'admin': 'admin',
    };
    return ROLE_MAP[role] || 'editor';
}

// 역할 한글 라벨
export function getRoleLabel(role) {
    const labels = { admin: '관리자', editor: '편집자', viewer: '독자' };
    return labels[normalizeRole(role)] || '편집자';
}

// 현재 사용자의 역할 (정규화 적용)
export function getUserRole(project, userId) {
    if (!project.members || !project.members[userId]) return null;
    return normalizeRole(project.members[userId].role);
}

// 권한 확인 헬퍼
export function canWrite(project, userId) {
    const role = getUserRole(project, userId);
    return ['editor', 'admin'].includes(role);
}

export function canAdmin(project, userId) {
    const role = getUserRole(project, userId);
    return role === 'admin';
}

// 프로젝트별 구글 캘린더 ID 저장 (프로젝트 레벨 - 모든 멤버 공유)
export async function saveProjectCalendarId(projectId, userId, calendarId) {
    await updateDoc(doc(db, 'projects', projectId), {
        googleCalendarId: calendarId,
        updatedAt: serverTimestamp(),
    });
}

// 프로젝트별 구글 캘린더 ID 조회 (프로젝트 레벨)
export function getProjectCalendarId(project) {
    return project?.googleCalendarId || '';
}

// ===== 프로젝트 라벨 관리 =====
export async function addProjectLabel(projectId, label) {
    await updateDoc(doc(db, 'projects', projectId), {
        projectLabels: arrayUnion(label),
        updatedAt: serverTimestamp(),
    });
}

export async function removeProjectLabel(projectId, label) {
    // 1. 프로젝트에서 라벨 제거
    await updateDoc(doc(db, 'projects', projectId), {
        projectLabels: arrayRemove(label),
        updatedAt: serverTimestamp(),
    });
    // 2. 해당 프로젝트의 모든 아이템에서도 해당 라벨 제거
    const itemsRef = collection(db, 'projects', projectId, 'items');
    const snap = await getDocs(itemsRef);
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach(d => {
        const labels = d.data().labels || [];
        if (labels.includes(label)) {
            batch.update(d.ref, { labels: arrayRemove(label), updatedAt: serverTimestamp() });
            count++;
        }
    });
    if (count > 0) await batch.commit();
}
