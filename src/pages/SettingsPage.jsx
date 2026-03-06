import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { changeNickname } from '../services/userService';
import PlanCompareTable from '../components/common/PlanCompareTable';
import { getEffectivePlan, getUserPlan, isTrialActive, isTrialUsed, startFreeTrial, syncSubscriptionWithRevenueCat } from '../services/subscriptionService';
import { getNotificationSettings, saveNotificationSettings, registerPushNotifications } from '../services/notificationService';
import RewardedAd from '../components/ads/RewardedAd';
import PageHeader from '../components/common/PageHeader';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { getStoreProducts, purchaseStoreProduct } from '../services/revenueCatService';
import './SettingsPage.css';

export default function SettingsPage() {
    const { user, profile, logout, refreshProfile } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);
    const navigate = useNavigate();

    const [nickname, setNickname] = useState('');
    const [changingNickname, setChangingNickname] = useState(false);
    const [nicknameEditing, setNicknameEditing] = useState(false);
    const [devTapCount, setDevTapCount] = useState(0);
    const [devMode, setDevMode] = useState(() => localStorage.getItem('devMode') === 'true');
    const [notiSettings, setNotiSettings] = useState(() => getNotificationSettings(profile));
    const [notiSaving, setNotiSaving] = useState(false);
    const [products, setProducts] = useState(null);

    useEffect(() => {
        if (profile) {
            setNickname(profile.nickname || '');
            setNotiSettings(getNotificationSettings(profile));
        }
    }, [profile]);

    useEffect(() => {
        let isMounted = true;
        // App 구동 환경이 네이티브일 때 구독 상품 정보 미리 조회
        if (Capacitor.isNativePlatform()) {
            getStoreProducts(['pro_sub:p1m', 'pro_sub:p1y', 'team_sub:t1m', 'team_sub:t1y'])
                .then(prods => {
                    if (isMounted) setProducts(prods);
                })
                .catch(e => console.error('RevenueCat products fetch error:', e));
        }

        return () => { isMounted = false; };
    }, []);

    // 알림 설정 변경 핸들러
    const handleNotiToggle = async (key) => {
        const updated = { ...notiSettings, [key]: !notiSettings[key] };
        // 전체 OFF 시 개별도 모두 OFF
        if (key === 'enabled' && !updated.enabled) {
            updated.itemCreate = false;
            updated.itemChange = false;
            updated.chat = false;
            updated.dm = false;
            updated.invitation = false;
        }
        // 전체 ON 시 개별도 모두 ON
        if (key === 'enabled' && updated.enabled) {
            updated.itemCreate = true;
            updated.itemChange = true;
            updated.chat = true;
            updated.dm = true;
            updated.invitation = true;
        }
        // 개별 하나라도 ON이면 전체도 ON
        if (key !== 'enabled') {
            const anyOn = updated.itemCreate || updated.itemChange || updated.chat || updated.dm || updated.invitation;
            updated.enabled = anyOn;
        }
        setNotiSettings(updated);
        setNotiSaving(true);
        try {
            await saveNotificationSettings(profile?.uid, updated);
            // 알림 ON 전환 시 FCM 토큰도 등록
            if (updated.enabled) {
                await registerPushNotifications(profile?.uid);
            }
        } catch (err) {
            addToast('알림 설정 저장에 실패했습니다.', 'error');
        } finally {
            setNotiSaving(false);
        }
    };

    // 닉네임 변경 가능 여부 확인
    const canChangeNickname = (() => {
        if (!profile?.nicknameChangedAt) return true;
        const lastChanged = profile.nicknameChangedAt.toDate ? profile.nicknameChangedAt.toDate() : new Date(profile.nicknameChangedAt);
        const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince >= 7;
    })();

    const daysUntilChange = (() => {
        if (!profile?.nicknameChangedAt) return 0;
        const lastChanged = profile.nicknameChangedAt.toDate ? profile.nicknameChangedAt.toDate() : new Date(profile.nicknameChangedAt);
        const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(0, Math.ceil(7 - daysSince));
    })();

    // 글자수 포인트 계산 (한글=2, 영문=1, 최대 12포인트)
    const getNamePoints = (str) => {
        let points = 0;
        for (const ch of str) {
            points += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
        }
        return points;
    };

    const handleChangeNickname = async () => {
        if (!nickname.trim() || nickname.trim() === profile?.nickname) {
            setNicknameEditing(false);
            return;
        }
        if (nickname.trim().length < 2) {
            addToast('닉네임은 최소 2자 이상 입력해주세요.', 'warning');
            return;
        }
        if (getNamePoints(nickname.trim()) > 12) {
            addToast('닉네임이 너무 깁니다. (한글 6자/영문 12자 이내)', 'warning');
            return;
        }

        setChangingNickname(true);
        try {
            await changeNickname(profile.uid, nickname.trim());
            await refreshProfile();
            setNicknameEditing(false);
            addToast('닉네임이 변경되었습니다.', 'success');
        } catch (error) {
            addToast(error.message || '닉네임 변경에 실패했습니다.', 'error');
        } finally {
            setChangingNickname(false);
        }
    };



    const handleLogout = async () => {
        if (!confirm('정말 로그아웃 하시겠습니까?')) return;
        await logout();
        navigate('/');
    };

    return (
        <div className="page">
            <div className="container">
                <PageHeader>
                    <div className="page-header-nav">
                        <button className="page-header-back" onClick={() => navigate('/')}>←</button>
                        <h1>설정</h1>
                    </div>
                </PageHeader>

                {/* 프로필 섹션 */}
                <div className="settings-card card">
                    <div className="settings-card-header">
                        <div className="settings-avatar">
                            {profile?.nickname?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="settings-profile-info">
                            <h3>{profile?.nickname}</h3>
                            <p>{profile?.email}</p>
                        </div>
                    </div>
                </div>


                {/* 알림 설정 */}
                <div className="settings-card card">
                    <h3 className="settings-card-title">🔔 알림 설정</h3>
                    <p className="settings-description">페이지 변경 사항을 푸시 알림으로 받습니다.</p>
                    <div className="noti-settings-list">
                        <div className="noti-setting-row noti-setting-main">
                            <span>전체 알림</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.enabled} onChange={() => handleNotiToggle('enabled')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="noti-setting-row">
                            <span>📝 체크리스트 생성</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.itemCreate} onChange={() => handleNotiToggle('itemCreate')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="noti-setting-row">
                            <span>✏️ 체크리스트 변경</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.itemChange} onChange={() => handleNotiToggle('itemChange')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="noti-setting-row">
                            <span>💬 채팅</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.chat} onChange={() => handleNotiToggle('chat')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="noti-setting-row">
                            <span>✉️ 메시지(DM)</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.dm} onChange={() => handleNotiToggle('dm')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        <div className="noti-setting-row">
                            <span>📨 초대</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.invitation} onChange={() => handleNotiToggle('invitation')} disabled={notiSaving} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* 구독 */}
                <div className="settings-card card">
                    <h3 className="settings-card-title">💎 프리미엄 구독</h3>
                    <p className="settings-description" style={{ marginBottom: getUserPlan(profile) === 'free' ? 'var(--spacing-sm)' : 'var(--spacing-md)' }}>
                        현재 플랜: <strong>
                            {(() => {
                                const ep = getEffectivePlan(profile);
                                return ep === 'team' ? 'Team' : ep === 'pro' ? 'Pro' : '무료';
                            })()}
                            {isTrialActive(profile) && ' (체험 중)'}
                        </strong>
                    </p>

                    {/* 공유 플랜 비교표 (구독 버튼 활성화) */}
                    <PlanCompareTable
                        currentPlan={getUserPlan(profile)}
                        profile={profile}
                        onTrialStart={() => refreshProfile()}
                        onSubscribe={async (plan, period) => {
                            if (!Capacitor.isNativePlatform()) {
                                addToast('인앱 결제는 모바일 앱 환경에서만 지원됩니다.', 'warning');
                                return;
                            }

                            if (!products || products.length === 0) {
                                addToast('스토어 상품 정보를 불러오는 중입니다. 잠시 후 진행해주세요.', 'warning');
                                return;
                            }

                            const productIdMap = {
                                pro: { monthly: 'pro_sub:p1m', yearly: 'pro_sub:p1y' },
                                team: { monthly: 'team_sub:t1m', yearly: 'team_sub:t1y' },
                            };
                            const targetId = productIdMap[plan][period];
                            const targetProduct = products.find(p => p.identifier === targetId);

                            if (!targetProduct) {
                                addToast('해당 상품 정보를 찾을 수 없습니다.', 'error');
                                return;
                            }

                            addToast('결제를 준비 중입니다...', 'info');
                            try {
                                let oldSku = null;
                                const effectivePlan = getEffectivePlan(profile); // 실제 적용 중인 플랜

                                // Pro에서 Team으로 업그레이드 시 Proration 지원
                                if (effectivePlan === 'pro' && plan === 'team') {
                                    try {
                                        const { customerInfo } = await Purchases.getCustomerInfo();
                                        const activeSubs = customerInfo?.activeSubscriptions || [];
                                        // 활성 구독 중 pro_sub: 등 식별자로 시작하는 Identifier를 찾음
                                        oldSku = activeSubs.find(sku => sku.startsWith('pro_sub:'));
                                    } catch (e) {
                                        console.warn("기존 프로 플랜 구독 SKU 정보를 찾을 수 없습니다.", e);
                                    }
                                }

                                const result = await purchaseStoreProduct(targetProduct, oldSku);
                                if (result && result.customerInfo) {
                                    await syncSubscriptionWithRevenueCat(user?.uid || profile?.uid || profile?.id, result.customerInfo);
                                }

                                addToast('구독 설정이 성공적으로 처리되었습니다!', 'success');
                                refreshProfile();
                            } catch (e) {
                                if (!e.userCancelled) {
                                    addToast(`결제 실패: ${e.message}`, 'error');
                                }
                            }
                        }}
                    />
                </div>

                {/* 로그아웃 */}
                <div className="settings-card card">
                    <button className="btn btn-danger btn-block" onClick={handleLogout}>
                        로그아웃
                    </button>
                </div>

                <div className="settings-footer">
                    <p
                        className="dev-version-text"
                        onClick={() => {
                            const next = devTapCount + 1;
                            if (next >= 7) {
                                const newMode = !devMode;
                                localStorage.setItem('devMode', newMode ? 'true' : 'false');
                                setDevMode(newMode);
                                setDevTapCount(0);
                                addToast(newMode ? '🔧 개발자 모드 활성화 — 플랜 스위치가 표시됩니다.' : '개발자 모드 비활성화', newMode ? 'success' : 'info');
                            } else {
                                setDevTapCount(next);
                                if (next >= 4) addToast(`개발자 모드까지 ${7 - next}번 남음`, 'info');
                            }
                        }}
                    >
                        TodoList Share v1.0.0
                    </p>
                    {devMode && (
                        <button
                            className="btn btn-secondary btn-sm dev-exit-btn"
                            onClick={() => {
                                localStorage.setItem('devMode', 'false');
                                setDevMode(false);
                                addToast('개발자 모드 비활성화', 'info');
                            }}
                        >
                            🔧 개발자 모드 해제
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
