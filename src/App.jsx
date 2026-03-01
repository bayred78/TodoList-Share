import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from './stores/authStore';
import Toast from './components/common/Toast';
import BannerAd from './components/ads/BannerAd';
import DevPlanSwitcher from './components/dev/DevPlanSwitcher';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import ProjectPage from './pages/ProjectPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }) {
    const { user, profile, loading, isNewUser } = useAuthStore();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner spinner-lg"></div>
                <p style={{ color: 'var(--color-text-secondary)' }}>로딩 중...</p>
            </div>
        );
    }

    if (!user || isNewUser) {
        return <Navigate to="/login" replace />;
    }

    if (!profile) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

// Android 뒤로가기 버튼 처리
function BackButtonHandler() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        let CapApp = null;

        async function setupBackButton() {
            try {
                const mod = await import('@capacitor/app');
                CapApp = mod.App;

                await CapApp.addListener('backButton', ({ canGoBack }) => {
                    // 다운로드 등 시스템 팝업을 띄운 상태면 뒤로가기 무시 (앱 종료 방지)
                    if (window.isDownloading) {
                        return;
                    }

                    const path = window.location.pathname;

                    // 모달이 열려있으면 닫기 (fullscreen-editor 등)
                    const fullscreenEditor = document.querySelector('.fullscreen-editor');
                    if (fullscreenEditor) {
                        // fullscreen-editor의 뒤로가기 버튼 클릭
                        const backBtn = fullscreenEditor.querySelector('.fullscreen-editor-back');
                        if (backBtn) backBtn.click();
                        return;
                    }

                    // 모달이 열려있으면 닫기
                    const modalOverlay = document.querySelector('.modal-overlay');
                    if (modalOverlay) {
                        const closeBtn = modalOverlay.querySelector('.modal-close');
                        if (closeBtn) closeBtn.click();
                        return;
                    }

                    // /project/:id 페이지 → 메인으로
                    if (path.startsWith('/project/')) {
                        navigate('/', { replace: true });
                        return;
                    }

                    // /settings 페이지 → 메인으로
                    if (path === '/settings') {
                        navigate('/', { replace: true });
                        return;
                    }

                    // 메인 페이지 (/)
                    if (path === '/' || path === '') {
                        // 요청/검색탭이면 → 페이지탭으로 전환
                        const activeTabEl = document.querySelector('.tab-item.active');
                        const projectsTab = document.querySelector('.tab-item[data-tab="projects"]');
                        if (activeTabEl && projectsTab && activeTabEl !== projectsTab) {
                            projectsTab.click();
                            return;
                        }

                        // 페이지탭이면 → 종료 확인
                        if (confirm('앱을 종료하시겠습니까?')) {
                            CapApp.exitApp();
                        }
                        return;
                    }

                    // 기타 경로
                    if (canGoBack) {
                        window.history.back();
                    } else {
                        navigate('/', { replace: true });
                    }
                });
            } catch (e) {
                // 웹 환경에서는 무시
            }
        }

        setupBackButton();

        return () => {
            if (CapApp) {
                CapApp.removeAllListeners();
            }
        };
    }, [navigate]);

    return null;
}

export default function App() {
    const { initialize, user, profile, loading, isNewUser } = useAuthStore();

    useEffect(() => {
        const unsubscribe = initialize();
        return () => unsubscribe();
    }, [initialize]);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner spinner-lg"></div>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>TodoList Share</p>
            </div>
        );
    }

    return (
        <BrowserRouter>
            <BackButtonHandler />
            <Toast />
            <Routes>
                <Route
                    path="/login"
                    element={
                        user && profile && !isNewUser
                            ? <Navigate to="/" replace />
                            : <LoginPage />
                    }
                />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <MainPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/project/:projectId"
                    element={
                        <ProtectedRoute>
                            <ProjectPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <SettingsPage />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {user && profile && !isNewUser && <BannerAd userPlan={profile?.plan} />}
            <DevPlanSwitcher />
        </BrowserRouter>
    );
}
