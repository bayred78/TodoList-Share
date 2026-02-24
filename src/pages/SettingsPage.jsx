import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { changeNickname } from '../services/userService';
import PlanCompareTable from '../components/common/PlanCompareTable';
import { getEffectivePlan, getUserPlan, isTrialActive } from '../services/subscriptionService';
import RewardedAd from '../components/ads/RewardedAd';
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

    useEffect(() => {
        if (profile) {
            setNickname(profile.nickname || '');
        }
    }, [profile]);

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

    const handleChangeNickname = async () => {
        if (!nickname.trim() || nickname.trim() === profile?.nickname) {
            setNicknameEditing(false);
            return;
        }
        if (nickname.trim().length < 2 || nickname.trim().length > 20) {
            addToast('닉네임은 2~20자로 입력해주세요.', 'warning');
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
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button className="page-header-back" onClick={() => navigate('/')}>←</button>
                        <h1>설정</h1>
                    </div>
                </div>

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



                {/* 구독 */}
                <div className="settings-card card">
                    <h3 className="settings-card-title">💎 프리미엄 구독</h3>
                    <p className="settings-description">
                        현재 플랜: <strong>
                            {(() => {
                                const ep = getEffectivePlan(profile);
                                return ep === 'team' ? 'Team' : ep === 'pro' ? 'Pro' : '무료';
                            })()}
                            {isTrialActive(profile) && ' (체험 중)'}
                        </strong>
                    </p>
                    <RewardedAd profile={profile} />

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
                        style={{ cursor: 'default', userSelect: 'none' }}
                    >
                        TodoList Share v1.0.0
                    </p>
                    {devMode && (
                        <button
                            className="btn btn-secondary btn-sm"
                            style={{ marginTop: 8 }}
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
