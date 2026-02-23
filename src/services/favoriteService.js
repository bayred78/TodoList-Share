import {
    collection, doc, addDoc, deleteDoc, getDocs, updateDoc,
    query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ===== 체크리스트 즐겨찾기 =====

export function subscribeToFavoriteItems(uid, callback) {
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'item')
    );
    return onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
        callback(items);
    });
}

export async function addFavoriteItem(uid, projectId, itemId, title, projectName) {
    // 중복 체크
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'item'),
        where('projectId', '==', projectId),
        where('itemId', '==', itemId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return;
    await addDoc(collection(db, 'users', uid, 'favorites'), {
        type: 'item',
        projectId,
        itemId,
        title,
        projectName,
        addedAt: serverTimestamp(),
    });
}

export async function removeFavoriteItem(uid, projectId, itemId) {
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'item'),
        where('projectId', '==', projectId),
        where('itemId', '==', itemId)
    );
    const snap = await getDocs(q);
    const deletes = [];
    snap.forEach(d => deletes.push(deleteDoc(d.ref)));
    await Promise.all(deletes);
}

// ===== 친구 즐겨찾기 =====

export function subscribeToFavoriteFriends(uid, callback) {
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'friend')
    );
    return onSnapshot(q, (snapshot) => {
        const friends = [];
        snapshot.forEach(d => friends.push({ id: d.id, ...d.data() }));
        friends.sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
        callback(friends);
    });
}

export async function addFavoriteFriend(uid, friendUid, nickname) {
    // 중복 체크
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'friend'),
        where('friendUid', '==', friendUid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return; // 이미 존재
    await addDoc(collection(db, 'users', uid, 'favorites'), {
        type: 'friend',
        friendUid,
        nickname,
        memo: '',
        addedAt: serverTimestamp(),
    });
}

export async function removeFavoriteFriend(uid, friendUid) {
    const q = query(
        collection(db, 'users', uid, 'favorites'),
        where('type', '==', 'friend'),
        where('friendUid', '==', friendUid)
    );
    const snap = await getDocs(q);
    const deletes = [];
    snap.forEach(d => deletes.push(deleteDoc(d.ref)));
    await Promise.all(deletes);
}

export async function updateFriendMemo(uid, favDocId, memo) {
    await updateDoc(doc(db, 'users', uid, 'favorites', favDocId), { memo });
}
