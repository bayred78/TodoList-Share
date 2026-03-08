import React, { useState, useEffect } from 'react';
import useToastStore from '../../stores/toastStore';
import { isTrialUsed, isTrialActive, startFreeTrial, getTrialRemainingDays } from '../../services/subscriptionService';
import RewardedAd from '../ads/RewardedAd';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';

/**
 * Pro/Team 비교표 + 무료/참여 비교표 공유 컴포넌트
 * UpgradeModal과 SettingsPage에서 동일하게 사용
 */

// Pro/Team 기능 비교 행 데이터
const PRO_TEAM_FEATURES = [
    { label: '페이지', pro: '10개', team: '무제한' },
    { label: '참여자', pro: '5명', team: '30명' },
    { label: '체크리스트', pro: '무제한', team: '무제한' },
    { label: '채팅 기록', pro: '30일 보관', team: '30일 보관' },
    { label: '마감일/라벨/반복', pro: '무제한', team: '무제한' },
    { label: '마감일 알림', pro: '✅', team: '✅' },
    { label: '구글 캘린더 연동', pro: '✅', team: '✅' },
    { label: '광고 제거', pro: '✅', team: '✅' },
    { label: '페이지 통계', pro: '❌', team: '✅' },
    { label: '독자 초대', pro: '❌', team: '✅' },
    { label: '채팅 이미지 첨부', pro: '✅', team: '✅' },
    { label: '통합 검색', pro: '✅', team: '✅' },
    { label: '대표 아이콘', pro: '✅', team: '✅' },
];

// 무료/참여 기능 비교 행 데이터
const FREE_ACCESS_FEATURES = [
    { label: '페이지 수', free: '3개', access: '✅ 관리자 기준' },
    { label: '참여자 수', free: '2명', access: '✅ 관리자 기준' },
    { label: '체크리스트', free: '50개', access: '✅ 관리자 기준' },
    { label: '채팅 기록', free: '50건', access: '✅ 관리자 기준' },
    { label: '마감일/라벨/반복', free: '각 3개', access: '✅ 관리자 기준' },
    { label: '마감일 알림', free: '❌', access: '❌ 본인 구독 필요' },
    { label: '구글 캘린더 연동', free: '❌', access: '✅ 관리자 기준' },
    { label: '페이지 통계', free: '❌', access: '✅ 관리자기준' },
    { label: '채팅 이미지 첨부', free: '❌', access: '❌ 본인 구독 필요' },
    { label: '계정 광고 제거', free: '❌', access: '❌ 본인 구독 필요' },
    { label: '통합 검색', free: '❌', access: '✅ 관리자 기준' },
    { label: '대표 아이콘', free: '❌', access: '❌ 본인 구독 필요' },
];

