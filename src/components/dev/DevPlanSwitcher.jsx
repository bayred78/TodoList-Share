import React, { useState } from 'react';
import { db } from '../../services/firebase';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import useAuthStore from '../../stores/authStore';

/**
 * 개발용 플랜 스위치
 * 표시 조건: import.meta.env.DEV (웹 개발서버) 또는 localStorage 'devMode' (모바일 빌드)
 * users/{uid}.plan + 해당 유저가 admin인 모든 projects.ownerPlan 동시 변경
 */
export default function DevPlanSwitcher() {
    const { profile } = useAuthStore();
    const [busy, setBusy] = useState(false);
    const [collapsed, setCollapsed] = useState(true);

    const isDevMode = import.meta.env.DEV || localStorage.getItem('devMode') === 'true';
    if (!isDevMode || !profile) return null;

    const currentPlan = profile.plan || 'free';

    const switchPlan = async (newPlan) => {
        if (busy || newPlan === currentPlan) return;
        setBusy(true);
        try {
            // 1. 사용자 플랜 변경
            await updateDoc(doc(db, 'users', profile.uid), { plan: newPlan });

            // 2. 내가 admin인 모든 프로젝트의 ownerPlan 변경
            const projSnap = await getDocs(
                query(collection(db, 'projects'), where(`members.${profile.uid}.role`, '==', 'admin'))
            );
            const promises = projSnap.docs.map(d =>
                updateDoc(doc(db, 'projects', d.id), { ownerPlan: newPlan })
            );
            await Promise.all(promises);

            alert(`✅ 플랜이 "${newPlan}"으로 변경되었습니다.\n프로젝트 ${projSnap.size}개 업데이트됨.\n페이지를 새로고침합니다.`);
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert('❌ 플랜 변경 실패: ' + err.message);
        } finally {
            setBusy(false);
        }
    };

    const plans = [
        { key: 'free', label: '🆓 Free', color: '#6b7280' },
        { key: 'pro', label: '💎 Pro', color: '#8b5cf6' },
        { key: 'team', label: '👥 Team', color: '#f59e0b' },
    ];

    return (
        <div style={{
            position: 'fixed',
            bottom: 60,
            right: 12,
            zIndex: 99999,
            fontFamily: 'system-ui, sans-serif',
        }}>
            {collapsed ? (
                <button
                    onClick={() => setCollapsed(false)}
                    style={{
                        background: '#1e1e2e',
                        color: '#e0e0e0',
                        border: '1px solid #444',
                        borderRadius: '50%',
                        width: 40,
                        height: 40,
                        fontSize: 18,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}
                    title="DEV 플랜 스위치"
                >🔧</button>
            ) : (
                <div style={{
                    background: '#1e1e2e',
                    border: '1px solid #444',
                    borderRadius: 12,
                    padding: '10px 12px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    minWidth: 180,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600 }}>🔧 DEV 플랜 스위치</span>
                        <button
                            onClick={() => setCollapsed(true)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}
                        >✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {plans.map(p => (
                            <button
                                key={p.key}
                                disabled={busy}
                                onClick={() => switchPlan(p.key)}
                                style={{
                                    flex: 1,
                                    padding: '6px 4px',
                                    border: currentPlan === p.key ? `2px solid ${p.color}` : '1px solid #555',
                                    borderRadius: 8,
                                    background: currentPlan === p.key ? `${p.color}22` : 'transparent',
                                    color: currentPlan === p.key ? p.color : '#aaa',
                                    fontSize: 12,
                                    fontWeight: currentPlan === p.key ? 700 : 400,
                                    cursor: busy ? 'wait' : 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                        현재: <strong style={{ color: plans.find(p => p.key === currentPlan)?.color }}>{currentPlan.toUpperCase()}</strong>
                        {' · '}프로덕션 빌드에는 미포함
                    </div>
                </div>
            )}
        </div>
    );
}
