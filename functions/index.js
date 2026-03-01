/**
 * Cloud Functions for TodoListShare
 * 
 * 캘린더 토큰 관리:
 * - saveCalendarToken: 클라이언트에서 받은 OAuth access token을 Firestore에 저장
 * - getCalendarToken: 저장된 토큰을 반환 (만료 확인 포함)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
const db = getFirestore();

/**
 * saveCalendarToken
 * 클라이언트에서 로그인 시 받은 OAuth access token을 Firestore에 안전하게 저장합니다.
 * 
 * @param {string} data.accessToken - Google OAuth access token
 * @param {number} data.expiresAt - 토큰 만료 시간 (Unix timestamp ms)
 */
exports.saveCalendarToken = onCall(async (request) => {
    // 인증 확인
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const { accessToken, expiresAt } = request.data;

    if (!accessToken) {
        throw new HttpsError('invalid-argument', 'accessToken이 필요합니다.');
    }

    const uid = request.auth.uid;

    try {
        await db.collection('users').doc(uid).set({
            calendarToken: {
                accessToken,
                expiresAt: expiresAt || (Date.now() + 50 * 60 * 1000),
                updatedAt: Date.now(),
            },
        }, { merge: true });

        return { success: true };
    } catch (error) {
        console.error('토큰 저장 실패:', error);
        throw new HttpsError('internal', '토큰 저장에 실패했습니다.');
    }
});

/**
 * getCalendarToken
 * Firestore에 저장된 캘린더 토큰을 반환합니다.
 * 만료된 경우 에러를 반환하여 클라이언트가 재인증하도록 합니다.
 * 
 * @returns {object} { accessToken, expiresAt }
 */
exports.getCalendarToken = onCall(async (request) => {
    // 인증 확인
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const uid = request.auth.uid;

    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            throw new HttpsError('not-found', '사용자 정보를 찾을 수 없습니다.');
        }

        const calendarToken = userDoc.data()?.calendarToken;

        if (!calendarToken?.accessToken) {
            throw new HttpsError('not-found', '캘린더 토큰이 없습니다. 인증이 필요합니다.');
        }

        // 만료 확인
        if (Date.now() >= calendarToken.expiresAt) {
            throw new HttpsError('deadline-exceeded', '토큰이 만료되었습니다. 재인증이 필요합니다.');
        }

        return {
            accessToken: calendarToken.accessToken,
            expiresAt: calendarToken.expiresAt,
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('토큰 조회 실패:', error);
        throw new HttpsError('internal', '토큰 조회에 실패했습니다.');
    }
});