export default function PlanCompareTable({ currentPlan = 'free', onSubscribe, profile, onTrialStart, onReward }) {
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [proSubType, setProSubType] = useState('unknown'); // 'monthly' | 'annual' | 'unknown'
    const addToast = useToastStore((s) => s.addToast);

    // Pro 사용자인 경우에만 구매 내역 조회 최적화
    useEffect(() => {
        let isMounted = true;
        if (currentPlan === 'pro' && Capacitor.isNativePlatform()) {
            Purchases.getCustomerInfo().then(info => {
                if (!isMounted) return;
                const activeSubs = info?.activeSubscriptions || [];
                if (activeSubs.some(s => s.includes('pro_sub:p1y'))) setProSubType('annual');
                else if (activeSubs.some(s => s.includes('pro_sub:p1m'))) setProSubType('monthly');
            }).catch(e => console.warn('구독 정보 확인 실패', e));
        }
        return () => { isMounted = false; };
    }, [currentPlan]);

    const handleSubscribe = async (plan, period) => {
        if (onSubscribe) {
            setIsSubmitting(true);
            try {
                await onSubscribe(plan, period);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <>
            {/* Pro/Team 기능 비교표 */}
            <table className="plan-compare-table">
                <thead>
                    <tr>
                        <th>기능</th>
                        <th>Pro</th>
                        <th className="highlight-col">Team</th>
                    </tr>
                </thead>
                <tbody>
                    {PRO_TEAM_FEATURES.map((f) => (
                        <tr key={f.label}>
                            <td>{f.label}</td>
                            <td>{f.pro}</td>
                            <td className="highlight-col">{f.team}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td></td>
                        {/* Pro 구독 버튼 */}
                        <td>
                            {currentPlan === 'pro' ? (
                                <span className="current-plan-label">현재 플랜</span>
                            ) : selectedPlan === 'pro' ? (
                                <div className="plan-period-btns">
                                    <button className="btn btn-primary btn-xs btn-block" disabled={isSubmitting} onClick={() => handleSubscribe('pro', 'monthly')}>
                                        월간 ₩3,900
                                    </button>
                                    <button className="btn btn-primary btn-xs btn-block yearly-btn" disabled={isSubmitting} onClick={() => handleSubscribe('pro', 'yearly')}>
                                        연간 ₩33,000
                                    </button>
                                    <button className="btn btn-secondary btn-xs btn-block" disabled={isSubmitting} onClick={() => setSelectedPlan(null)}>취소</button>
                                </div>
                            ) : (
                                <button className="btn btn-secondary btn-sm btn-block" onClick={() => setSelectedPlan('pro')} disabled={currentPlan === 'team' || isSubmitting}>
                                    ₩3,900/월~
                                </button>
                            )}
                        </td>
                        {/* Team 구독 버튼 */}
                        <td className="highlight-col">
                            {currentPlan === 'team' ? (
                                <span className="current-plan-label">현재 플랜</span>
                            ) : selectedPlan === 'team' ? (
                                <div className="plan-period-btns">
                                    {currentPlan === 'pro' && (
                                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', textAlign: 'center', marginBottom: 'var(--spacing-xs)', fontWeight: 'bold' }}>
                                            {proSubType === 'annual'
                                                ? '✅ 기존 Pro(연간) 잔여 기간만큼 팀 결제 시 차감'
                                                : proSubType === 'monthly'
                                                    ? '✅ 기존 Pro(월간) 잔여 기간만큼 팀 결제 시 차감'
                                                    : '✅ 기존 Pro 잔여 기간 가치만큼 자동 결제 할인'}
                                        </p>
                                    )}
                                    <button className="btn btn-primary btn-xs btn-block" disabled={isSubmitting} onClick={() => handleSubscribe('team', 'monthly')}>
                                        월간 ₩9,900
                                    </button>
                                    <button className="btn btn-primary btn-xs btn-block yearly-btn" disabled={isSubmitting} onClick={() => handleSubscribe('team', 'yearly')}>
                                        연간 ₩79,000
                                    </button>
                                    <button className="btn btn-secondary btn-xs btn-block" disabled={isSubmitting} onClick={() => setSelectedPlan(null)}>취소</button>
                                </div>
                            ) : (
                                <button className="btn btn-primary btn-sm btn-block" disabled={isSubmitting} onClick={() => setSelectedPlan('team')}>
                                    {currentPlan === 'pro' ? '🚀 Team으로 업그레이드' : '₩9,900/월~'}
                                </button>
                            )}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* 무료 체험 & 리워드 — 무료 사용자에게만 */}
            {currentPlan === 'free' && (
                <div style={{ marginTop: 'var(--spacing-md)', textAlign: 'center' }}>
                    {!isTrialUsed(profile) && (
                        <button className="btn btn-secondary btn-block" style={{ marginBottom: 'var(--spacing-sm)' }}
                            onClick={async () => {
                                if (window.confirm('Pro 7일 체험을 시작하시겠습니까?\n체험 기간 동안 모든 Pro 기능을 무료로 사용할 수 있습니다.')) {
                                    try {
                                        await startFreeTrial(profile?.uid || profile?.id, profile);
                                        onTrialStart?.();
                                    } catch (e) {
                                        console.error(e);
                                        addToast('체험 시작 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
                                    }
                                }
                            }}>
                            🎁 7일 무료 체험 시작
                        </button>
                    )}
                    {isTrialActive(profile) && (
                        <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--spacing-sm)' }}>
                            🎉 Pro 체험 중 ({getTrialRemainingDays(profile)}일 남음)
                        </div>
                    )}
                    <RewardedAd profile={profile} onReward={onReward} />
                </div>
            )}

            {/* 무료/참여 기능 비교표 */}
            <table className="feature-access-table" style={{ marginTop: 'var(--spacing-md)' }}>
                <thead>
                    <tr>
                        <th>기능</th>
                        <th>무료</th>
                        <th>Pro/Team 참여시</th>
                    </tr>
                </thead>
                <tbody>
                    {FREE_ACCESS_FEATURES.map((f) => (
                        <tr key={f.label}>
                            <td>{f.label}</td>
                            <td>{f.free}</td>
                            <td>{f.access}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
