import React from 'react';
import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function PrivacyPage() {
    return (
        <div className="legal-page">
            {/* 헤더 */}
            <div className="legal-header">
                <div className="legal-header-inner">
                    <Link to="/" className="legal-back-btn">← 홈</Link>
                    <span className="legal-header-title">개인정보처리방침</span>
                </div>
            </div>

            {/* 본문 */}
            <div className="legal-content">
                <p className="legal-updated">최종 수정일: 2026년 3월 13일</p>

                <div className="legal-section">
                    <h2>1. 개인정보 수집 항목</h2>
                    <h3>가. 회원가입 시 수집항목</h3>
                    <ul>
                        <li>Google OAuth 2.0을 통한 로그인: 이메일 주소, 이름, 프로필 사진 URL</li>
                        <li>서비스 내 닉네임 (사용자 직접 입력)</li>
                    </ul>
                    <h3>나. 서비스 이용 중 생성되는 정보</h3>
                    <ul>
                        <li>체크리스트 및 프로젝트 데이터</li>
                        <li>첨부 파일 (이미지, 문서)</li>
                        <li>채팅 메시지</li>
                        <li>기기 토큰(FCM Push Token)</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>2. 수집 및 이용 목적</h2>
                    <ul>
                        <li><strong>서비스 제공</strong>: 체크리스트 생성, 공유, 실시간 동기화</li>
                        <li><strong>알림 전송</strong>: 마감일 알림, 채팅 알림, 활동 알림 (Firebase Cloud Messaging)</li>
                        <li><strong>구독 관리</strong>: 요금제 확인 및 결제 처리</li>
                        <li><strong>서비스 개선</strong>: 이용 통계 분석 및 기능 개선</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>3. 보유 및 파기</h2>
                    <p>수집된 개인정보는 서비스 이용 기간 동안 보유하며, 다음의 경우 지체 없이 파기합니다:</p>
                    <ul>
                        <li>회원 탈퇴 또는 계정 삭제 요청 시</li>
                        <li>수집 목적이 달성된 후</li>
                    </ul>
                    <div className="legal-highlight">
                        파기 절차: 삭제 요청 시 30일 이내 모든 데이터(체크리스트, 첨부파일, 채팅 기록)를 영구 삭제합니다.
                    </div>
                </div>

                <div className="legal-section">
                    <h2>4. 제3자 제공</h2>
                    <p>당사는 이용자의 개인정보를 제3자에게 판매하지 않습니다. 다만, 서비스 제공을 위해 다음의 인프라를 사용합니다:</p>
                    <ul>
                        <li><strong>Firebase (Google LLC)</strong>: 데이터 저장(Firestore), 사용자 인증(Auth), 파일 저장(Storage), 푸시 알림(FCM)</li>
                        <li><strong>RevenueCat</strong>: 구독 결제 상태 관리</li>
                        <li><strong>Google AdSense / AdMob</strong>: 광고 제공 (Free 요금제 사용자 대상)</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>5. 광고 관련 안내</h2>
                    <ul>
                        <li>Free 요금제 사용 시 Google AdSense/AdMob 기반의 맞춤형 광고가 게재됩니다.</li>
                        <li>Pro 및 Team 요금제에서는 광고가 제거됩니다.</li>
                        <li>리워드 광고 시청 시 일시적으로 광고가 제거됩니다 (당일 자정까지).</li>
                        <li>광고 제공을 위해 쿠키 및 기기 식별자가 사용될 수 있습니다.</li>
                    </ul>
                    <div className="legal-highlight">
                        Google의 광고 정책에 대한 자세한 내용은{' '}
                        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
                            Google 광고 정책
                        </a>을 참고하세요.
                    </div>
                </div>

                <div className="legal-section">
                    <h2>6. 이용자의 권리</h2>
                    <ul>
                        <li>언제든지 본인의 개인정보에 대한 열람, 수정, 삭제를 요청할 수 있습니다.</li>
                        <li>계정 삭제 시 모든 개인정보 및 서비스 데이터가 영구 삭제됩니다.</li>
                        <li>개인정보 관련 문의는 아래 연락처로 접수해주세요.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>7. 쿠키 사용</h2>
                    <ul>
                        <li>Firebase 인증 토큰 관리를 위해 쿠키를 사용합니다.</li>
                        <li>Google Analytics 및 AdSense 관련 쿠키가 사용될 수 있습니다.</li>
                        <li>브라우저 설정을 통해 쿠키 사용을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>8. 개인정보보호책임자</h2>
                    <div className="legal-contact">
                        <p><strong>상호</strong>: 아트미디어</p>
                        <p><strong>이메일</strong>: <a href="mailto:jedgoh@naver.com">jedgoh@naver.com</a></p>
                        <p>개인정보 관련 문의사항은 위 이메일로 연락해주시면 성실히 답변드리겠습니다.</p>
                    </div>
                </div>
            </div>

            {/* 푸터 */}
            <div className="legal-footer">
                © 2026 아트미디어. All rights reserved.
            </div>
        </div>
    );
}
