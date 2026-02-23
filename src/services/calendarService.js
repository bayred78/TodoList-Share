// Google Calendar API 연동 서비스
//
// === 인증 방식 ===
// 웹: signInWithPopup으로 Google OAuth 액세스 토큰 취득
// 네이티브(Android/iOS): @capacitor-firebase/authentication 플러그인으로 토큰 취득

import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// localStorage 키
const TOKEN_STORAGE_KEY = 'calendarOAuthToken';
const EXPIRY_STORAGE_KEY = 'calendarTokenExpiry';

// localStorage에서 토큰 복원
let cachedOAuthToken = localStorage.getItem(TOKEN_STORAGE_KEY) || null;
let tokenExpiresAt = parseInt(localStorage.getItem(EXPIRY_STORAGE_KEY) || '0', 10);
let authInProgress = null; // 동시 인증 시도 방지

// 토큰을 메모리 + localStorage에 저장
function saveToken(token, expiresAt) {
    cachedOAuthToken = token;
    tokenExpiresAt = expiresAt;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(EXPIRY_STORAGE_KEY, String(expiresAt));
}

// 토큰 클리어
function clearToken() {
    cachedOAuthToken = null;
    tokenExpiresAt = 0;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(EXPIRY_STORAGE_KEY);
}

// 캐시된 토큰이 유효한지 확인 (인증 팝업 없이 API 호출 가능 여부)
export function hasCalendarToken() {
    return !!cachedOAuthToken && Date.now() < tokenExpiresAt;
}

// 로그인 시 받은 캘린더 토큰을 저장 (authService에서 호출)
export function saveTokenFromLogin(accessToken) {
    saveToken(accessToken, Date.now() + 50 * 60 * 1000);
}

// Google OAuth 액세스 토큰 취득
export async function getOAuthAccessToken() {
    // 캐시된 토큰이 아직 유효한 경우 재사용
    if (cachedOAuthToken && Date.now() < tokenExpiresAt) {
        return cachedOAuthToken;
    }

    // 만료된 토큰 정리
    clearToken();

    // 이미 인증 진행 중이면 해당 Promise 재사용 (동시 팝업 방지)
    if (authInProgress) {
        return authInProgress;
    }

    const user = auth.currentUser;
    if (!user) throw new Error('로그인이 필요합니다.');

    authInProgress = (async () => {
        let accessToken;

        try {
            if (Capacitor.isNativePlatform()) {
                // === 네이티브 앱 (Android/iOS) ===
                // Google Sign-In SDK가 자동으로 토큰 갱신 (사용자 팝업 없음)
                const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

                const result = await FirebaseAuthentication.signInWithGoogle({
                    scopes: [CALENDAR_SCOPE],
                });

                accessToken = result.credential?.accessToken;

                if (!accessToken) {
                    throw new Error('캘린더 액세스 토큰을 가져올 수 없습니다. 다시 시도해주세요.');
                }
            } else {
                // === 웹 브라우저 ===
                const provider = new GoogleAuthProvider();
                provider.addScope(CALENDAR_SCOPE);
                provider.setCustomParameters({
                    login_hint: user.email,
                });

                try {
                    const result = await signInWithPopup(auth, provider);
                    const credential = GoogleAuthProvider.credentialFromResult(result);
                    accessToken = credential?.accessToken;

                    if (!accessToken) {
                        throw new Error('OAuth 액세스 토큰을 가져올 수 없습니다.');
                    }
                } catch (error) {
                    console.error('캘린더 인증 실패:', error);
                    if (error.code === 'auth/popup-blocked') {
                        throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
                    }
                    if (error.code === 'auth/popup-closed-by-user') {
                        throw new Error('인증이 취소되었습니다.');
                    }
                    throw new Error('캘린더 인증에 실패했습니다. 다시 시도해주세요.');
                }
            }

            // 토큰 캐시 (약 50분, 구글 OAuth 토큰은 보통 1시간 유효)
            saveToken(accessToken, Date.now() + 50 * 60 * 1000);

            return accessToken;
        } finally {
            authInProgress = null;
        }
    })();

    return authInProgress;
}

