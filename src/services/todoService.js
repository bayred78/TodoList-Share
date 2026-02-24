import {
    collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
    query, orderBy, where, limit, onSnapshot, serverTimestamp, increment, Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ===== 프로젝트별 아이템 캐시 (localStorage + 메모리) =====
const ITEM_CACHE_PREFIX = 'itemCache_';
const itemMemoryCache = new Map();

function serializeItems(items) {
    return items.map(item => ({
        ...item,
        createdAt: item.createdAt?.seconds != null
            ? { _s: item.createdAt.seconds, _n: item.createdAt.nanoseconds }
            : item.createdAt,
        updatedAt: item.updatedAt?.seconds != null
            ? { _s: item.updatedAt.seconds, _n: item.updatedAt.nanoseconds }
            : item.updatedAt,
        deletedAt: item.deletedAt?.seconds != null
            ? { _s: item.deletedAt.seconds, _n: item.deletedAt.nanoseconds }
            : item.deletedAt,
        dueDate: item.dueDate?.seconds != null
            ? { _s: item.dueDate.seconds, _n: item.dueDate.nanoseconds }
            : item.dueDate,
    }));
}

function deserializeTimestamp(val) {
    if (val && val._s != null) return new Timestamp(val._s, val._n);
    return val;
}

function deserializeItems(items) {
    return items.map(item => ({
        ...item,
        createdAt: deserializeTimestamp(item.createdAt),
        updatedAt: deserializeTimestamp(item.updatedAt),
        deletedAt: deserializeTimestamp(item.deletedAt),
        dueDate: deserializeTimestamp(item.dueDate),
    }));
}

export function getCachedItems(projectId) {
    if (itemMemoryCache.has(projectId)) {
        return itemMemoryCache.get(projectId);
    }
    try {
        const stored = localStorage.getItem(ITEM_CACHE_PREFIX + projectId);
        if (stored) {
            const parsed = JSON.parse(stored);
            const restored = {
                active: deserializeItems(parsed.active || []),
                deleted: deserializeItems(parsed.deleted || []),
            };
            itemMemoryCache.set(projectId, restored);
            return restored;
        }
    } catch (e) { /* 무시 */ }
    return null;
}

function setCachedItems(projectId, active, deleted) {
    const data = { active, deleted };
    itemMemoryCache.set(projectId, data);
    try {
        localStorage.setItem(ITEM_CACHE_PREFIX + projectId, JSON.stringify({
            active: serializeItems(active),
            deleted: serializeItems(deleted),
        }));
    } catch (e) { /* 저장 실패 무시 */ }
}

export function clearItemCache(projectId) {
    if (projectId) {
        itemMemoryCache.delete(projectId);
        localStorage.removeItem(ITEM_CACHE_PREFIX + projectId);
    } else {
        itemMemoryCache.clear();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith(ITEM_CACHE_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
    }
}

// ===== 프로젝트별 마지막 동기화 시각 (서버 시간 기준) =====
const SYNC_TIME_PREFIX = 'itemSyncTime_';

export function getItemSyncTime(projectId) {
    try {
        const val = localStorage.getItem(SYNC_TIME_PREFIX + projectId);
        return val ? Number(val) : null;
    } catch { return null; }
}

function setItemSyncTime(projectId, items) {
    let maxSeconds = 0;
    for (const item of items) {
        const s = item.updatedAt?.seconds || 0;
        if (s > maxSeconds) maxSeconds = s;
    }
    if (maxSeconds > 0) {
        localStorage.setItem(SYNC_TIME_PREFIX + projectId, String(maxSeconds));
    }
}

/**
 * 캐시의 lastSyncTime 이후 변경된 아이템만 fetch → 캐시 병합
 * 캐시/syncTime이 없으면 null 반환 (전체 구독 fallback)
 */
export async function deltaFetchItems(projectId) {
    const syncSeconds = getItemSyncTime(projectId);
    const cached = getCachedItems(projectId);
    if (!syncSeconds || !cached) return null;

    const syncTimestamp = new Timestamp(syncSeconds, 0);
    const q = query(
        collection(db, 'projects', projectId, 'items'),
        where('updatedAt', '>', syncTimestamp),
        orderBy('updatedAt', 'asc')
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return cached;
    }

    // 변경분을 기존 캐시에 병합
    const activeMap = new Map(cached.active.map(i => [i.id, i]));
    const deletedMap = new Map(cached.deleted.map(i => [i.id, i]));
    const now = new Date();
    const changedItems = [];

    snapshot.forEach(d => {
        const data = { id: d.id, ...d.data() };
        changedItems.push(data);

        if (data.deleted) {
            activeMap.delete(data.id);
            if (data.deletedAt) {
                const dd = data.deletedAt.toDate ? data.deletedAt.toDate() : new Date(data.deletedAt);
                const diff = (now - dd) / 864e5;
                if (diff < 7) {
                    data.daysLeft = Math.max(0, Math.ceil(7 - diff));
                    deletedMap.set(data.id, data);
                } else {
                    deletedMap.delete(data.id);
                }
            } else {
                data.daysLeft = 7;
                deletedMap.set(data.id, data);
            }
        } else {
            deletedMap.delete(data.id);
            activeMap.set(data.id, data);
        }
    });

    const active = [...activeMap.values()].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    const deleted = [...deletedMap.values()];

    setCachedItems(projectId, active, deleted);
    setItemSyncTime(projectId, changedItems);

    return { active, deleted };
}

// 투두 아이템 추가 (항상 checklist)
export async function addTodoItem(projectId, item) {
    const itemsRef = collection(db, 'projects', projectId, 'items');

    // 최소 order 값만 조회 (limit 1) — 전체 컬렉션 읽기 방지
    const minQ = query(itemsRef, orderBy('order', 'asc'), limit(1));
    const minSnap = await getDocs(minQ);
    let minOrder = 0;
    if (!minSnap.empty) {
        minOrder = minSnap.docs[0].data().order ?? 0;
    }
    const order = minOrder - 1;

    const docRef = await addDoc(itemsRef, {
        type: item.type || 'checklist',
        title: item.title,
        content: item.content || '',
        checked: item.checked ?? false,
        calendarEventId: null,
        calendarSynced: false,
        deleted: false,
        deletedAt: null,
        color: item.color || null,
        priority: item.priority || 0,
        labels: item.labels || [],
        repeatType: item.repeatType || null,
        dueDate: item.dueDate || null,
        createdBy: item.createdBy,
        createdByNickname: item.createdByNickname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: order,
        version: 1,
    });

    return docRef.id;
}

// 투두 아이템 수정 (Optimistic Locking)
export async function updateTodoItem(projectId, itemId, data, options = {}) {
    const { expectedVersion, forceOverwrite } = options;
    const itemRef = doc(db, 'projects', projectId, 'items', itemId);

    // version 체크 (expectedVersion이 주어진 경우)
    if (expectedVersion != null && !forceOverwrite) {
        const snapshot = await getDoc(itemRef);
        if (snapshot.exists()) {
            const serverData = snapshot.data();
            const serverVersion = serverData.version || 1;
            if (serverVersion !== expectedVersion) {
                const error = new Error('다른 사용자가 이 항목을 수정했습니다.');
                error.code = 'VERSION_CONFLICT';
                error.serverData = { ...serverData, id: itemId };
                throw error;
            }
        }
    }

    await updateDoc(itemRef, {
        ...data,
        updatedAt: serverTimestamp(),
        version: increment(1),
    });
}

// 소프트 삭제 (휴지통으로 이동)
export async function deleteTodoItem(projectId, itemId) {
    await updateDoc(doc(db, 'projects', projectId, 'items', itemId), {
        deleted: true,
        deletedAt: serverTimestamp(),
    });
}

// 휴지통에서 복원
export async function restoreTodoItem(projectId, itemId) {
    await updateDoc(doc(db, 'projects', projectId, 'items', itemId), {
        deleted: false,
        deletedAt: null,
        updatedAt: serverTimestamp(),
    });
}

// 영구 삭제
export async function permanentDeleteItem(projectId, itemId) {
    await deleteDoc(doc(db, 'projects', projectId, 'items', itemId));
}

// 반복 타입별 다음 마감일 계산
function calcNextDueDate(dueDate, repeatType) {
    const base = dueDate?.toDate ? dueDate.toDate()
        : dueDate ? new Date(dueDate) : new Date();
    const next = new Date(base);

    if (repeatType === 'daily') {
        next.setDate(next.getDate() + 1);
    } else if (repeatType === 'weekly') {
        next.setDate(next.getDate() + 7);
    } else if (repeatType === 'monthly') {
        next.setMonth(next.getMonth() + 1);
    } else if (repeatType?.startsWith('weekday:')) {
        const targetDay = parseInt(repeatType.split(':')[1]); // 0=일 ~ 6=토
        do { next.setDate(next.getDate() + 1); }
        while (next.getDay() !== targetDay);
    } else if (repeatType?.startsWith('monthday:')) {
        const targetDate = parseInt(repeatType.split(':')[1]);
        next.setMonth(next.getMonth() + 1);
        // 해당 월의 최대 일수 초과 방지
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(targetDate, maxDay));
    }

    return Timestamp.fromDate(next);
}

// 체크 토글 (반복 항목은 체크만, 생성은 별도)
export async function toggleCheck(projectId, itemId, checked, itemData = {}, updatedBy = null) {
    const updateData = {
        checked: checked,
        updatedAt: serverTimestamp(),
    };
    if (updatedBy) updateData.updatedBy = updatedBy;
    await updateDoc(doc(db, 'projects', projectId, 'items', itemId), updateData);

    // 반복 항목 여부만 알려줌 (실제 생성은 createRepeatItem에서 처리)
    const isRepeat = checked && itemData.repeatType && itemData.repeatType !== 'none';
    return { repeated: false, isRepeat };
}

// 반복 항목 새로 생성 (확인 후 호출)
export async function createRepeatItem(projectId, itemData) {
    const itemsRef = collection(db, 'projects', projectId, 'items');
    const minQ = query(itemsRef, orderBy('order', 'asc'), limit(1));
    const minSnap = await getDocs(minQ);
    let minOrder = 0;
    if (!minSnap.empty) {
        minOrder = minSnap.docs[0].data().order ?? 0;
    }

    await addDoc(itemsRef, {
        type: 'checklist',
        title: itemData.title,
        content: itemData.content || '',
        checked: false,
        calendarEventId: null,
        calendarSynced: false,
        deleted: false,
        deletedAt: null,
        color: itemData.color || null,
        priority: itemData.priority || 0,
        labels: itemData.labels || [],
        repeatType: itemData.repeatType,
        dueDate: calcNextDueDate(itemData.dueDate, itemData.repeatType),
        createdBy: itemData.createdBy,
        createdByNickname: itemData.createdByNickname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: minOrder - 1,
        version: 1,
    });
}

// 구성원 체크 업데이트
export async function updateMemberCheck(projectId, itemId, userId, checked) {
    const itemRef = doc(db, 'projects', projectId, 'items', itemId);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const memberChecks = data.memberChecks || {};
    memberChecks[userId] = checked;

    await updateDoc(itemRef, {
        memberChecks,
        updatedAt: serverTimestamp(),
    });

    return memberChecks;
}

// 활성 아이템 구독 (삭제되지 않은 것만)
export function subscribeToItems(projectId, callback) {
    const q = query(
        collection(db, 'projects', projectId, 'items'),
        orderBy('order', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // 삭제되지 않은 항목만
            if (!data.deleted) {
                items.push({ id: doc.id, ...data });
            }
        });
        callback(items);
    });
}

