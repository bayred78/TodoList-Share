import { useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
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

export default function BannerAd({ userPlan = 'free', isTrialActive = false }) {
    const [isNative, setIsNative] = useState(false);
    const keyboardOpenRef = useRef(false);
    const sizeListenerRef = useRef(null);

    // ★ 웹 브라우저 환경 (플러그인 크래시 방어용)
    const isWeb = !Capacitor.isNativePlatform();

    useEffect(() => {
        // ★ 구독자(Pro/Team), 체험 중 또는 웹(AdMob 불가) 환경: 광고 숨김
        if (userPlan !== 'free' || isTrialActive || isWeb) {
            document.body.classList.remove('has-banner-ad');
            document.body.style.setProperty('--banner-height', '0px');
            if (!isWeb) {
                loadAdMob().then(() => {
                    if (AdMob) {
                        AdMob.hideBanner?.().catch(() => { });
                    }
                });
            }
            return;
        }
        // 무료 사용자: 광고 초기화
        document.body.classList.add('has-banner-ad');
        // ★ CSS 변수를 즉시 설정 — initAd 비동기 완료를 기다리지 않음
        document.body.style.setProperty('--banner-height', '60px');
        initAd();

        // ★ 키보드 활성 감지 → 배너 숨김/복원 (앱 전체 적용)
        const vv = window.visualViewport;
        let maxViewportHeight = vv?.height || 0;

        const onViewportResize = () => {
            // 화면 회전 등으로 높이가 최대치 갱신된 경우 저장
            if (vv.height > maxViewportHeight) {
                maxViewportHeight = vv.height;
            }

            // 기존보다 높이가 150px 이상 급감하면 키보드가 올라온 것으로 판단
            const isKeyboardOpen = (maxViewportHeight - vv.height) > 150;

            if (isKeyboardOpen && !keyboardOpenRef.current) {
                keyboardOpenRef.current = true;
                document.body.style.setProperty('--banner-height', '0px');
                if (AdMob) AdMob.hideBanner?.().catch(() => { });
            } else if (!isKeyboardOpen && keyboardOpenRef.current) {
                keyboardOpenRef.current = false;
                document.body.style.setProperty('--banner-height', '60px');
                if (AdMob) AdMob.resumeBanner?.().catch(() => { });
            }
        };
        if (vv) vv.addEventListener('resize', onViewportResize);

        return () => {
            document.body.classList.remove('has-banner-ad');
            document.body.style.setProperty('--banner-height', '0px');
            if (vv) vv.removeEventListener('resize', onViewportResize);
            if (sizeListenerRef.current) {
                sizeListenerRef.current.remove();
                sizeListenerRef.current = null;
            }
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
                sizeListenerRef.current = await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info) => {
                    // 키보드가 활성화되어 있지 않을 때만 배너 높이 갱신
                    if (!keyboardOpenRef.current) {
                        const h = info.height || 60;
                        document.body.style.setProperty('--banner-height', h + 'px');
                    }
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
            if (!keyboardOpenRef.current) {
                document.body.style.setProperty('--banner-height', '60px');
            }
        } catch (error) {
            console.log('AdMob 초기화 실패 (웹 환경에서는 정상):', error);
        }
    }

    // ★ 구독자 및 체험자는 광고 및 패딩 완전 제거
    // (웹버전도 아직 수동 광고 세팅용 아이디가 없으므로 일단 렌더링 무시)
    if (userPlan !== 'free' || isTrialActive || isWeb) {
        return null;
    }

    // 웹 환경에서는 원래 광고 대신 빈 패딩 영역이나 구글 애드센스 등 표시
    if (!isNative) {
        return <div className="banner-ad-placeholder" />;
    }

    // 네이티브에서는 AdMob이 직접 하단에 배너를 렌더링하므로 패딩만 추가
    return <div className="banner-ad-spacer" />;
}

