/**
 * 푸시 알림 서비스 — FCM 토큰 등록 + 알림 설정 관리
 * 
 * @capacitor/push-notifications 사용
 * FCM 토큰을 Firestore users/{uid}.fcmTokens에 저장
 * 알림 설정을 users/{uid}.notificationSettings에 저장
 */
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Capacitor } from '@capacitor/core';

// 포그라운드 알림 수신 콜백
let _foregroundHandler = null;
export function setForegroundNotificationHandler(fn) {
    _foregroundHandler = fn;
}

// 현재 열람 중인 채팅탭의 projectId (같은 탭이면 토스트 억제)
let _activeChatProjectId = null;
export function setActiveChatProjectId(projectId) {
    _activeChatProjectId = projectId;
}
export function getActiveChatProjectId() {
    return _activeChatProjectId;
}

let PushNotifications = null;

async function loadPushPlugin() {
    try {
        const mod = await import('@capacitor/push-notifications');
        PushNotifications = mod.PushNotifications;
        return true;
    } catch {
        return false;
    }
}

// ===== 기본 알림 설정 =====
export const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,       // 전체 ON/OFF
    itemCreate: true,    // 체크리스트 생성
    itemChange: true,    // 체크리스트 변경
    chat: true,          // 채팅
    comment: true,       // 댓글
    dm: true,            // DM 메시지
    invitation: true,    // 초대
    dueDate: false,      // 마감일 예약 알림 (Pro/Team 전용)
    dueDateRules: [],    // [{ unit: 'month'|'day'|'hour'|'minute', value: number }]
};

// ===== FCM 토큰 등록 =====
export async function registerPushNotifications(userId) {
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) {
        console.log('Push notifications: 네이티브 환경에서만 지원');
        return;
    }

    const ok = await loadPushPlugin();
    if (!ok || !PushNotifications) return;

    // 권한 확인
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
        console.warn('Push notification 권한 거부');
        return;
    }

    // 토큰 등록 리스너
    await PushNotifications.addListener('registration', async (token) => {
        console.log('FCM Token:', token.value);
        try {
            await updateDoc(doc(db, 'users', userId), {
                fcmTokens: arrayUnion(token.value),
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.warn('FCM 토큰 저장 실패:', err);
        }
    });

    await PushNotifications.addListener('registrationError', (err) => {
        console.error('FCM 등록 실패:', err);
    });

    // 알림 수신 시 (포그라운드)
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('푸시 알림 수신 (포그라운드):', notification);
        if (_foregroundHandler) {
            _foregroundHandler(notification);
        }
    });

    // 알림 클릭 시
    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('푸시 알림 클릭:', notification);
        // 향후: 알림 데이터 기반으로 해당 페이지로 이동
    });

    // 등록 시작
    await PushNotifications.register();
}

// ===== FCM 토큰 해제 (로그아웃 시) =====
export async function unregisterPushToken(userId, token) {
    if (!userId || !token) return;
    try {
        await updateDoc(doc(db, 'users', userId), {
            fcmTokens: arrayRemove(token),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('FCM 토큰 해제 실패:', err);
    }
}

// ===== 알림 설정 저장 =====
export async function saveNotificationSettings(userId, settings) {
    if (!userId) return;
    await updateDoc(doc(db, 'users', userId), {
        notificationSettings: settings,
        updatedAt: serverTimestamp(),
    });
}

// ===== 알림 설정 조회 =====
export function getNotificationSettings(profile) {
    return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(profile?.notificationSettings || {}),
    };
}

// 페이지별 채팅 알림 뮤트 저장
export async function setChatNotiMuted(uid, projectId, muted) {
    await updateDoc(doc(db, 'users', uid), {
        [`chatNotiMuted.${projectId}`]: muted,
        updatedAt: serverTimestamp(),
    });
}
