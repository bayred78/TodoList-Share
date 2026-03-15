import {
    collection, addDoc, deleteDoc, doc,
    query, orderBy, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

// 댓글 추가
export async function addComment(projectId, itemId, { uid, nickname, text }) {
    const commentsRef = collection(db, 'projects', projectId, 'items', itemId, 'comments');
    await addDoc(commentsRef, {
        text,
        authorId: uid,
        authorNickname: nickname,
        createdAt: serverTimestamp(),
    });
}

// 댓글 실시간 구독
export function subscribeToComments(projectId, itemId, callback) {
    const q = query(
        collection(db, 'projects', projectId, 'items', itemId, 'comments'),
        orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
        const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(comments);
    });
}

// 댓글 삭제 (본인 또는 관리자 — 권한은 firestore.rules에서 강제)
export async function deleteComment(projectId, itemId, commentId) {
    await deleteDoc(doc(db, 'projects', projectId, 'items', itemId, 'comments', commentId));
}
