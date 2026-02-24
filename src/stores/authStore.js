import { create } from 'zustand';
import { onAuthChange, getUserProfile, signInWithGoogle, signOutUser, setupNickname } from '../services/authService';

const useAuthStore = create((set, get) => ({
    user: null,
    profile: null,
    loading: true,
    isNewUser: false,

    // 인증 상태 초기화
    initialize: () => {
        return onAuthChange(async (firebaseUser) => {
            if (firebaseUser) {
                const profile = await getUserProfile(firebaseUser.uid);
                set({
                    user: firebaseUser,
                    profile: profile,
                    loading: false,
                    isNewUser: !profile,
                });
                // FCM 토큰 자동 등록 (알림 설정 활성화 시)
                if (profile?.notificationSettings?.enabled !== false) {
                    import('../services/notificationService').then(({ registerPushNotifications }) => {
                        registerPushNotifications(firebaseUser.uid);
                    }).catch((e) => console.warn('FCM 등록 실패:', e));
                }
            } else {
                set({
                    user: null,
                    profile: null,
                    loading: false,
                    isNewUser: false,
                });
            }
        });
    },

    // Google 로그인
    login: async () => {
        try {
            const { user, isNewUser } = await signInWithGoogle();
            if (isNewUser) {
                set({ isNewUser: true, user });
            }
        } catch (error) {
            console.error('로그인 실패:', error);
            throw error;
        }
    },

    // 닉네임 설정 (신규 사용자)
    setNickname: async (nickname) => {
        const { user } = get();
        if (!user) throw new Error('로그인이 필요합니다.');

        await setupNickname(user.uid, nickname, user.email);
        const profile = await getUserProfile(user.uid);
        set({ profile, isNewUser: false });
    },

    // 프로필 업데이트
    refreshProfile: async () => {
        const { user } = get();
        if (!user) return;
        const profile = await getUserProfile(user.uid);
        set({ profile });
    },

    // 로그아웃
    logout: async () => {
        const { clearChatCache } = await import('../services/chatService');
        clearChatCache(); // 모든 채팅 캐시 삭제
        await signOutUser();
        set({ user: null, profile: null, isNewUser: false });
    },
}));

export default useAuthStore;
