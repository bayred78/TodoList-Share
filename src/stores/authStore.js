import { create } from 'zustand';
import { onAuthChange, getUserProfile, signInWithGoogle, signOutUser, setupNickname, subscribeToUserProfile } from '../services/authService';
import { initializeRevenueCat, subscribeToCustomerInfoUpdate, getCustomerInfo } from '../services/revenueCatService';
import { syncSubscriptionWithRevenueCat } from '../services/subscriptionService';

const useAuthStore = create((set, get) => ({
    user: null,
    profile: null,
    loading: true,
    isNewUser: false,

    // 인증 상태 초기화
    initialize: () => {
        let profileUnsub = null;
        let rcListenerUnsub = null;
        let activeSessionId = 0; // 세션 구분용 플래그

        const authUnsub = onAuthChange((firebaseUser) => {
            activeSessionId++;
            const currentSession = activeSessionId;
            if (profileUnsub) {
                profileUnsub();
                profileUnsub = null;
            }
            if (rcListenerUnsub) {
                try { rcListenerUnsub.remove(); } catch (e) { }
                rcListenerUnsub = null;
            }

            if (firebaseUser) {
                // RevenueCat 초기화
                initializeRevenueCat(firebaseUser.uid).then(async () => {
                    if (currentSession !== activeSessionId) return; // 세션이 변경되었다면 리스너 등록 생략

                    // [능동적 검증] 시작할 때 영수증 정보를 강제로 가져와 만료 여부를 100% 동기화
                    if (firebaseUser?.uid) {
                        const latestInfo = await getCustomerInfo();
                        if (latestInfo) {
                            await syncSubscriptionWithRevenueCat(firebaseUser.uid, latestInfo);
                        }
                    }

                    rcListenerUnsub = subscribeToCustomerInfoUpdate((customerInfo) => {
                        console.log('RevenueCat CustomerInfo updated:', customerInfo);
                        if (firebaseUser?.uid) {
                            syncSubscriptionWithRevenueCat(firebaseUser.uid, customerInfo);
                        }
                    });
                });

                let isFirstLoad = true;
                profileUnsub = subscribeToUserProfile(firebaseUser.uid, (profile) => {
                    set({
                        user: firebaseUser,
                        profile: profile,
                        loading: false,
                        isNewUser: !profile,
                    });

                    // FCM 토큰 자동 등록 (알림 설정 활성화 시)
                    if (isFirstLoad && profile?.notificationSettings?.enabled !== false) {
                        isFirstLoad = false;
                        import('../services/notificationService').then(({ registerPushNotifications }) => {
                            registerPushNotifications(firebaseUser.uid);
                        }).catch((e) => console.warn('FCM 등록 실패:', e));
                    }
                });
            } else {
                set({
                    user: null,
                    profile: null,
                    loading: false,
                    isNewUser: false,
                });
            }
        });

        return () => {
            authUnsub();
            if (profileUnsub) {
                profileUnsub();
                profileUnsub = null;
            }
            if (rcListenerUnsub) {
                try { rcListenerUnsub.remove(); } catch (e) { }
                rcListenerUnsub = null;
            }
        };
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
