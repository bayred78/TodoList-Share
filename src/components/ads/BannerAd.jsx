import { useEffect, useState } from 'react';
import './BannerAd.css';

// Capacitor AdMob 플러그인 - 네이티브에서만 동작
let AdMob = null;
let BannerAdSize = null;
let BannerAdPosition = null;
let BannerAdPluginEvents = null;

async function loadAdMob() {
    try {
        const mod = await import('@capacitor-community/admob');
        AdMob = mod.AdMob;
        BannerAdSize = mod.BannerAdSize;
        BannerAdPosition = mod.BannerAdPosition;
        BannerAdPluginEvents = mod.BannerAdPluginEvents;
        return true;
    } catch {
        return false;
    }
}

// ★ 풀스크린 편집기 등에서 배너를 일시 숨기고 다시 표시하는 유틸
export async function hideBannerAd() {
    if (!AdMob) await loadAdMob();
    try { await AdMob?.hideBanner(); } catch { }
}

export async function showBannerAd() {
    if (!AdMob) await loadAdMob();
    try { await AdMob?.resumeBanner(); } catch { }
}

export default function BannerAd({ userPlan = 'free' }) {
    const [isNative, setIsNative] = useState(false);

    useEffect(() => {
        // ★ 구독자(Pro/Team): 광고 숨김
        if (userPlan !== 'free') {
            document.body.classList.remove('has-banner-ad');
            document.documentElement.style.setProperty('--banner-height', '0px');
            loadAdMob().then(() => {
                if (AdMob) {
                    AdMob.hideBanner?.().catch(() => { });
                }
            });
            return;
        }
        // 무료 사용자: 광고 초기화
        document.body.classList.add('has-banner-ad');
        // ★ CSS 변수를 즉시 설정 — initAd 비동기 완료를 기다리지 않음
        document.documentElement.style.setProperty('--banner-height', '60px');
        initAd();

        // ★ 키보드 활성 감지 → 배너 숨김/복원 (앱 전체 적용)
        const vv = window.visualViewport;
        let keyboardOpen = false;
        const onViewportResize = () => {
            if (!AdMob) return;
            const ratio = vv.height / window.screen.height;
            if (ratio < 0.75 && !keyboardOpen) {
                keyboardOpen = true;
                AdMob.hideBanner?.().catch(() => { });
                document.documentElement.style.setProperty('--banner-height', '0px');
            } else if (ratio >= 0.75 && keyboardOpen) {
                keyboardOpen = false;
                AdMob.resumeBanner?.().catch(() => { });
                document.documentElement.style.setProperty('--banner-height', '60px');
            }
        };
        if (vv) vv.addEventListener('resize', onViewportResize);

        return () => {
            document.body.classList.remove('has-banner-ad');
            document.documentElement.style.setProperty('--banner-height', '0px');
            if (vv) vv.removeEventListener('resize', onViewportResize);
        };
    }, [userPlan]);

    async function initAd() {
        const loaded = await loadAdMob();
        if (!loaded || !AdMob) return;

        try {
            // AdMob 초기화
            await AdMob.initialize({
                initializeForTesting: true, // 프로덕션 시 false로 변경
            });

            setIsNative(true);

            // ★ 배너 크기 변경 감지 → CSS 변수에 실제 높이 반영
            if (BannerAdPluginEvents) {
                AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info) => {
                    const h = info.height || 60;
                    document.documentElement.style.setProperty('--banner-height', h + 'px');
                });
            }

            // 하단 배너 표시
            await AdMob.showBanner({
                adId: 'ca-app-pub-3940256099942544/9214589741', // Google 공식 테스트 배너 ID
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
            });

            // SizeChanged가 발동하지 않을 경우를 대비한 기본값
            document.documentElement.style.setProperty('--banner-height', '60px');
        } catch (error) {
            console.log('AdMob 초기화 실패 (웹 환경에서는 정상):', error);
        }
    }

    // ★ 구독자는 광고 및 패딩 완전 제거
    if (userPlan !== 'free') {
        return null;
    }

    // 웹 환경에서는 광고 대신 빈 패딩 영역 표시
    if (!isNative) {
        return <div className="banner-ad-placeholder" />;
    }

    // 네이티브에서는 AdMob이 직접 하단에 배너를 렌더링하므로 패딩만 추가
    return <div className="banner-ad-spacer" />;
}

