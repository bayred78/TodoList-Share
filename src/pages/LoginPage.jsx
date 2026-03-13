import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import './LoginPage.css';

export default function LoginPage() {
    const { login, isNewUser, setNickname, user } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);
    const [nickname, setNicknameValue] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        try {
            await login();
        } catch (error) {
            console.error('Login error details:', error);
            addToast(`로그인 실패: ${error.message || error.code || '알 수 없는 오류'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // 닉네임 글자수 계산 (한글=2, 그 외=1, 최대 12포인트 = 한글6자 또는 영문12자)
    const getNicknamePoints = (str) => {
        let points = 0;
        for (const ch of str) {
            points += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
        }
        return points;
    };

    const handleSetNickname = async (e) => {
        e.preventDefault();
        const trimmed = nickname.trim();
        if (!trimmed) {
            addToast('닉네임을 입력해주세요.', 'warning');
            return;
        }
        if (trimmed.length < 2) {
            addToast('닉네임은 최소 2자 이상 입력해주세요.', 'warning');
            return;
        }
        const points = getNicknamePoints(trimmed);
        if (points > 12) {
            addToast('닉네임이 너무 깁니다. (한글 6자 / 영문 12자 이내)', 'warning');
            return;
        }

        setLoading(true);
        try {
            await setNickname(nickname.trim());
            addToast('환영합니다! 닉네임이 설정되었습니다.', 'success');
        } catch (error) {
            addToast(error.message || '닉네임 설정에 실패했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 닉네임 설정 화면
    if (isNewUser && user) {
        return (
            <div className="login-page">
                <div className="login-bg-decoration">
                    <div className="login-blob login-blob-1"></div>
                    <div className="login-blob login-blob-2"></div>
                    <div className="login-blob login-blob-3"></div>
                </div>
                <div className="login-card">
                    <div className="login-logo">👋</div>
                    <h1 className="login-title">반갑습니다!</h1>
                    <p className="login-subtitle">앱에서 사용할 닉네임을 설정해주세요</p>

                    <form onSubmit={handleSetNickname} className="nickname-form">
                        <div className="input-group">
                            <label className="input-label">닉네임</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="한글 6자 / 영문 12자 이내"
                                value={nickname}
                                onChange={(e) => setNicknameValue(e.target.value)}
                                maxLength={12}
                                autoFocus
                            />
                        </div>
                        <p className="nickname-hint">
                            ⚠ 닉네임은 한 번 설정하면 변경할 수 없습니다.
                        </p>
                        <button
                            type="submit"
                            className="btn btn-primary btn-block btn-lg"
                            disabled={loading}
                        >
                            {loading ? <span className="spinner"></span> : '시작하기'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // 메인 로그인 화면
    return (
        <div className="login-page">
            {/* 배경 블롭 장식 */}
            <div className="login-bg-decoration">
                <div className="login-blob login-blob-1"></div>
                <div className="login-blob login-blob-2"></div>
                <div className="login-blob login-blob-3"></div>
            </div>

            <div className="login-card">
                <div className="login-logo">📝</div>
                <h1 className="login-title">TodoList Share</h1>
                <p className="login-subtitle">
                    할 일을 팀과 함께 공유하고,<br />
                    목표를 함께 달성하세요.
                </p>

                {/* 기능 하이라이트 (컬러 아이콘 + 한 줄 설명) */}
                <div className="login-features">
                    <div className="login-feature">
                        <div className="login-feature-icon-wrap purple">🤝</div>
                        <div className="login-feature-text">
                            <span className="login-feature-name">실시간 공유</span>
                            <span className="login-feature-desc">팀원과 체크리스트를 즉시 동기화</span>
                        </div>
                    </div>
                    <div className="login-feature">
                        <div className="login-feature-icon-wrap green">📅</div>
                        <div className="login-feature-text">
                            <span className="login-feature-name">구글 캘린더 연동</span>
                            <span className="login-feature-desc">마감일을 일정에 자동 반영</span>
                        </div>
                    </div>
                    <div className="login-feature">
                        <div className="login-feature-icon-wrap orange">💬</div>
                        <div className="login-feature-text">
                            <span className="login-feature-name">체크리스트 내 채팅</span>
                            <span className="login-feature-desc">별도 메신저 없이 바로 소통</span>
                        </div>
                    </div>
                    <div className="login-feature">
                        <div className="login-feature-icon-wrap pink">📱</div>
                        <div className="login-feature-text">
                            <span className="login-feature-name">크로스 플랫폼</span>
                            <span className="login-feature-desc">웹과 안드로이드 어디서든 이용</span>
                        </div>
                    </div>
                </div>

                <button
                    className="btn-google"
                    onClick={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <span className="spinner"></span>
                    ) : (
                        <>
                            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Google로 로그인
                        </>
                    )}
                </button>

                {/* 하단 링크 */}
                <div className="login-footer-links">
                    <Link to="/" className="login-footer-link">소개</Link>
                    <Link to="/privacy" className="login-footer-link">개인정보처리방침</Link>
                    <Link to="/terms" className="login-footer-link">이용약관</Link>
                </div>
            </div>
        </div>
    );
}
