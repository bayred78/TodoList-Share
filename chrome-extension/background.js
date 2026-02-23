// Chrome Extension Background Service Worker
// Firebase 인증 상태를 관리하고 데이터 동기화를 처리합니다.

// 확장앱 설치 시 초기화
chrome.runtime.onInstalled.addListener(() => {
    console.log('TodoList Share 확장앱이 설치되었습니다.');
});

// 메시지 리스너 - 팝업과 통신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_AUTH_TOKEN') {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            sendResponse({ token: token });
        });
        return true; // 비동기 응답
    }
});
