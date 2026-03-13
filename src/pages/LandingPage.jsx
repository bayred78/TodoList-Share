import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
    return (
        <div className="landing-page">
            {/* ===== 헤더 ===== */}
            <nav className="landing-nav">
                <div className="landing-nav-inner">
                    <Link to="/" className="landing-logo">
                        <span className="landing-logo-icon">✅</span>
                        <span>TodoList Share</span>
                    </Link>
                    <div className="landing-nav-links">
                        <Link to="/privacy" className="landing-nav-link">개인정보처리방침</Link>
                        <Link to="/terms" className="landing-nav-link">이용약관</Link>
                        <Link to="/login" className="landing-nav-cta">시작하기</Link>
                    </div>
                </div>
            </nav>

            {/* ===== 히어로 ===== */}
            <section className="landing-hero">
                <div className="landing-hero-inner">
                    <span className="landing-hero-badge">🤝 실시간 공유 체크리스트</span>
                    <h1>목표를 나누면,<br />실천은 배가 됩니다</h1>
                    <p className="landing-hero-sub">
                        가족, 연인, 팀원과 함께 체크리스트를 실시간으로 공유하고 관리하세요.<br />
                        할 일을 나누고, 진행 상황을 함께 확인하고, 목표를 함께 달성하세요.
                    </p>
                    <Link to="/login" className="landing-hero-cta">무료로 시작하기</Link>
                </div>
            </section>

            {/* ===== 비주얼 쇼케이스 ===== */}
            <section className="landing-showcase">
                <img src="/images/hero.jpg" alt="TodoList Share - 실시간 공유 체크리스트 서비스" loading="lazy" />
            </section>

            {/* ===== 기능 소개 ===== */}
            <section className="landing-features">
                <h2 className="landing-features-title">왜 TodoList Share인가요?</h2>
                <p className="landing-features-sub">혼자 관리하던 할 일, 이제 함께 관리하세요</p>
                <div className="landing-features-grid">
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">🤝</span>
                        <h3 className="landing-feature-name">실시간 공유</h3>
                        <p className="landing-feature-desc">체크 완료, 항목 추가 — 모든 변경이 팀원에게 즉시 반영됩니다.</p>
                    </div>
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">💬</span>
                        <h3 className="landing-feature-name">체크리스트 내 채팅</h3>
                        <p className="landing-feature-desc">할 일 옆에서 바로 대화하세요. 별도 메신저 없이 소통할 수 있습니다.</p>
                    </div>
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">📅</span>
                        <h3 className="landing-feature-name">구글 캘린더 연동</h3>
                        <p className="landing-feature-desc">마감일을 캘린더에 자동 연동하여 일정과 할 일을 한 곳에서 관리합니다.</p>
                    </div>
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">🔔</span>
                        <h3 className="landing-feature-name">스마트 마감일 알림</h3>
                        <p className="landing-feature-desc">마감일이 다가오면 자동으로 알림을 보내드립니다. 놓치는 일 없이.</p>
                    </div>
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">🌙</span>
                        <h3 className="landing-feature-name">다크 모드</h3>
                        <p className="landing-feature-desc">어두운 환경에서도 눈의 피로 없이 편안하게 사용하세요.</p>
                    </div>
                    <div className="landing-feature-card">
                        <span className="landing-feature-icon">📱</span>
                        <h3 className="landing-feature-name">크로스 플랫폼</h3>
                        <p className="landing-feature-desc">웹과 Android 앱 어디서든 동일한 데이터로 이용 가능합니다.</p>
                    </div>
                </div>
            </section>

            {/* ===== 시나리오 섹션 ===== */}
            <section className="landing-scenarios">
                <div className="landing-scenario">
                    <div className="landing-scenario-img">
                        <img src="/images/family.jpg" alt="가족과 함께 사용하는 TodoList Share" loading="lazy" />
                    </div>
                    <div className="landing-scenario-text">
                        <h3 className="landing-scenario-title">🏠 가족과 함께</h3>
                        <p className="landing-scenario-desc">
                            장보기 목록, 여행 계획, 집안일 분담까지.
                            가족 모두가 실시간으로 체크하고, 알림으로 서로 소통하세요.
                            함께라서 더 쉬운 일정 관리를 경험하세요.
                        </p>
                    </div>
                </div>
                <div className="landing-scenario reverse">
                    <div className="landing-scenario-img">
                        <img src="/images/team.jpg" alt="팀과 함께 사용하는 TodoList Share" loading="lazy" />
                    </div>
                    <div className="landing-scenario-text">
                        <h3 className="landing-scenario-title">💼 팀과 함께</h3>
                        <p className="landing-scenario-desc">
                            프로젝트 진행 상황을 한눈에 파악하세요.
                            멤버 초대, 권한 설정, 실시간 채팅으로
                            어디서든 완벽한 팀워크를 발휘할 수 있습니다.
                        </p>
                    </div>
                </div>
            </section>

            {/* ===== 요금제 ===== */}
            <section className="landing-pricing">
                <h2 className="landing-pricing-title">나에게 맞는 요금제</h2>
                <p className="landing-pricing-sub">7일 무료 체험으로 Pro 기능을 먼저 경험해보세요</p>
                <div className="landing-pricing-grid">
                    {/* Free */}
                    <div className="landing-price-card">
                        <h3 className="landing-price-name">Free</h3>
                        <ul className="landing-price-list">
                            <li>페이지 3개</li>
                            <li>멤버 2명</li>
                            <li>체크리스트 50개</li>
                            <li>중요도 · 라벨 기능</li>
                            <li>반복 설정 (3개)</li>
                        </ul>
                    </div>
                    {/* Pro */}
                    <div className="landing-price-card featured">
                        <span className="landing-price-badge">추천</span>
                        <h3 className="landing-price-name">Pro</h3>
                        <ul className="landing-price-list">
                            <li>페이지 10개</li>
                            <li>멤버 5명</li>
                            <li>체크리스트 무제한</li>
                            <li>구글 캘린더 연동</li>
                            <li>검색 · 마감일 알림</li>
                            <li>이미지 채팅</li>
                            <li>광고 제거</li>
                        </ul>
                    </div>
                    {/* Team */}
                    <div className="landing-price-card">
                        <h3 className="landing-price-name">Team</h3>
                        <ul className="landing-price-list">
                            <li>페이지 무제한</li>
                            <li>멤버 30명</li>
                            <li>Pro 전체 기능 포함</li>
                            <li>통계 대시보드</li>
                            <li>뷰어 권한 설정</li>
                            <li>대표 아이콘</li>
                            <li>광고 제거</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* ===== CTA 섹션 ===== */}
            <section className="landing-cta">
                <h2>지금 바로 시작하세요</h2>
                <p>목표를 나누고, 함께 실천하세요. Google 계정으로 30초 만에 시작할 수 있습니다.</p>
                <div className="landing-cta-buttons">
                    <Link to="/login" className="landing-cta-btn primary">웹에서 시작하기</Link>
                    <a
                        href="https://play.google.com/apps/internaltest/4701714789772629544"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="landing-cta-btn secondary"
                    >
                        Android 앱 다운로드
                    </a>
                </div>
            </section>

            {/* ===== 푸터 ===== */}
            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <div className="landing-footer-links">
                        <Link to="/privacy">개인정보처리방침</Link>
                        <Link to="/terms">이용약관</Link>
                        <a href="mailto:jedgoh@naver.com">문의하기</a>
                    </div>
                    <p className="landing-footer-copy">© 2026 아트미디어. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
