import React from 'react';
import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function TermsPage() {
    return (
        <div className="legal-page">
            {/* 헤더 */}
            <div className="legal-header">
                <div className="legal-header-inner">
                    <Link to="/" className="legal-back-btn">← 홈</Link>
                    <span className="legal-header-title">이용약관</span>
                </div>
            </div>

            {/* 본문 */}
            <div className="legal-content">
                <p className="legal-updated">최종 수정일: 2026년 3월 13일</p>

                <div className="legal-section">
                    <h2>제 1조 (목적)</h2>
                    <p>
                        이 약관은 아트미디어(이하 "회사")가 제공하는 "TodoList Share" 서비스(이하 "서비스")의
                        이용에 관한 조건 및 절차, 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                    </p>
                </div>

                <div className="legal-section">
                    <h2>제 2조 (서비스 내용)</h2>
                    <p>회사는 다음의 서비스를 제공합니다:</p>
                    <ul>
                        <li>체크리스트 생성, 편집 및 관리</li>
                        <li>프로젝트(페이지) 단위의 체크리스트 공유</li>
                        <li>실시간 동기화 및 팀 협업 기능</li>
                        <li>체크리스트 내 채팅 기능</li>
                        <li>구글 캘린더 연동</li>
                        <li>마감일 알림 및 스마트 알림</li>
                        <li>체크리스트 외부 공유 (URL 링크)</li>
                    </ul>
                    <p>서비스는 웹(todolist-share.web.app) 및 Android 앱을 통해 제공됩니다.</p>
                </div>

                <div className="legal-section">
                    <h2>제 3조 (요금제 및 결제)</h2>
                    <h3>가. 요금제 구분</h3>
                    <ul>
                        <li><strong>Free</strong>: 페이지 3개, 멤버 2명, 기본 기능 제공 (광고 포함)</li>
                        <li><strong>Pro</strong>: 페이지 10개, 멤버 5명, 캘린더 연동, 검색, 마감일 알림, 광고 제거</li>
                        <li><strong>Team</strong>: 페이지 무제한, 멤버 30명, 통계, 뷰어 권한, 광고 제거</li>
                    </ul>
                    <h3>나. 무료 체험</h3>
                    <p>최초 가입 시 7일간 Pro 기능을 무료로 체험할 수 있습니다 (계정당 1회).</p>
                    <h3>다. 결제 및 환불</h3>
                    <ul>
                        <li>유료 구독은 Google Play 인앱 결제를 통해 처리됩니다.</li>
                        <li>환불은 Google Play의 환불 정책에 따릅니다.</li>
                        <li>구독 취소 시 현재 결제 기간 종료까지 서비스를 이용할 수 있습니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 4조 (계정 및 이용자 의무)</h2>
                    <ul>
                        <li>서비스는 Google 계정을 통해서만 가입할 수 있습니다.</li>
                        <li>닉네임은 최초 설정 후 변경이 불가능하므로 신중히 설정해주세요.</li>
                        <li>이용자는 자신의 계정을 타인에게 양도하거나 공유할 수 없습니다.</li>
                        <li>이용자는 서비스 이용 시 관계 법령을 준수해야 합니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 5조 (콘텐츠 소유권)</h2>
                    <ul>
                        <li>이용자가 작성한 체크리스트, 첨부 파일, 채팅 메시지 등 콘텐츠의 소유권은 이용자에게 귀속됩니다.</li>
                        <li>체크리스트를 외부 공유(URL)할 경우, 공유 시점의 스냅샷이 생성되며, 원본 수정은 반영되지 않습니다.</li>
                        <li>공유를 취소하면 해당 스냅샷은 즉시 삭제되며 더 이상 외부에서 접근할 수 없습니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 6조 (금지 행위)</h2>
                    <p>이용자는 다음 행위를 해서는 안 됩니다:</p>
                    <ul>
                        <li>서비스를 불법적인 목적으로 이용하는 행위</li>
                        <li>타인의 개인정보를 무단으로 수집하거나 이용하는 행위</li>
                        <li>불법 콘텐츠를 게시하거나 유포하는 행위</li>
                        <li>서비스의 정상 운영을 방해하는 행위 (해킹, DDoS 등)</li>
                        <li>자동화 도구를 이용한 대량 접근 행위</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 7조 (서비스 변경 및 중단)</h2>
                    <ul>
                        <li>회사는 운영상 필요한 경우 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.</li>
                        <li>서비스 변경 시 사전에 공지하며, 긴급한 경우 사후에 공지할 수 있습니다.</li>
                        <li>천재지변, 시스템 장애 등 불가항력 사유로 인한 서비스 중단에 대해서는 책임을 지지 않습니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 8조 (면책 조항)</h2>
                    <ul>
                        <li>이용자가 공유한 체크리스트의 내용에 대한 책임은 해당 이용자에게 귀속됩니다.</li>
                        <li>회사는 무료로 제공되는 서비스에 대하여 관련 법령에서 정하는 범위 내에서 책임을 지지 않습니다.</li>
                        <li>이용자 간 또는 이용자와 제3자 간의 분쟁에 대해 회사는 개입할 의무가 없으며, 이에 대한 책임을 지지 않습니다.</li>
                    </ul>
                </div>

                <div className="legal-section">
                    <h2>제 9조 (약관 변경)</h2>
                    <p>
                        회사는 필요한 경우 약관을 변경할 수 있으며, 변경된 약관은 서비스 내 공지 및 이메일을 통해 사전 고지합니다.
                        변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고 계정을 삭제할 수 있습니다.
                    </p>
                </div>

                <div className="legal-section">
                    <h2>제 10조 (준거법 및 관할)</h2>
                    <p>
                        이 약관은 대한민국 법률에 따라 해석되며, 서비스 이용에 관한 분쟁은
                        민사소송법에 따른 관할 법원을 전속 관할 법원으로 합니다.
                    </p>
                </div>

                <div className="legal-section">
                    <h2>부칙</h2>
                    <p>이 약관은 2026년 3월 13일부터 시행됩니다.</p>
                    <div className="legal-contact">
                        <p><strong>상호</strong>: 아트미디어</p>
                        <p><strong>이메일</strong>: <a href="mailto:jedgoh@naver.com">jedgoh@naver.com</a></p>
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
