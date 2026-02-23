import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// 사용자 프로필 업데이트
export async function updateUserProfile(userId, data) {
    await updateDoc(doc(db, 'users', userId), {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

// 닉네임 변경 (7일 제한)
export async function changeNickname(userId, newNickname) {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();

    // 마지막 변경으로부터 7일 경과 확인
    if (userData.nicknameChangedAt) {
        const lastChanged = userData.nicknameChangedAt.toDate();
        const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
            const remainingDays = Math.ceil(7 - daysSince);
            throw new Error(`${remainingDays}일 후에 닉네임을 변경할 수 있습니다.`);
        }
    }

    // 닉네임 유니크 확인 및 변경 (트랜잭션)
    const { runTransaction } = await import('firebase/firestore');
    await runTransaction(db, async (transaction) => {
        const newNicknameRef = doc(db, 'nicknames', newNickname);
        const newNicknameSnap = await transaction.get(newNicknameRef);

        if (newNicknameSnap.exists()) {
            throw new Error('이미 사용 중인 닉네임입니다.');
        }

        // 기존 닉네임 삭제
        const oldNicknameRef = doc(db, 'nicknames', userData.nickname);
        transaction.delete(oldNicknameRef);

        // 새 닉네임 등록
        transaction.set(newNicknameRef, {
            uid: userId,
            createdAt: serverTimestamp(),
        });

        // 사용자 문서 업데이트
        transaction.update(doc(db, 'users', userId), {
            nickname: newNickname,
            nicknameChangedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
}

// 닉네임 또는 이메일로 사용자 검색
export async function findUserByNicknameOrEmail(input) {
    if (input.includes('@')) {
        // 이메일로 검색
        try {
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const usersQuery = query(
                collection(db, 'users'),
                where('email', '==', input.toLowerCase())
            );
            const usersSnap = await getDocs(usersQuery);
            if (!usersSnap.empty) {
                const userDoc = usersSnap.docs[0];
                return { id: userDoc.id, ...userDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('이메일 검색 실패:', error);
            return null;
        }
    }
    return findUserByNickname(input);
}

// 닉네임으로 사용자 검색
export async function findUserByNickname(nickname) {
    try {
        // 1차: nicknames 컬렉션에서 조회
        const nicknameDoc = await getDoc(doc(db, 'nicknames', nickname));
        if (nicknameDoc.exists()) {
            const uid = nicknameDoc.data().uid;
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                return { id: userDoc.id, ...userDoc.data() };
            }
        }

        // 2차: nicknames에 없으면 users 컬렉션에서 직접 검색 (폴백)
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const usersQuery = query(
            collection(db, 'users'),
            where('nickname', '==', nickname)
        );
        const usersSnap = await getDocs(usersQuery);
        if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            return { id: userDoc.id, ...userDoc.data() };
        }

        return null;
    } catch (error) {
        console.error('닉네임 검색 실패:', error);
        return null;
    }
}