// 휴지통 아이템 구독 (삭제된 것만)
export function subscribeToDeletedItems(projectId, callback) {
    const q = query(
        collection(db, 'projects', projectId, 'items'),
        orderBy('order', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
        const items = [];
        const now = new Date();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.deleted) {
                // 7일 경과 확인 (표시만, 삭제는 Cloud Function에서 처리)
                if (data.deletedAt) {
                    const deletedDate = data.deletedAt.toDate ? data.deletedAt.toDate() : new Date(data.deletedAt);
                    const diffDays = (now - deletedDate) / (1000 * 60 * 60 * 24);
                    if (diffDays >= 7) return; // 7일 경과 항목은 표시하지 않음
                    items.push({
                        id: doc.id,
                        ...data,
                        daysLeft: Math.max(0, Math.ceil(7 - diffDays)),
                    });
                } else {
                    items.push({ id: doc.id, ...data, daysLeft: 7 });
                }
            }
        });
        callback(items);
    });
}

// 활성+삭제 아이템 통합 구독 (단일 onSnapshot + 캐시 자동 갱신)
export function subscribeToAllItems(projectId, onActive, onDeleted) {
    const q = query(
        collection(db, 'projects', projectId, 'items'),
        orderBy('order', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
        const active = [];
        const deleted = [];
        const now = new Date();
        snapshot.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            if (data.deleted) {
                if (data.deletedAt) {
                    const deletedDate = data.deletedAt.toDate ? data.deletedAt.toDate() : new Date(data.deletedAt);
                    const diffDays = (now - deletedDate) / (1000 * 60 * 60 * 24);
                    if (diffDays >= 7) return;
                    data.daysLeft = Math.max(0, Math.ceil(7 - diffDays));
                } else {
                    data.daysLeft = 7;
                }
                deleted.push(data);
            } else {
                active.push(data);
            }
        });

        // 캐시에 최신 데이터 저장
        setCachedItems(projectId, active, deleted);
        // 서버 시간 기준 syncTime 갱신
        setItemSyncTime(projectId, [...active, ...deleted]);

        onActive(active);
        onDeleted(deleted);
    });
}

// 캘린더 동기화 상태 업데이트
export async function updateCalendarSync(projectId, itemId, calendarEventId, synced, calendarId = null) {
    const updateData = {
        calendarEventId: calendarEventId,
        calendarSynced: synced,
        updatedAt: serverTimestamp(),
    };
    if (calendarId !== null) {
        updateData.calendarRegisteredId = calendarId;
    }
    await updateDoc(doc(db, 'projects', projectId, 'items', itemId), updateData);
}
