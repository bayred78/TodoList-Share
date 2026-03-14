import {
    collection, doc, addDoc, updateDoc, setDoc, getDoc, getDocs,
    query, orderBy, limit, startAfter, where, onSnapshot,
    serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from './firebase';


// ===== 프로젝트별 채팅 메시지 영속 캐시 (localStorage + 메모리) =====
const CACHE_KEY_PREFIX = 'chatCache_';
const memoryCache = new Map(); // 빠른 접근용 메모리 캐시

function serializeMessages(messages) {
    return messages.map(msg => ({
        ...msg,
        // Firestore Timestamp → 직렬화 가능한 형태로
        createdAt: msg.createdAt?.toDate
            ? { _seconds: msg.createdAt.seconds, _nanoseconds: msg.createdAt.nanoseconds }
            : msg.createdAt,
    }));
}

function deserializeMessages(messages) {
    return messages.map(msg => ({
        ...msg,
        // 직렬화된 형태 → Firestore Timestamp 복원
        createdAt: msg.createdAt?._seconds != null
            ? new Timestamp(msg.createdAt._seconds, msg.createdAt._nanoseconds)
            : msg.createdAt,
    }));
}

export function getCachedMessages(projectId) {
    // 메모리 캐시 우선
    if (memoryCache.has(projectId)) {
        return memoryCache.get(projectId);
    }
    // localStorage에서 복원
    try {
        const stored = localStorage.getItem(CACHE_KEY_PREFIX + projectId);
        if (stored) {
            const parsed = JSON.parse(stored);
            const restored = { messages: deserializeMessages(parsed.messages), hasMore: parsed.hasMore };
            memoryCache.set(projectId, restored);
            return restored;
        }
    } catch (e) { /* 파싱 실패 시 무시 */ }
    return null;
}

export function setCachedMessages(projectId, messages, hasMore) {
    const data = { messages, hasMore };
    memoryCache.set(projectId, data);
    // localStorage에 비동기적으로 저장 (성능 영향 최소화)
    try {
        localStorage.setItem(CACHE_KEY_PREFIX + projectId, JSON.stringify({
            messages: serializeMessages(messages),
            hasMore,
        }));
    } catch (e) { /* 저장 실패 시 무시 (용량 초과 등) */ }
}

export function clearChatCache(projectId) {
    if (projectId) {
        memoryCache.delete(projectId);
        localStorage.removeItem(CACHE_KEY_PREFIX + projectId);
    } else {
        memoryCache.clear();
        // localStorage에서 모든 채팅 캐시 키 삭제
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(CACHE_KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

// 메시지 전송 (미디어 확장 지원)
export async function sendMessage(projectId, { text, senderId, senderNickname, ...extra }) {
    const messagesRef = collection(db, 'projects', projectId, 'messages');
    await addDoc(messagesRef, {
        text: text || '',
        senderId,
        senderNickname,
        type: extra.type || 'text',
        mediaUrl: extra.mediaUrl || null,
        mediaName: extra.mediaName || null,
        createdAt: serverTimestamp(),
    });

    // 프로젝트 마지막 메시지 시간 기록 (뱃지용) — await로 기록 보장
    await updateDoc(doc(db, 'projects', projectId), { lastMessageAt: serverTimestamp() });
    // 마지막 읽은 시간 업데이트 (발신자 뱃지 미표시 보장: lastReadAt >= lastMessageAt)
    await updateLastRead(projectId, senderId);
}

// 마지막 읽은 시간 업데이트
export async function updateLastRead(projectId, userId) {
    const lastReadRef = doc(db, 'projects', projectId, 'chatLastRead', userId);
    await setDoc(lastReadRef, {
        lastReadAt: serverTimestamp(),
    }, { merge: true });
}

// 마지막 읽은 시간 가져오기
export async function getLastRead(projectId, userId) {
    const lastReadRef = doc(db, 'projects', projectId, 'chatLastRead', userId);
    const snap = await getDoc(lastReadRef);
    if (snap.exists()) {
        return snap.data().lastReadAt;
    }
    return null;
}

// 최근 메시지 실시간 구독 (최신 N개)
// onSnapshot 콜백에서 캐시 자동 갱신
export function subscribeToRecentMessages(projectId, limitCount, retentionDays, callback) {
    const constraints = [orderBy('createdAt', 'desc'), limit(limitCount)];

    if (retentionDays && retentionDays !== Infinity) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        constraints.unshift(where('createdAt', '>=', cutoffDate));
    }

    const q = query(
        collection(db, 'projects', projectId, 'messages'),
        ...constraints
    );

    return onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        // 시간순 정렬 (오래된 것 먼저)
        messages.reverse();

        // 캐시에 최신 구독 메시지 반영
        const existing = memoryCache.get(projectId);
        if (existing && existing.messages.length > messages.length) {
            // 이전에 로드한 오래된 메시지가 있으면 유지하고 최신부분만 갱신
            const olderMsgs = existing.messages.slice(0, existing.messages.length - limitCount);
            const merged = [...olderMsgs, ...messages];
            // 중복 제거 (id 기준)
            const seen = new Set();
            const deduped = merged.filter(m => {
                if (seen.has(m.id)) return false;
                seen.add(m.id);
                return true;
            });
            setCachedMessages(projectId, deduped, existing.hasMore);
        } else {
            setCachedMessages(projectId, messages, existing?.hasMore ?? true);
        }

        callback(messages);
    });
}

// 이전 메시지 로딩 (커서 기반 페이지네이션)
export async function loadOlderMessages(projectId, beforeTimestamp, limitCount = 20, retentionDays = Infinity) {
    const constraints = [
        orderBy('createdAt', 'desc'),
        startAfter(beforeTimestamp),
        limit(limitCount)
    ];

    if (retentionDays && retentionDays !== Infinity) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        constraints.unshift(where('createdAt', '>=', cutoffDate));
    }

    const q = query(
        collection(db, 'projects', projectId, 'messages'),
        ...constraints
    );

    const snapshot = await getDocs(q);
    const messages = [];
    snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() });
    });
    messages.reverse();
    return messages;
}

// ===== DM(직접 메시지) =====

// DM 전송: 상대방의 notifications 서브컬렉션에 저장
export async function sendDirectMessage(senderUid, recipientUid, message) {
    const { getUserProfile } = await import('./authService');
    const senderProfile = await getUserProfile(senderUid);

    await addDoc(collection(db, 'users', recipientUid, 'notifications'), {
        type: 'dm',
        senderUid,
        senderNickname: senderProfile?.nickname || '알 수 없음',
        senderEmail: senderProfile?.email || '',
        message,
        read: false,
        createdAt: serverTimestamp(),
    });
}
