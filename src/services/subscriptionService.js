/**
 * 구독 서비스 — 프리미엄 등급별 제한 관리
 * 
 * 하이브리드 모델:
 *   - 페이지 기능: 관리자(ownerId)의 구독 등급 기준 (project.ownerPlan)
 *   - 개인 기능: 본인 구독 등급 기준 (profile.plan)
 */
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ===== 구독 등급 상수 =====
export const PLAN = {
    FREE: 'free',
    PRO: 'pro',
    TEAM: 'team',
};

// ===== 등급별 제한 =====
export const LIMITS = {
    free: {
        maxPages: 3,
        maxMembers: 2,
        maxItems: 50,
        chatHistory: 50,
        chatRetentionDays: Infinity,
        calendar: false,
        noAds: false,
        imageChat: false,
        repeat: true,
        freeRepeatLimit: 3,
        priority: true,
        labels: true,
        viewerRole: false,
        statistics: false,
        search: false,
        representativeIcon: false,
        freeDueDateLimit: 3,
        freeLabelLimit: 3,
        dueDateNotification: false,
    },
    pro: {
        maxPages: 10,
        maxMembers: 5,
        maxItems: Infinity,
        chatHistory: Infinity,
        chatRetentionDays: 30,
        calendar: true,
        noAds: true,
        imageChat: true,
        repeat: true,
        freeRepeatLimit: Infinity,
        priority: true,
        labels: true,
        viewerRole: false,
        statistics: false,
        search: true,
        representativeIcon: true,
        freeDueDateLimit: Infinity,
        freeLabelLimit: Infinity,
        dueDateNotification: true,
    },
    team: {
        maxPages: Infinity,
        maxMembers: 30,
        maxItems: Infinity,
        chatHistory: Infinity,
        chatRetentionDays: 30,
        calendar: true,
        noAds: true,
        imageChat: true,
        repeat: true,
        freeRepeatLimit: Infinity,
        priority: true,
        labels: true,
        viewerRole: true,
        statistics: true,
        search: true,
        representativeIcon: true,
        freeDueDateLimit: Infinity,
        freeLabelLimit: Infinity,
        dueDateNotification: true,
    },
};

// ===== 개인 플랜 조회 (동기 — Firestore 저장용, 실제 구독 등급) =====
export function getUserPlan(profile) {
    return profile?.plan || PLAN.FREE;
}

// ===== 개인 제한 조회 (동기 — 리워드/체험 반영) =====
export function getUserLimits(profile) {
    return LIMITS[getEffectivePlan(profile)];
}

// ===== 프로젝트 제한 조회 (동기 — project.ownerPlan 비정규화) =====
export function getProjectLimits(project) {
    const plan = project?.ownerPlan || PLAN.FREE;
    return LIMITS[plan] || LIMITS.free;
}

// ===== 개별 기능 체크 (개인 기반) =====
export function checkPersonalFeature(profile, feature) {
    const limits = getUserLimits(profile);
    return !!limits[feature];
}

// ===== 개별 기능 체크 (프로젝트 기반) =====
export function checkProjectFeature(project, feature) {
    const limits = getProjectLimits(project);
    return !!limits[feature];
}

// ===== 플랜 이름 (한글) =====
export function getPlanLabel(plan) {
    const labels = {
        free: '무료',
        pro: 'Pro',
        team: 'Team',
    };
    return labels[plan] || '무료';
}

// ===== 구독 만료 확인 =====
export function isSubscriptionExpired(profile) {
    if (!profile?.planExpiresAt) return false;
    const expiresAt = profile.planExpiresAt?.toDate
        ? profile.planExpiresAt.toDate()
        : new Date(profile.planExpiresAt);
    return expiresAt < new Date();
}

