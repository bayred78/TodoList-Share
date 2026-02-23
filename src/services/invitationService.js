import {
    collection, doc, addDoc, updateDoc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion
} from 'firebase/firestore';
import { db } from './firebase';

// 사용자 초대
export async function inviteUser(projectId, projectName, inviterId, inviterNickname, inviteeId, inviteeNickname, role = 'readwrite') {
    // 이미 멤버인지 확인
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    const project = projectDoc.data();
    if (project.members && project.members[inviteeId]) {
        throw new Error('이미 프로젝트에 참여 중인 사용자입니다.');
    }

    // 이미 초대 중인지 확인
    const existingInvite = await getDocs(
        query(
            collection(db, 'invitations'),
            where('projectId', '==', projectId),
            where('inviterId', '==', inviterId),
            where('inviteeId', '==', inviteeId),
            where('status', '==', 'pending')
        )
    );
    if (!existingInvite.empty) {
        throw new Error('이미 초대가 전송된 사용자입니다.');
    }

    const inviteRef = await addDoc(collection(db, 'invitations'), {
        projectId,
        projectName,
        inviterId,
        inviterNickname,
        inviteeId,
        inviteeNickname,
        role,
        status: 'pending',
        createdAt: serverTimestamp(),
        respondedAt: null,
    });

    return inviteRef.id;
}

// 초대 수락
export async function acceptInvitation(invitationId, displayName = '') {
    const inviteDoc = await getDoc(doc(db, 'invitations', invitationId));
    if (!inviteDoc.exists()) throw new Error('초대를 찾을 수 없습니다.');

    const invite = inviteDoc.data();
    const projectRef = doc(db, 'projects', invite.projectId);

    // 프로젝트 읽기 없이 바로 멤버 추가 (비멤버는 프로젝트 읽기 불가)
    const { increment } = await import('firebase/firestore');

    await updateDoc(projectRef, {
        [`members.${invite.inviteeId}`]: {
            nickname: invite.inviteeNickname,
            displayName: displayName,
            role: invite.role,
            joinedAt: new Date().toISOString(),
        },
        memberUIDs: arrayUnion(invite.inviteeId),
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
    });

    // 초대 상태 업데이트
    await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'accepted',
        respondedAt: serverTimestamp(),
    });
}

// 초대 거절
export async function rejectInvitation(invitationId) {
    await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'rejected',
        respondedAt: serverTimestamp(),
    });
}

// 내 초대 목록 실시간 구독
export function subscribeToMyInvitations(userId, callback) {
    // 복합 인덱스 없이도 동작하도록 orderBy 제거
    // (Firestore에서 두 개의 where + orderBy는 복합 인덱스 필요)
    const q = query(
        collection(db, 'invitations'),
        where('inviteeId', '==', userId),
        where('status', '==', 'pending')
    );

    return onSnapshot(q, (snapshot) => {
        const invitations = [];
        snapshot.forEach((doc) => {
            invitations.push({ id: doc.id, ...doc.data() });
        });
        // 클라이언트에서 createdAt 기준 정렬
        invitations.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            return bTime - aTime;
        });
        callback(invitations);
    }, (error) => {
        console.error('초대 목록 구독 실패:', error);
        // 에러 발생해도 빈 배열 전달하여 UI 깨지지 않도록
        callback([]);
    });
}

// 내가 보낸 초대 목록 실시간 구독
export function subscribeToSentInvitations(userId, callback) {
    const q = query(
        collection(db, 'invitations'),
        where('inviterId', '==', userId)
    );

    return onSnapshot(q, (snapshot) => {
        const invitations = [];
        snapshot.forEach((doc) => {
            invitations.push({ id: doc.id, ...doc.data() });
        });
        invitations.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            return bTime - aTime;
        });
        callback(invitations);
    }, (error) => {
        console.error('보낸 초대 목록 구독 실패:', error);
        callback([]);
    });
}

// 초대 취소 (pending 상태만)
export async function cancelInvitation(invitationId) {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'invitations', invitationId));
}
