import { useState, useEffect, useRef } from 'react';
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
 * - 시청 시 KST 자정까지 Pro 해금 (22시 이후는 다음날)
 * - 이미 해금 중이면 남은 시간 표시
 * @param {Function} onReward - 보상 지급 후 호출할 콜백 (optional)
 */
export default function RewardedAd({ onReward }) {
    const [adReady, setAdReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [unlocked, setUnlocked] = useState(isRewardUnlocked());
    const [remaining, setRemaining] = useState('');
    const timerRef = useRef(null);
    const listenerRef = useRef(null);
    const rewardedRef = useRef(false); // 이중 지급 방지

    // 보상 지급 처리
    const applyReward = () => {
        if (rewardedRef.current) return; // 이미 지급됨
        rewardedRef.current = true;
        setRewardUnlock();
        setUnlocked(true);
        updateTimer();
        timerRef.current = setInterval(updateTimer, 60000);
        setAdReady(false);
        onReward?.(); // 상위 컴포넌트에 보상 통보
    };

    // 남은 시간 포맷
    const formatRemaining = (ms) => {
        if (ms <= 0) return '';
        const h = Math.floor(ms / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}시간 ${m}분`;
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

                if (!isRewardUnlocked()) {
                    prepareAd();
                }
            }
        });

        // 해금 중이면 타이머 시작
        if (isRewardUnlocked()) {
            updateTimer();
            timerRef.current = setInterval(updateTimer, 60000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (listenerRef.current?.remove) listenerRef.current.remove();
        };
    }, []);

    const updateTimer = () => {
        const ms = getRewardRemainingMs();
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
            }
        } catch (err) {
            console.warn('RewardedAd show failed:', err);
        } finally {
            // ✅ 광고 성공/실패 무관하게 항상 보상 지급
            if (!rewardedRef.current) {
                applyReward();
            }
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

    return (
        <button
            className="rewarded-ad-btn"
            onClick={handleWatch}
            disabled={loading}
        >
            {loading ? '⏳ 광고 로딩 중...' : '🎬 광고 보고 Pro 해금 (오늘 자정까지)'}
        </button>
    );
}

