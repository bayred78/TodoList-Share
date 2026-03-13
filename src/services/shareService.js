import { doc, setDoc, getDoc, deleteDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * 공유 아이템 생성 (스냅샷)
 * @returns {string} shareId
 */
export async function createSharedItem(projectId, itemId, item, sharedByUid, sharedByName, projectName) {
    const shareId = `${itemId}_${Date.now().toString(36)}`;
    const data = {
        projectId,
        itemId,
        title: item.title || '',
        contentBlocks: item.contentBlocks || [],
        dueDate: item.dueDate || null,
        checked: !!item.checked,
        color: item.color || null,
        labels: item.labels || [],
        repeatType: item.repeatType || null,
        sharedBy: sharedByUid,
        sharedByName,
        projectName: projectName || '',
        sharedAt: Timestamp.now(),
    };
    await setDoc(doc(db, 'sharedItems', shareId), data);
    return shareId;
}

/**
 * 공유 아이템 조회 (비인증 가능)
 */
export async function getSharedItem(shareId) {
    const snap = await getDoc(doc(db, 'sharedItems', shareId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * 공유 취소 (삭제)
 */
export async function deleteSharedItem(shareId) {
    await deleteDoc(doc(db, 'sharedItems', shareId));
}

/**
 * 특정 아이템의 내 공유 목록 조회
 */
export async function getSharedItemsByItemId(itemId, uid) {
    const q = query(
        collection(db, 'sharedItems'),
        where('itemId', '==', itemId),
        where('sharedBy', '==', uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 특정 아이템의 모든 공유 스냅샷 삭제 (아이템 삭제 시 정리용)
 */
export async function deleteAllSharesForItem(itemId) {
    const q = query(
        collection(db, 'sharedItems'),
        where('itemId', '==', itemId)
    );
    const snap = await getDocs(q);
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
}