// 캘린더에 이벤트 추가
export async function addEventToCalendar(calendarId, title, description = '', date = null) {
    const accessToken = await getOAuthAccessToken();
    const eventDate = date || new Date().toISOString().split('T')[0];

    const event = {
        summary: title,
        description: description || `투두리스트: ${title}`,
        start: { date: eventDate },
        end: { date: eventDate },
    };

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        }
    );

    if (!response.ok) {
        // 401이면 토큰 만료 → 캐시 초기화 후 재시도
        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event),
                }
            );
            if (!retryRes.ok) {
                const error = await retryRes.json();
                throw new Error(`캘린더 이벤트 추가 실패: ${error.error?.message || '알 수 없는 오류'}`);
            }
            const createdEvent = await retryRes.json();
            return createdEvent.id;
        }

        const error = await response.json();
        throw new Error(`캘린더 이벤트 추가 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }

    const createdEvent = await response.json();
    return createdEvent.id;
}

// 캘린더에서 이벤트 삭제
export async function removeEventFromCalendar(calendarId, eventId) {
    const accessToken = await getOAuthAccessToken();

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok && response.status !== 404) {
        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${newToken}` },
                }
            );
            if (!retryRes.ok && retryRes.status !== 404) {
                const error = await retryRes.json();
                throw new Error(`캘린더 이벤트 삭제 실패: ${error.error?.message || '알 수 없는 오류'}`);
            }
            return;
        }

        const error = await response.json();
        throw new Error(`캘린더 이벤트 삭제 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }
}

// 캘린더 목록 가져오기
export async function getCalendarList() {
    const accessToken = await getOAuthAccessToken();

    const response = await fetch(
        `${CALENDAR_API_BASE}/users/me/calendarList`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error('캘린더 목록을 가져올 수 없습니다.');
    }

    const data = await response.json();
    return data.items || [];
}

// 캘린더를 내 계정에 구독 추가 (calendarList.insert)
// ACL 공유 후 이 함수를 호출하면 이메일 수락 없이 캘린더가 바로 추가됨
export async function subscribeToCalendar(calendarId) {
    const accessToken = await getOAuthAccessToken();

    const response = await fetch(
        `${CALENDAR_API_BASE}/users/me/calendarList`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: calendarId }),
        }
    );

    // 409 Conflict = 이미 구독됨 → 정상 처리
    if (response.status === 409) {
        return { alreadySubscribed: true };
    }

    if (!response.ok) {
        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/users/me/calendarList`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: calendarId }),
                }
            );
            if (retryRes.status === 409) {
                return { alreadySubscribed: true };
            }
            if (!retryRes.ok) {
                const error = await retryRes.json();
                throw new Error(`캘린더 구독 실패: ${error.error?.message || '알 수 없는 오류'}`);
            }
            return await retryRes.json();
        }
        const error = await response.json();
        throw new Error(`캘린더 구독 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }

    return await response.json();
}
// 캘린더에 사용자 공유 추가 (ACL)
export async function shareCalendarWithUser(calendarId, email) {
    const accessToken = await getOAuthAccessToken();

    const aclRule = {
        role: 'writer', // 이벤트 추가/수정/삭제 가능
        scope: {
            type: 'user',
            value: email,
        },
    };

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(aclRule),
        }
    );

    if (!response.ok) {
        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(aclRule),
                }
            );
            if (!retryRes.ok) {
                const error = await retryRes.json();
                throw new Error(`캘린더 공유 추가 실패: ${error.error?.message || '알 수 없는 오류'}`);
            }
            const result = await retryRes.json();
            return result.id;
        }
        const error = await response.json();
        throw new Error(`캘린더 공유 추가 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }

    const result = await response.json();
    return result.id; // ACL rule ID
}

// 캘린더에서 사용자 공유 제거 (ACL)
export async function unshareCalendarWithUser(calendarId, email) {
    const accessToken = await getOAuthAccessToken();

    // ACL rule ID는 "user:email" 형식
    const ruleId = `user:${email}`;

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent(ruleId)}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok && response.status !== 404) {
        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent(ruleId)}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${newToken}` },
                }
            );
            if (!retryRes.ok && retryRes.status !== 404) {
                const error = await retryRes.json();
                throw new Error(`캘린더 공유 제거 실패: ${error.error?.message || '알 수 없는 오류'}`);
            }
            return;
        }
        const error = await response.json();
        throw new Error(`캘린더 공유 제거 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }
}

// 캘린더에 이벤트가 실제로 존재하는지 확인
export async function checkEventExists(calendarId, eventId) {
    try {
        const accessToken = await getOAuthAccessToken();
        const response = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }
        );

        if (response.ok) {
            const event = await response.json();
            // 이벤트가 취소(삭제)된 경우도 존재하지 않는 것으로 처리
            return event.status !== 'cancelled';
        }

        if (response.status === 404 || response.status === 410) {
            return false; // 이벤트가 없음
        }

        if (response.status === 401) {
            clearToken();
            const newToken = await getOAuthAccessToken();
            const retryRes = await fetch(
                `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${newToken}` },
                }
            );
            if (retryRes.ok) {
                const event = await retryRes.json();
                return event.status !== 'cancelled';
            }
            return false;
        }

        return true; // 기타 오류는 존재한다고 가정 (안전하게)
    } catch (e) {
        return true; // 네트워크 오류 등은 존재한다고 가정
    }
}

// 캘린더 ACL 목록에서 공유된 사용자 이메일 목록 반환
export async function getCalendarAclEmails(calendarId) {
    try {
        const accessToken = await getOAuthAccessToken();
        const response = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }
        );

        if (!response.ok) {
            if (response.status === 401) {
                clearToken();
                const newToken = await getOAuthAccessToken();
                const retryRes = await fetch(
                    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
                    {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${newToken}` },
                    }
                );
                if (!retryRes.ok) return null;
                const data = await retryRes.json();
                return extractUserEmails(data);
            }
            return null;
        }

        const data = await response.json();
        return extractUserEmails(data);
    } catch (e) {
        return null; // 오류 시 null 반환 (검증 스킵)
    }
}

function extractUserEmails(aclData) {
    if (!aclData?.items) return [];
    return aclData.items
        .filter(rule => rule.scope?.type === 'user' && rule.role !== 'owner')
        .map(rule => rule.scope.value.toLowerCase());
}

// 캘린더 이벤트 목록 조회 (지정 기간)
export async function listCalendarEvents(calendarId, timeMin, timeMax) {
    const accessToken = await getOAuthAccessToken();

    const params = new URLSearchParams({
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
    });

    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

    let response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    // 401이면 토큰 만료 → 캐시 초기화 후 재시도
    if (response.status === 401) {
        clearToken();
        const newToken = await getOAuthAccessToken();
        response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${newToken}` },
        });
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`이벤트 조회 실패: ${error.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    return (data.items || []).map(event => ({
        id: event.id,
        title: event.summary || '(제목 없음)',
        description: event.description || '',
        start: event.start?.date || event.start?.dateTime?.split('T')[0],
        end: event.end?.date || event.end?.dateTime?.split('T')[0],
        isAllDay: !!event.start?.date,
        htmlLink: event.htmlLink,
    }));
}

// 토큰 캐시 초기화 (로그아웃 시 호출)
export function clearCalendarTokenCache() {
    clearToken();
}
