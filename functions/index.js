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
        }

        console.log(`cleanupDeletedItems: ${totalDeleted}개 아이템 영구 삭제 완료`);
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
