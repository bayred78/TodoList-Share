import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { changeNickname } from '../services/userService';
import PlanCompareTable from '../components/common/PlanCompareTable';
import { checkPersonalFeature, getEffectivePlan, getUserPlan, isTrialActive, isTrialUsed, startFreeTrial, syncSubscriptionWithRevenueCat } from '../services/subscriptionService';
import { getNotificationSettings, saveNotificationSettings, registerPushNotifications } from '../services/notificationService';
import RewardedAd from '../components/ads/RewardedAd';
import PageHeader from '../components/common/PageHeader';
import useThemeStore from '../stores/themeStore';
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
    const [dueDateUnit, setDueDateUnit] = useState('day');
    const [dueDateValue, setDueDateValue] = useState(1);
    const [products, setProducts] = useState(null);
    const [installPrompt, setInstallPrompt] = useState(
        typeof window !== 'undefined' ? window.deferredPWAInstallPrompt : null
    );

    useEffect(() => {
        const onReady = () => setInstallPrompt(window.deferredPWAInstallPrompt);
        const onInstalled = () => setInstallPrompt(null);
        window.addEventListener('pwa-prompt-ready', onReady);
        window.addEventListener('pwa-app-installed', onInstalled);
        return () => {
            window.removeEventListener('pwa-prompt-ready', onReady);
            window.removeEventListener('pwa-app-installed', onInstalled);
        };
    }, []);

    const handleInstallClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!installPrompt) return;
        try {
            installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === 'accepted') {
                setInstallPrompt(null);
                window.deferredPWAInstallPrompt = null;
                addToast('앱이 성공적으로 설치되었습니다! 🎉', 'success');
            }
        } catch (err) {
            console.warn('PWA 설치 오류:', err);
        }
    };

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
    const canUseDueDate = checkPersonalFeature(profile, 'dueDateNotification');
    const handleNotiToggle = async (key) => {
        const updated = { ...notiSettings, [key]: !notiSettings[key] };
        // 전체 OFF 시 개별도 모두 OFF
        if (key === 'enabled' && !updated.enabled) {
            updated.itemCreate = false;
            updated.itemChange = false;
            updated.chat = false;
            updated.comment = false;
            updated.dm = false;
            updated.invitation = false;
            updated.dueDate = false;
        }
        // 전체 ON 시 개별도 모두 ON
        if (key === 'enabled' && updated.enabled) {
            updated.itemCreate = true;
            updated.itemChange = true;
            updated.chat = true;
            updated.comment = true;
            updated.dm = true;
            updated.invitation = true;
            updated.dueDate = canUseDueDate;
        }
        // 개별 하나라도 ON이면 전체도 ON
        if (key !== 'enabled') {
            const anyOn = updated.itemCreate || updated.itemChange || updated.chat || updated.comment || updated.dm || updated.invitation || updated.dueDate;
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

    // 마감일 알림 규칙 핸들러
    const MINUTE_OPTIONS = [5, 10, 15, 30, 45];
    const getValueRange = (unit) => {
        if (unit === 'month') return Array.from({ length: 12 }, (_, i) => i + 1);
        if (unit === 'day') return Array.from({ length: 30 }, (_, i) => i + 1);
        if (unit === 'hour') return Array.from({ length: 23 }, (_, i) => i + 1);
        return MINUTE_OPTIONS;
    };
    const UNIT_LABEL = { month: '개월', day: '일', hour: '시간', minute: '분' };

    const handleAddDueDateRule = async () => {
        if (!canUseDueDate) return;
        const rules = notiSettings.dueDateRules || [];
        if (rules.length >= 5) { addToast('최대 5개까지 추가할 수 있습니다.', 'warning'); return; }
        if (rules.some(r => r.unit === dueDateUnit && r.value === dueDateValue)) {
            addToast('이미 추가된 규칙입니다.', 'warning'); return;
        }
        const updated = { ...notiSettings, dueDateRules: [...rules, { unit: dueDateUnit, value: dueDateValue }] };
        setNotiSettings(updated);
        setNotiSaving(true);
        try { await saveNotificationSettings(profile?.uid, updated); }
        catch { addToast('저장 실패', 'error'); }
        finally { setNotiSaving(false); }
    };

    const handleRemoveDueDateRule = async (idx) => {
        const newRules = (notiSettings.dueDateRules || []).filter((_, i) => i !== idx);
        const updated = { ...notiSettings, dueDateRules: newRules };
        setNotiSettings(updated);
        setNotiSaving(true);
        try { await saveNotificationSettings(profile?.uid, updated); }
        catch { addToast('저장 실패', 'error'); }
        finally { setNotiSaving(false); }
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


                {/* 웹 버전 안내 (클릭 시 복사 기능 포함) */}
                <div
                    className="settings-card card web-url-banner"
                    onClick={() => {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText('https://todolist-share.web.app').then(() => {
                                addToast('웹 주소가 클립보드에 복사되었습니다.', 'success');
                            }).catch(() => {
                                addToast('복사를 지원하지 않는 기기입니다.', 'warning');
                            });
                        } else {
                            addToast('복사 기능이 지원되지 않는 브라우저입니다.', 'warning');
                        }
                    }}
                >
                    <div className="web-url-content">
                        <div className="web-url-left">
                            <span className="web-url-icon">🌐</span>
                            <div className="web-url-details">
                                <p className="web-url-label">PC 웹 버전 주소 (클릭하여 복사)</p>
                                <p className="web-url-link">todolist-share.web.app</p>
                            </div>
                        </div>
                        {installPrompt && (
                            <button
                                type="button"
                                className="pwa-install-block"
                                onClick={handleInstallClick}
                                aria-label="앱으로 설치"
                            >
                                <span className="pwa-install-icon">📲</span>
                                <div className="pwa-install-info">
                                    <span className="pwa-install-title">앱으로 설치</span>
                                    <span className="pwa-install-hint">더 빠르게 접속</span>
                                </div>
                            </button>
                        )}
                    </div>
                </div>


                {/* 화면 테마 */}
                <div className="settings-card card">
                    <h3 className="settings-card-title">🎨 화면 테마</h3>
                    <div className="settings-row">
                        <span>테마 모드</span>
                        <select
                            className="settings-select"
                            value={useThemeStore((s) => s.theme)}
                            onChange={(e) => useThemeStore.getState().setTheme(e.target.value)}
                        >
                            <option value="system">시스템</option>
                            <option value="light">라이트</option>
                            <option value="dark">다크</option>
                        </select>
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
                            <span>💬 댓글</span>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={notiSettings.comment} onChange={() => handleNotiToggle('comment')} disabled={notiSaving} />
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
                        {/* 마감일 예약 알림 — Pro/Team 전용 */}
                        <div className="noti-setting-row">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                ⏰ 마감일 예약 알림
                                {!canUseDueDate && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '0 var(--spacing-xs)' }}>Pro</span>}
                            </span>
                            <label className="toggle-switch">
                                <input type="checkbox"
                                    checked={notiSettings.dueDate || false}
                                    onChange={() => canUseDueDate && handleNotiToggle('dueDate')}
                                    disabled={notiSaving || !canUseDueDate} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                        {notiSettings.dueDate && canUseDueDate && (
                            <div style={{ padding: '0 var(--spacing-md) var(--spacing-sm)' }}>
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: '0 0 var(--spacing-xs)' }}>
                                    💡 마감일 전 원하는 시간에 알림(체크리스트 개별 설정 필요)을 받을 수 있습니다.
                                </p>
                                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                                    <select value={dueDateUnit} onChange={e => { setDueDateUnit(e.target.value); setDueDateValue(getValueRange(e.target.value)[0]); }}
                                        style={{ flex: 1, padding: 'var(--spacing-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                        <option value="month">개월</option>
                                        <option value="day">일</option>
                                        <option value="hour">시간</option>
                                        <option value="minute">분</option>
                                    </select>
                                    <select value={dueDateValue} onChange={e => setDueDateValue(Number(e.target.value))}
                                        style={{ flex: 1, padding: 'var(--spacing-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                        {getValueRange(dueDateUnit).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <button type="button" onClick={handleAddDueDateRule} disabled={notiSaving}
                                        style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #fff)', border: 'none', cursor: 'pointer' }}>
                                        추가
                                    </button>
                                </div>
                                {(notiSettings.dueDateRules || []).length > 0 && (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                        {(notiSettings.dueDateRules || []).map((r, i) => (
                                            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-xs) 0', fontSize: 'var(--font-size-sm)' }}>
                                                <span>{r.value}{UNIT_LABEL[r.unit]} 전</span>
                                                <button onClick={() => handleRemoveDueDateRule(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-md)', color: 'var(--color-text-secondary)' }}>✕</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
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
                        onReward={() => refreshProfile()}
                        onSubscribe={async (plan, period) => {
                            if (!Capacitor.isNativePlatform()) {
                                addToast('웹 결제 시스템은 준비 중입니다. 당분간 모바일 앱을 통해 결제해 주세요.', 'warning');
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
                                const isCancelled = e.userCancelled === true || e.code === 1 || String(e.message).toLowerCase().includes('cancel');
                                if (!isCancelled) {
                                    addToast('결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
                                }
                                // 단순 취소 시: 추가 토스트 없음 (이미 "결제를 준비 중..." 안내가 노출됨)
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
