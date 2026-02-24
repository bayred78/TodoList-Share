import React, { useState } from 'react';
import { isTrialUsed, isTrialActive, startFreeTrial, getTrialRemainingDays } from '../../services/subscriptionService';
import RewardedAd from '../ads/RewardedAd';

/**
 * Pro/Team 비교표 + 무료/참여 비교표 공유 컴포넌트
 * UpgradeModal과 SettingsPage에서 동일하게 사용
 */

// Pro/Team 기능 비교 행 데이터
const PRO_TEAM_FEATURES = [
    { label: '페이지', pro: '20개', team: '무제한' },
    { label: '참여자', pro: '10명', team: '30명' },
    { label: '체크리스트', pro: '무제한', team: '무제한' },
    { label: '채팅 기록', pro: '무제한', team: '무제한' },
    { label: '마감일/라벨', pro: '무제한', team: '무제한' },
    { label: '반복', pro: '✅', team: '✅' },
    { label: 'CSV 관리', pro: '✅', team: '✅' },
    { label: '구글 캘린더 연동', pro: '✅', team: '✅' },
    { label: '광고 제거', pro: '✅', team: '✅' },
    { label: '이미지 채팅', pro: '—', team: '✅' },
    { label: '페이지 통계', pro: '✅', team: '✅' },
    { label: '통합 검색', pro: '✅', team: '✅' },
];

// 무료/참여 기능 비교 행 데이터
const FREE_ACCESS_FEATURES = [
    { label: '페이지 수', free: '5개', access: '❌ 본인 구독 필요' },
    { label: '참여자 수', free: '2명', access: '✅ 관리자 기준' },
    { label: '체크리스트', free: '50개', access: '✅ 무제한' },
    { label: '채팅 기록', free: '50건', access: '✅ 무제한' },
    { label: '마감일/라벨', free: '각 3개', access: '✅ 무제한' },
    { label: '반복', free: '❌', access: '✅ 사용 가능' },
    { label: 'CSV 관리', free: '❌', access: '✅ 사용 가능' },
    { label: '구글 캘린더 연동', free: '❌', access: '✅ 사용 가능' },
    { label: '광고 제거', free: '❌', access: '❌ 본인 구독 필요' },
    { label: '이미지 채팅', free: '❌', access: '❌ 본인 구독 필요' },
    { label: '페이지 통계', free: '❌', access: '✅ 사용 가능' },
    { label: '통합 검색', free: '❌', access: '✅ 사용 가능' },
];

export default function PlanCompareTable({ currentPlan = 'free', onSubscribe, profile, onTrialStart }) {
    const [selectedPlan, setSelectedPlan] = useState(null);

    const handleSubscribe = (plan, period) => {
        if (onSubscribe) {
            onSubscribe(plan, period);
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
                                    <button className="btn btn-primary btn-xs btn-block" onClick={() => handleSubscribe('pro', 'monthly')}>
                                        월간 ₩3,900
                                    </button>
                                    <button className="btn btn-primary btn-xs btn-block yearly-btn" onClick={() => handleSubscribe('pro', 'yearly')}>
                                        연간 ₩33,000 <span className="discount-badge">30%↓</span>
                                    </button>
                                    <button className="btn btn-secondary btn-xs btn-block" onClick={() => setSelectedPlan(null)}>취소</button>
                                </div>
                            ) : (
                                <button className="btn btn-secondary btn-sm btn-block" onClick={() => setSelectedPlan('pro')} disabled={currentPlan === 'team'}>
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
                                    <button className="btn btn-primary btn-xs btn-block" onClick={() => handleSubscribe('team', 'monthly')}>
                                        월간 ₩6,900
                                    </button>
                                    <button className="btn btn-primary btn-xs btn-block yearly-btn" onClick={() => handleSubscribe('team', 'yearly')}>
                                        연간 ₩55,000 <span className="discount-badge">34%↓</span>
                                    </button>
                                    <button className="btn btn-secondary btn-xs btn-block" onClick={() => setSelectedPlan(null)}>취소</button>
                                </div>
                            ) : (
                                <button className="btn btn-primary btn-sm btn-block" onClick={() => setSelectedPlan('team')}>
                                    ₩6,900/월~
                                </button>
                            )}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* 무료 체험 & 리워드 — 무료 사용자에게만 */}
            {currentPlan === 'free' && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                    {!isTrialUsed(profile) && (
                        <button className="btn btn-secondary btn-block" style={{ marginBottom: 8 }}
                            onClick={async () => { await startFreeTrial(profile?.uid || profile?.id, profile); onTrialStart?.(); }}>
                            🎁 7일 무료 체험 시작
                        </button>
                    )}
                    {isTrialActive(profile) && (
                        <div style={{ padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
                            🎉 Pro 체험 중 ({getTrialRemainingDays(profile)}일 남음)
                        </div>
                    )}
                    <RewardedAd profile={profile} />
                </div>
            )}

            {/* 무료/참여 기능 비교표 */}
            <table className="feature-access-table" style={{ marginTop: 12 }}>
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
