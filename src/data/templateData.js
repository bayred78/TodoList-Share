// 템플릿 데이터: 카테고리별 페이지 제목 + 자동 체크리스트
export const TEMPLATE_DATA = {
    '친구': [
        {
            title: '친구 모임 계획', desc: '정기 모임 일정과 준비사항을 관리합니다.', items: [
                { title: '장소 후보 리스트업', content: '접근성, 분위기, 가격대 고려' },
                { title: '날짜 투표 받기', content: '참석 가능 날짜 확인' },
                { title: '회비 정산', content: '1/N 또는 담당자 지정' },
            ]
        },
        {
            title: '생일 축하 준비', desc: '친구 생일 파티를 계획합니다.', items: [
                { title: '선물 아이디어 모으기', content: '최근 관심사 파악' },
                { title: '서프라이즈 역할 분담', content: '케이크, 장식, 초대' },
                { title: '축하 메시지 준비', content: '롤링페이퍼 또는 영상' },
            ]
        },
        {
            title: '동호회 활동 관리', desc: '동호회 일정과 회원 관리를 합니다.', items: [
                { title: '월별 활동 계획', content: '정기/비정기 모임 구분' },
                { title: '회비 관리', content: '입출금 내역 기록' },
                { title: '신규 회원 안내', content: '활동 규칙 공유' },
            ]
        },
    ],
    '가족': [
        {
            title: '주간 집안일 분담', desc: '가족 구성원별 집안일을 분담합니다.', items: [
                { title: '청소 담당 배정', content: '거실, 주방, 화장실 등' },
                { title: '장보기 목록 작성', content: '필요한 식재료 및 생필품' },
                { title: '쓰레기 분리수거', content: '요일별 배출 일정' },
            ]
        },
        {
            title: '가족 여행 계획', desc: '가족 여행 준비를 체계적으로 관리합니다.', items: [
                { title: '여행지 선정', content: '가족 투표로 결정' },
                { title: '숙소 예약', content: '위치, 가격, 편의시설 비교' },
                { title: '준비물 체크리스트', content: '의류, 세면도구, 상비약 등' },
                { title: '예산 계획', content: '교통비, 숙박비, 식비, 관광비' },
            ]
        },
        {
            title: '아이 교육 관리', desc: '자녀 학습과 활동을 추적합니다.', items: [
                { title: '학원/과외 시간표', content: '요일별 일정 정리' },
                { title: '숙제 확인', content: '과목별 숙제 체크' },
                { title: '독서 기록', content: '읽은 책과 감상 기록' },
            ]
        },
    ],
    '업무': [
        {
            title: '프로젝트 태스크 관리', desc: '팀 프로젝트의 할 일을 관리합니다.', items: [
                { title: '요구사항 정리', content: '목표와 범위 명확화' },
                { title: '마일스톤 설정', content: '주요 산출물과 기한' },
                { title: '담당자 배정', content: '역할과 책임 분배' },
                { title: '진행 상황 공유', content: '주간 보고 작성' },
            ]
        },
        {
            title: '회의 안건 및 후속 조치', desc: '회의 내용을 기록하고 후속 조치를 추적합니다.', items: [
                { title: '안건 목록 작성', content: '우선순위별 정리' },
                { title: '회의록 작성', content: '결정사항과 담당자 기록' },
                { title: '후속 조치 확인', content: '기한 내 완료 여부 체크' },
            ]
        },
        {
            title: '신입사원 온보딩', desc: '신입 교육과 필요 서류를 체크합니다.', items: [
                { title: 'IT 장비 세팅', content: '노트북, 계정, 프린터' },
                { title: '필수 교육 이수', content: '보안 교육, 사내 시스템' },
                { title: '멘토 배정', content: '1:1 멘토링 일정' },
            ]
        },
    ],
    '학습': [
        {
            title: '시험 공부 계획', desc: '과목별 학습 일정을 관리합니다.', items: [
                { title: '과목별 범위 정리', content: '출제 범위 확인' },
                { title: '기출문제 풀기', content: '최근 3개년 분석' },
                { title: '오답 정리', content: '취약 부분 집중 학습' },
            ]
        },
        {
            title: '자격증 준비', desc: '자격증 취득을 위한 학습 계획입니다.', items: [
                { title: '접수 일정 확인', content: '시험일, 접수 기간' },
                { title: '교재 및 강의 선택', content: '추천 교재 리서치' },
                { title: '모의고사 풀기', content: '실전 감각 익히기' },
            ]
        },
        {
            title: '독서 모임', desc: '함께 읽는 책과 토론 일정을 관리합니다.', items: [
                { title: '이달의 도서 선정', content: '투표로 결정' },
                { title: '읽기 일정 설정', content: '주차별 페이지 할당' },
                { title: '토론 주제 정리', content: '핵심 질문 3-5개' },
            ]
        },
    ],
    '건강': [
        {
            title: '운동 루틴', desc: '주간 운동 계획을 세우고 기록합니다.', items: [
                { title: '월·수·금 유산소', content: '30분 이상 달리기/자전거' },
                { title: '화·목 근력 운동', content: '상체/하체 번갈아' },
                { title: '주말 스트레칭', content: '유연성 향상 루틴' },
            ]
        },
        {
            title: '다이어트 관리', desc: '식단과 체중을 기록합니다.', items: [
                { title: '식단 기록', content: '아침, 점심, 저녁, 간식' },
                { title: '체중/체지방 기록', content: '주 1회 측정' },
                { title: '물 섭취량 체크', content: '하루 2L 목표' },
            ]
        },
        {
            title: '건강 검진 준비', desc: '건강 검진 일정과 결과를 관리합니다.', items: [
                { title: '검진 예약', content: '병원, 날짜, 주의사항' },
                { title: '금식 확인', content: '전날 저녁 이후 금식' },
                { title: '결과 확인 및 상담', content: '이상 수치 체크' },
            ]
        },
    ],
    '취미': [
        {
            title: '요리 레시피 모음', desc: '시도해볼 요리 레시피를 모읍니다.', items: [
                { title: '이번 주 메뉴 정하기', content: '재료 효율적 활용' },
                { title: '재료 장보기', content: '필요 재료 목록' },
                { title: '후기 기록', content: '맛 평가 및 개선점' },
            ]
        },
        {
            title: '그림/사진 프로젝트', desc: '창작 작업을 계획하고 추적합니다.', items: [
                { title: '주제 선정', content: '영감 수집 및 컨셉 결정' },
                { title: '작업 진행', content: '일정별 진행 상황' },
                { title: '피드백 수집', content: 'SNS 공유 또는 전시' },
            ]
        },
        {
            title: '악기 연습', desc: '연습 곡과 일정을 계획합니다.', items: [
                { title: '연습곡 선정', content: '난이도별 목록' },
                { title: '일일 연습 30분', content: '기초 음계 + 곡 연습' },
                { title: '연주 영상 녹화', content: '성장 기록용' },
            ]
        },
    ],
    '여행': [
        {
            title: '국내 여행 준비', desc: '국내 여행 일정과 준비물을 관리합니다.', items: [
                { title: '여행지 리서치', content: '맛집, 관광지, 숙소' },
                { title: '교통편 예약', content: 'KTX, 렌터카, 버스' },
                { title: '짐 싸기 체크리스트', content: '의류, 충전기, 상비약' },
            ]
        },
        {
            title: '해외 여행 준비', desc: '해외 여행 준비를 꼼꼼히 체크합니다.', items: [
                { title: '여권/비자 확인', content: '유효기간 6개월 이상' },
                { title: '항공권 예약', content: '가격 비교 및 좌석 선택' },
                { title: '여행자 보험 가입', content: '보장 내역 확인' },
                { title: '환전', content: '필요 금액 산정' },
            ]
        },
        {
            title: '여행 경비 정산', desc: '여행 비용을 기록하고 정산합니다.', items: [
                { title: '공통 비용 기록', content: '숙박, 교통, 식사' },
                { title: '개인 비용 분리', content: '쇼핑, 개인 활동' },
                { title: '최종 정산', content: '1/N 계산 및 송금' },
            ]
        },
    ],
    '재정': [
        {
            title: '월별 가계부', desc: '수입/지출을 추적합니다.', items: [
                { title: '고정 지출 정리', content: '월세, 보험, 통신비 등' },
                { title: '변동 지출 기록', content: '식비, 교통비, 여가비' },
                { title: '저축 목표 점검', content: '목표 대비 달성률' },
            ]
        },
        {
            title: '비상금 모으기', desc: '비상금 목표를 설정하고 추적합니다.', items: [
                { title: '목표 금액 설정', content: '3-6개월 생활비' },
                { title: '자동이체 설정', content: '급여일 다음날 자동 저축' },
                { title: '진행 상황 점검', content: '월별 달성률 기록' },
            ]
        },
        {
            title: '공과금 관리', desc: '각종 공과금 납부를 관리합니다.', items: [
                { title: '전기/가스/수도 납부', content: '자동이체 또는 수동 확인' },
                { title: '관리비 확인', content: '세부 항목 점검' },
                { title: '통신비 점검', content: '요금제 최적화 검토' },
            ]
        },
    ],
};