// ===== 리워드 광고 — KST 자정 만료 (Firestore 계정 기반) =====
export async function setRewardUnlock(userId) {
    if (!userId) return;
    // KST(UTC+9) 기준 자정까지 — UTC 메서드만 사용하여 타임존 오류 방지
    const KST_MS = 9 * 60 * 60 * 1000;
    const nowUtc = Date.now();

    // 현재 KST 시각을 UTC 메서드로 조작하기 위한 fake Date
    const kstFake = new Date(nowUtc + KST_MS);

    // 다음 자정 KST (fake UTC 기준)
    const midnightFake = new Date(Date.UTC(
        kstFake.getUTCFullYear(),
        kstFake.getUTCMonth(),
        kstFake.getUTCDate() + 1,
        0, 0, 0, 0
    ));

    // 22:00 KST 이후 → 다음날 자정 연장
    if (kstFake.getUTCHours() >= 22) {
        midnightFake.setUTCDate(midnightFake.getUTCDate() + 1);
    }

    // fake UTC → 실제 UTC 타임스탬프 (KST 오프셋 차감)
    const expiryUtc = midnightFake.getTime() - KST_MS;
    await updateDoc(doc(db, 'users', userId), {
        rewardUnlockExpiry: expiryUtc,
        updatedAt: serverTimestamp(),
    });
    return expiryUtc;
}

export function isRewardUnlocked(profile) {
    const expiry = profile?.rewardUnlockExpiry;
    if (!expiry) return false;
    return Date.now() < Number(expiry);
}

export function getRewardRemainingMs(profile) {
    const expiry = profile?.rewardUnlockExpiry;
    if (!expiry) return 0;
    return Math.max(0, Number(expiry) - Date.now());
}

// ===== 7일 무료 체험 (Firestore 계정 기반, 계정당 1회) =====
export async function startFreeTrial(userId, profile) {
    if (!userId) return false;
    // ★ 방어 로직: 이미 체험 사용한 계정이면 거부
    if (profile?.freeTrialUsed) return false;
    const expiryMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await updateDoc(doc(db, 'users', userId), {
        freeTrialExpiry: expiryMs,
        freeTrialUsed: true,
        updatedAt: serverTimestamp(),
    });
    return true;
}

export function isTrialActive(profile) {
    const expiry = profile?.freeTrialExpiry;
    if (!expiry) return false;
    return Date.now() < Number(expiry);
}

export function isTrialUsed(profile) {
    return !!profile?.freeTrialUsed;
}

export function getTrialRemainingDays(profile) {
    const expiry = profile?.freeTrialExpiry;
    if (!expiry) return 0;
    return Math.max(0, Math.ceil((Number(expiry) - Date.now()) / (24 * 60 * 60 * 1000)));
}

// ===== 실효 플랜 (리워드·체험 반영) =====
export function getEffectivePlan(profile) {
    const actual = getUserPlan(profile);
    if (actual !== PLAN.FREE) return actual;  // Pro/Team은 그대로
    if (isRewardUnlocked(profile)) return PLAN.PRO;
    if (isTrialActive(profile)) return PLAN.PRO;
    return PLAN.FREE;
}

// ===== 클라이언트 주도 RevenueCat 동기화 (Firestore 업데이트) =====
export async function syncSubscriptionWithRevenueCat(userId, customerInfo) {
    if (!userId || !customerInfo) return;
    try {
        const activeSubs = customerInfo.activeSubscriptions || [];
        let newPlan = PLAN.FREE;

        // 상위 플랜 우선 확인
        if (activeSubs.some(s => s.startsWith('team_sub:'))) {
            newPlan = PLAN.TEAM;
        } else if (activeSubs.some(s => s.startsWith('pro_sub:'))) {
            newPlan = PLAN.PRO;
        }

        const profileRef = doc(db, 'users', userId);
        await updateDoc(profileRef, {
            plan: newPlan,
            updatedAt: serverTimestamp()
        });
        console.log(`구독 플랜 동기화 완료: ${userId} -> ${newPlan}`);
    } catch (error) {
        console.error('구독 플랜 동기화 실패:', error);
    }
}
