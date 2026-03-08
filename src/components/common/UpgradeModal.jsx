import React from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import PlanCompareTable from './PlanCompareTable';
import { getPlanLabel } from '../../services/subscriptionService';
import RewardedAd from '../ads/RewardedAd';
import './UpgradeModal.css';

/**
 * 기능 제한 도달 시 표시되는 업그레이드 모달
 * 공유 PlanCompareTable 컴포넌트 사용
 */
export default function UpgradeModal({ isOpen, onClose, currentPlan = 'free', reason = '', onSubscribe, profile, onTrialStart }) {
    const navigate = useNavigate();

    const handleSubscribe = onSubscribe || ((plan, period) => {
        onClose();
        navigate('/settings');
    });

    const REASON_MESSAGES = {
        maxPages: '페이지 생성 수가 최대 한도에 도달했습니다.',
        maxMembers: '참여자 수가 최대 한도에 도달했습니다.',
        maxItems: '체크리스트 항목 수가 최대 한도에 도달했습니다.',
        chatHistory: '더 많은 채팅 기록은 Pro 이상 구독이 필요합니다.',
        calendar: '구글 캘린더 연동은 Pro 이상에서 사용 가능합니다.',
        imageChat: '이미지 채팅은 본인 구독(Pro 이상)이 필요합니다.',
        repeat: '반복 기능은 Pro 이상 구독이 필요합니다.',
        freeRepeat: '무료 플랜에서는 반복을 3개까지 설정할 수 있습니다. 업그레이드하면 무제한!',
        priority: '마감일 기능은 Pro 이상 구독이 필요합니다.',
        labels: '라벨 기능은 Pro 이상 구독이 필요합니다.',
        statistics: '통계 기능은 Team 플랜에서 사용 가능합니다.',
        viewerRole: '독자 초대 기능은 Team 플랜에서 사용 가능합니다.',
        search: '통합 검색은 Pro 이상 구독이 필요합니다.',
        representativeIcon: '대표 아이콘은 Pro 이상 구독이 필요합니다.',
        freeDueDate: '무료 플랜에서는 마감일을 3개까지 설정할 수 있습니다. 업그레이드하면 무제한!',
        freeLabel: '무료 플랜에서는 라벨을 3개 항목까지 설정할 수 있습니다. 업그레이드하면 무제한!',
        dueDateAlert: '마감일 알림 예약은 Pro 이상 구독이 필요합니다.',
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="💎 프리미엄 업그레이드">
            <div className="upgrade-modal-content">
                {/* 제한 사유 */}
                <div className="upgrade-reason">
                    <span className="upgrade-reason-icon">🔒</span>
                    <p>{REASON_MESSAGES[reason] || reason || '이 기능은 프리미엄 구독이 필요합니다.'}</p>
                </div>

                {/* 현재 플랜 */}
                <div className="upgrade-current-plan">
                    현재 플랜: <strong>{getPlanLabel(currentPlan)}</strong>
                </div>

                {/* 공유 플랜 비교표 (이벤트 시 창 닫기) */}
                <PlanCompareTable currentPlan={currentPlan} onSubscribe={handleSubscribe} profile={profile} onTrialStart={onTrialStart} onReward={onClose} />

                {/* 닫기 */}
                <div className="upgrade-actions">
                    <button className="btn btn-secondary btn-block" onClick={onClose}>나중에</button>
                </div>
            </div>
        </Modal>
    );
}