/**
 * cleanupDeletedItems
 * 매일 1회 실행: 7일 이상 경과한 삭제 아이템을 영구 삭제합니다.
 * (클라이언트에서 onSnapshot 콜백 내 삭제를 제거하여 비용 절감)
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');

exports.cleanupDeletedItems = onSchedule('every 24 hours', async (event) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
        // 모든 프로젝트 순회
        const projectsSnap = await db.collection('projects').get();

        let totalDeleted = 0;
        for (const projectDoc of projectsSnap.docs) {
            const itemsSnap = await db.collection('projects').doc(projectDoc.id)
                .collection('items')
                .where('deleted', '==', true)
                .where('deletedAt', '<=', sevenDaysAgo)
                .get();

            if (itemsSnap.empty) continue;

            // 배치 삭제 (500개 제한)
            let batch = db.batch();
            let count = 0;
            for (const itemDoc of itemsSnap.docs) {
                batch.delete(itemDoc.ref);
                count++;
                if (count >= 490) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();
            totalDeleted += itemsSnap.size;

            // --- 2. 7일 지난 채팅 메시지(이미지 포함) 정리 ---
            const messagesSnap = await db.collection('projects').doc(projectDoc.id)
                .collection('messages')
                .where('mediaUrl', '!=', null)
                .get();

            let chatBatch = db.batch();
            let chatCount = 0;
            let totalChatDeleted = 0;

            for (const chatDoc of messagesSnap.docs) {
                const data = chatDoc.data();
                if (!data.createdAt) continue;
                const createdAtDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);

                if (createdAtDate <= sevenDaysAgo) {
                    // Storage 파일 삭제
                    if (data.mediaUrl) {
                        try {
                            const match = data.mediaUrl.match(/\/b\/([^/]+)\/o\/([^?]+)/);
                            if (match && match[1] && match[2]) {
                                const bucketName = match[1];
                                const filePath = decodeURIComponent(match[2]);
                                await getStorage().bucket(bucketName).file(filePath).delete({ ignoreNotFound: true });
                            }
                        } catch (e) {
                            console.error('채팅 이미지 정리 실패:', e);
                        }
                    }
                    // Firestore 채팅 문서 삭제
                    chatBatch.delete(chatDoc.ref);
                    chatCount++;
                    totalChatDeleted++;

                    if (chatCount >= 490) {
                        await chatBatch.commit();
                        chatBatch = db.batch();
                        chatCount = 0;
                    }
                }
            }
            if (chatCount > 0) await chatBatch.commit();
            console.log(`프로젝트 ${projectDoc.id}: 채팅 미디어 ${totalChatDeleted}개 정리 완료`);
        }

        console.log(`cleanupDeletedItems: ${totalDeleted}개 아이템 영구 삭제 및 확인 완료`);
    } catch (error) {
        console.error('cleanupDeletedItems 실패:', error);
    }
});

/**
 * migrateAddMemberUIDs
 * 기존 프로젝트 데이터에 memberUIDs 배열을 추가 (1회 실행용)
 * admin 권한 필요: Firebase Console이나 관리자가 호출
 */
exports.migrateAddMemberUIDs = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    try {
        const projectsSnap = await db.collection('projects').get();
        let updated = 0;

        for (const projectDoc of projectsSnap.docs) {
            const data = projectDoc.data();

            // 이미 memberUIDs가 있으면 건너뛰기
            if (data.memberUIDs && Array.isArray(data.memberUIDs)) continue;

            // members 맵에서 UID 추출
            const memberUIDs = data.members ? Object.keys(data.members) : [];

            await projectDoc.ref.update({ memberUIDs });
            updated++;
        }

        return { success: true, updated, message: `${updated}개 프로젝트 마이그레이션 완료` };
    } catch (error) {
        console.error('마이그레이션 실패:', error);
        throw new HttpsError('internal', '마이그레이션 실패: ' + error.message);
    }
});

// ========================================================
// 푸시 알림 (FCM) — Firestore 트리거
// ========================================================
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getMessaging } = require('firebase-admin/messaging');

/**
 * 헬퍼: 특정 사용자에게 FCM 알림 발송
 * @param {string} uid - 대상 사용자 UID
 * @param {string} category - 알림 카테고리 (itemCreate, itemChange, chat, dm, invitation)
 * @param {object} payload - { title, body, data }
 */
async function sendPushToUser(uid, category, payload) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data();

        // 알림 설정 확인
        const ns = userData.notificationSettings || {};
        if (ns.enabled === false) return;
        if (ns[category] === false) return;

        // FCM 토큰 조회
        const tokens = userData.fcmTokens;
        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) return;

        // 메시지 구성
        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data || {},
            tokens: tokens,
        };

        const response = await getMessaging().sendEachForMulticast(message);

        // 실패한 토큰 정리
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                const { FieldValue } = require('firebase-admin/firestore');
                await db.collection('users').doc(uid).update({
                    fcmTokens: FieldValue.arrayRemove(...invalidTokens),
                });
            }
        }
    } catch (err) {
        console.error(`sendPushToUser(${uid}) 실패:`, err);
    }
}

/**
 * 헬퍼: 프로젝트 멤버 목록 조회 (특정 UID 제외)
 */
async function getProjectMembersExcept(projectId, excludeUid) {
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) return [];
    const data = projectDoc.data();
    const members = data.members ? Object.keys(data.members) : [];
    return members.filter(uid => uid !== excludeUid);
}

