import {
    signInWithPopup,
    signInWithCredential,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import { Capacitor } from '@capacitor/core';

// Google 로그인 (네이티브/웹 분기 처리)
export async function signInWithGoogle() {
    try {
        let user;
        let calendarAccessToken = null;

        if (Capacitor.isNativePlatform()) {
            // === 네이티브 앱 (Android/iOS) ===
            // @capacitor-firebase/authentication 플러그인 사용
            // skipNativeAuth: false → 플러그인이 Firebase Auth까지 자동 처리
            const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

            const result = await FirebaseAuthentication.signInWithGoogle({
                scopes: ['https://www.googleapis.com/auth/calendar'],
            });

            // OAuth access token 추출
            calendarAccessToken = result.credential?.accessToken;

            // skipNativeAuth: false이므로 Firebase Auth가 자동으로 처리됨
            // auth.currentUser가 자동으로 설정됨
            // 하지만 타이밍 이슈가 있을 수 있으므로 명시적으로도 처리
            if (result.credential?.idToken) {
                const credential = GoogleAuthProvider.credential(result.credential.idToken);
                const userCredential = await signInWithCredential(auth, credential);
                user = userCredential.user;
            } else {
                // skipNativeAuth: false에서는 auth.currentUser가 이미 설정되어 있음
                // 잠시 대기 후 확인
                await new Promise(resolve => setTimeout(resolve, 500));
                user = auth.currentUser;
                if (!user) {
                    throw new Error('Firebase 인증 상태가 설정되지 않았습니다.');
                }
            }
        } else {
            // === 웹 브라우저 ===
            const result = await signInWithPopup(auth, googleProvider);
            user = result.user;

            // OAuth credential에서 access token 추출
            const credential = GoogleAuthProvider.credentialFromResult(result);
            calendarAccessToken = credential?.accessToken;
        }

        // 캘린더 access token이 있으면 calendarService에 저장
        if (calendarAccessToken) {
            try {
                const { saveTokenFromLogin } = await import('./calendarService');
                saveTokenFromLogin(calendarAccessToken);
            } catch (e) {
                console.warn('캘린더 토큰 저장 실패 (비필수):', e);
            }
        }

        // Firestore에 사용자 존재 확인
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        return {
            user,
            isNewUser: !userDoc.exists(),
        };
    } catch (error) {
        console.error('로그인 실패:', error);
        throw error;
    }
}

// 닉네임 설정 (신규 사용자)
export async function setupNickname(userId, nickname, email) {
    const nicknameDoc = await getDoc(doc(db, 'nicknames', nickname));
    if (nicknameDoc.exists()) {
        throw new Error('이미 사용 중인 닉네임입니다.');
    }

    const { runTransaction } = await import('firebase/firestore');
    await runTransaction(db, async (transaction) => {
        const nicknameRef = doc(db, 'nicknames', nickname);
        const nicknameSnap = await transaction.get(nicknameRef);

        if (nicknameSnap.exists()) {
            throw new Error('이미 사용 중인 닉네임입니다.');
        }

        transaction.set(nicknameRef, {
            uid: userId,
            createdAt: serverTimestamp(),
        });

        transaction.set(doc(db, 'users', userId), {
            uid: userId,
            email: email,
            nickname: nickname,
            plan: 'free',
            planExpiresAt: null,
            planUpdatedAt: null,
            nicknameChangedAt: serverTimestamp(),
            googleCalendarId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
}

// 로그아웃
export async function signOutUser() {
    if (Capacitor.isNativePlatform()) {
        try {
            const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
            await FirebaseAuthentication.signOut();
        } catch (e) {
            // 무시
        }
    }
    await firebaseSignOut(auth);
}

// 인증 상태 감시
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// 사용자 정보 가져오기
export async function getUserProfile(userId) {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
}

// 사용자 정보 실시간 감시 (인앱 구독/체험판/리워드 동적으로 동기화 용도)
export function subscribeToUserProfile(userId, callback) {
    return onSnapshot(doc(db, 'users', userId), (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() });
        } else {
            callback(null);
        }
    });
}
