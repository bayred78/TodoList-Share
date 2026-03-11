import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { setRewardUnlock, isRewardUnlocked, getRewardRemainingMs } from '../../services/subscriptionService';
import './RewardedAd.css';

// Capacitor AdMob 플러그인 — 네이티브에서만 동작
let AdMob = null;
let RewardEvents = null;

async function loadAdMob() {
    try {
        const mod = await import('@capacitor-community/admob');
        AdMob = mod.AdMob;
        RewardEvents = mod.RewardAdPluginEvents;
        return true;
    } catch {
        return false;
    }
}

/**
 * 리워드 광고 버튼 컴포넌트
 * - 시청 완료 시 KST 자정까지 Pro 해금 (22시 이후는 다음날)
 * - 서버 문제로 광고 로딩 실패 시에도 보상 지급
 * - 광고 중도 종료(강제 닫기) 시 보상 미지급
 * - 이미 해금 중이면 남은 시간 표시
 * @param {Object} profile - 사용자 프로필 (Firestore)
 * @param {Function} onReward - 보상 지급 후 호출할 콜백 (optional)
 */
export default function RewardedAd({ profile, onReward }) {
    const [adReady, setAdReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [unlocked, setUnlocked] = useState(() => isRewardUnlocked(profile));
    const [remaining, setRemaining] = useState('');
    // 만료 시간을 로컬에 캐시 (Firestore 재조회 없이 타이머 동작)
    const [cachedExpiry, setCachedExpiry] = useState(() => profile?.rewardUnlockExpiry || 0);
    const timerRef = useRef(null);
    const listenerRef = useRef(null);
    const rewardedRef = useRef(false); // 이중 지급 방지
    const isWeb = !Capacitor.isNativePlatform();

    // profile 변경 시 상태 동기화
    useEffect(() => {
        const isUnlocked = isRewardUnlocked(profile);
        setUnlocked(isUnlocked);
        if (profile?.rewardUnlockExpiry) {
            setCachedExpiry(profile.rewardUnlockExpiry);
        }
    }, [profile?.rewardUnlockExpiry]);

    // 보상 지급 처리
    const applyReward = async () => {
        if (rewardedRef.current) return; // 이미 지급됨
        rewardedRef.current = true;
        const userId = profile?.uid || profile?.id;
        try {
            const expiryUtc = await setRewardUnlock(userId);
            setCachedExpiry(expiryUtc);
            setUnlocked(true);
            updateTimerWithExpiry(expiryUtc);
            timerRef.current = setInterval(() => updateTimerWithExpiry(expiryUtc), 60000);
            setAdReady(false);
            onReward?.(); // 상위 컴포넌트에 보상 통보
        } catch (err) {
            console.warn('Reward unlock failed:', err);
            rewardedRef.current = false; // 재시도 가능하도록 복원
        }
    };

    // 남은 시간 포맷
    const formatRemaining = (ms) => {
        if (ms <= 0) return '';
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}시간 ${m}분`;
    };

    // 캐시된 만료 시간으로 타이머 업데이트
    const updateTimerWithExpiry = (expiry) => {
        if (!expiry) return;
        const ms = Math.max(0, Number(expiry) - Date.now());
        if (ms <= 0) {
            setUnlocked(false);
            setRemaining('');
            if (timerRef.current) clearInterval(timerRef.current);
            // 만료 후 광고 준비
            loadAdMob().then(ok => ok && prepareAd());
        } else {
            setUnlocked(true);
            setRemaining(formatRemaining(ms));
        }
    };

    useEffect(() => {
        loadAdMob().then(async (ok) => {
            if (ok) {
                // ✅ Rewarded 이벤트 리스너 등록 (await 필수 — Capacitor 6+)
                if (RewardEvents) {
                    listenerRef.current = await AdMob.addListener(
                        RewardEvents.Rewarded,
                        () => applyReward()
                    );
                }

                if (!isRewardUnlocked(profile)) {
                    prepareAd();
                }
            }
        });

        // 해금 중이면 타이머 시작
        const expiry = profile?.rewardUnlockExpiry || cachedExpiry;
        if (expiry && Date.now() < Number(expiry)) {
            updateTimerWithExpiry(expiry);
            timerRef.current = setInterval(() => updateTimerWithExpiry(expiry), 60000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (listenerRef.current?.remove) listenerRef.current.remove();
        };
    }, []);

    const prepareAd = async () => {
        if (!AdMob) return;
        try {
            await AdMob.prepareRewardVideoAd({
                adId: 'ca-app-pub-3940256099942544/5224354917', // 테스트 ID
                isTesting: true,
            });
            setAdReady(true);
        } catch (err) {
            console.warn('RewardedAd prepare failed:', err);
            setAdReady(false);
        }
    };

    const handleWatch = async () => {
        if (loading) return;
        setLoading(true);
        rewardedRef.current = false;
        try {
            if (AdMob) {
                await AdMob.showRewardVideoAd();
                // ★ Promise resolved = 광고 표시 후 닫힘
                // Rewarded 이벤트가 이미 발생했으면 rewardedRef.current = true
                // 중도 종료 시 Rewarded 이벤트 미발생 → 보상 없음
            } else {
                // 웹 환경 (AdMob 없음) → 바로 보상 지급
                await applyReward();
            }
        } catch (err) {
            // ★ 서버 문제 등으로 광고 로딩/표시 실패 → 보상 지급
            console.warn('RewardedAd show failed:', err);
            if (!rewardedRef.current) {
                await applyReward();
            }
        } finally {
            setLoading(false);
        }
    };

    // 해금 중
    if (unlocked) {
        return (
            <div className="rewarded-ad-status">
                <span className="rewarded-ad-badge">🎉 Pro 해금 중</span>
                {remaining && <span className="rewarded-ad-timer">{remaining} 남음</span>}
            </div>
        );
    }

    // ★ 웹 브라우저 환경 (플러그인 크래시 방어 및 무료 보상 어뷰징 방지)
    if (isWeb) return null;

    return (
        <button
            className="rewarded-ad-btn"
            onClick={handleWatch}
            disabled={loading || !adReady}
        >
            {loading ? '⏳ 광고 로딩 중...' : '🎬 광고 보고 Pro 해금 (오늘 자정까지)'}
        </button>
    );
}