// ----- 1. 체크리스트 생성 알림 (생성자 제외) -----
exports.onItemCreate = onDocumentCreated('projects/{projectId}/items/{itemId}', async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const projectId = event.params.projectId;
    const creatorUid = data.createdBy;
    const itemTitle = data.title || '새 항목';

    // 프로젝트 이름 조회
    const projectDoc = await db.collection('projects').doc(projectId).get();
    const projectName = projectDoc.data()?.title || '프로젝트';
    const creatorName = projectDoc.data()?.members?.[creatorUid]?.nickname || '멤버';

    const members = await getProjectMembersExcept(projectId, creatorUid);

    const promises = members.map(uid =>
        sendPushToUser(uid, 'itemCreate', {
            title: `📝 ${projectName}`,
            body: `${creatorName}님이 '${itemTitle}'을(를) 추가했습니다`,
            data: { type: 'itemCreate', projectId },
        })
    );
    await Promise.all(promises);
});

// ----- 2. 체크리스트 변경 알림 (변경자 제외) -----
exports.onItemUpdate = onDocumentUpdated('projects/{projectId}/items/{itemId}', async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const projectId = event.params.projectId;
    const updaterUid = after.updatedBy || after.createdBy;

    // 의미 있는 변경 감지
    let action = '';
    if (before.checked !== after.checked) {
        action = after.checked ? '완료' : '미완료로 변경';
    } else if (before.title !== after.title) {
        action = '수정';
    } else if (after.deleted && !before.deleted) {
        action = '삭제';
    } else {
        return; // 의미 없는 변경은 무시
    }

    const itemTitle = after.title || before.title || '항목';
    const projectDoc = await db.collection('projects').doc(projectId).get();
    const projectName = projectDoc.data()?.title || '프로젝트';
    const updaterName = projectDoc.data()?.members?.[updaterUid]?.nickname || '멤버';

    const members = await getProjectMembersExcept(projectId, updaterUid);

    const promises = members.map(uid =>
        sendPushToUser(uid, 'itemChange', {
            title: `✏️ ${projectName}`,
            body: `${updaterName}님이 '${itemTitle}'을(를) ${action}했습니다`,
            data: { type: 'itemChange', projectId },
        })
    );
    await Promise.all(promises);
});

// ----- 3. 채팅 알림 (발신자 제외) -----
exports.onChatCreate = onDocumentCreated('projects/{projectId}/messages/{messageId}', async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const projectId = event.params.projectId;
    const senderUid = data.senderId;
    const senderName = data.senderNickname || '멤버';
    const messageText = data.text || '';
    const preview = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;

    const projectDoc = await db.collection('projects').doc(projectId).get();
    const projectName = projectDoc.data()?.title || '프로젝트';

    const members = await getProjectMembersExcept(projectId, senderUid);

    const promises = members.map(uid =>
        sendPushToUser(uid, 'chat', {
            title: `💬 ${projectName}`,
            body: `${senderName}: ${preview}`,
            data: { type: 'chat', projectId },
        })
    );
    await Promise.all(promises);
});

// ----- 4. DM 메시지 알림 -----
exports.onDMCreate = onDocumentCreated('users/{userId}/notifications/{notiId}', async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (data.type !== 'dm') return; // DM 타입만 처리

    const recipientUid = event.params.userId;
    const senderName = data.senderNickname || '사용자';
    const messageText = data.text || data.message || '';
    const preview = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;

    await sendPushToUser(recipientUid, 'dm', {
        title: `✉️ ${senderName}`,
        body: preview || '새 메시지가 도착했습니다',
        data: { type: 'dm', senderUid: data.senderUid || '' },
    });
});

// ----- 5. 초대 알림 -----
exports.onInvitationCreate = onDocumentCreated('invitations/{invitationId}', async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const inviteeId = data.inviteeId;
    const inviterName = data.inviterNickname || '사용자';
    const projectName = data.projectName || '프로젝트';

    if (!inviteeId) return;

    await sendPushToUser(inviteeId, 'invitation', {
        title: `📨 프로젝트 초대`,
        body: `${inviterName}님이 '${projectName}'에 초대했습니다`,
        data: { type: 'invitation' },
    });
});
