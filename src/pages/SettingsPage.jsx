import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { changeNickname } from '../services/userService';
import PlanCompareTable from '../components/common/PlanCompareTable';
import { getEffectivePlan, getUserPlan, isTrialActive, isTrialUsed, startFreeTrial } from '../services/subscriptionService';
import { getNotificationSettings, saveNotificationSettings, registerPushNotifications } from '../services/notificationService';
import RewardedAd from '../components/ads/RewardedAd';
import PageHeader from '../components/common/PageHeader';
import './SettingsPage.css';

export default function SettingsPage() {
    const { profile, logout, refreshProfile } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);
    const navigate = useNavigate();

    const [nickname, setNickname] = useState('');
    const [changingNickname, setChangingNickname] = useState(false);
    const [nicknameEditing, setNicknameEditing] = useState(false);
    const [devTapCount, setDevTapCount] = useState(0);
    const [devMode, setDevMode] = useState(() => localStorage.getItem('devMode') === 'true');
    const [notiSettings, setNotiSettings] = useState(() => getNotificationSettings(profile));
    const [notiSaving, setNotiSaving] = useState(false);

    useEffect(() => {
        if (profile) {
            setNickname(profile.nickname || '');
            setNotiSettings(getNotificationSettings(profile));
        }
    }, [profile]);

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

                    {/* 무과금자용 빠른 혜택 버튼 모음 (상단 배치) */}
                    {getUserPlan(profile) === 'free' && (
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            {!isTrialUsed(profile) && (
                                <button className="btn btn-secondary btn-block" style={{ marginBottom: 'var(--spacing-sm)' }}
                                    onClick={async () => {
                                        if (window.confirm('Pro 7일 체험을 시작하시겠습니까?\n체험 기간 동안 모든 Pro 기능을 무료로 사용할 수 있습니다.')) {
                                            try {
                                                await startFreeTrial(profile?.uid || profile?.id, profile);
                                                refreshProfile();
                                            } catch (e) {
                                                console.error(e);
                                                addToast('체험 시작 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
                                            }
                                        }
                                    }}>
                                    🎁 7일 무료 체험 시작
                                </button>
                            )}
                            <RewardedAd profile={profile} />
                        </div>
                    )}

                    {/* 공유 플랜 비교표 (구독 버튼 활성화) */}
                    <PlanCompareTable
                        currentPlan={getUserPlan(profile)}
                        profile={profile}
                        onTrialStart={() => refreshProfile()}
                        onSubscribe={(plan, period) => {
                            addToast(`${plan === 'pro' ? 'Pro' : 'Team'} ${period === 'monthly' ? '월간' : '연간'} 구독을 준비 중입니다...`, 'info');
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
