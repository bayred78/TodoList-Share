# 변경 이력 (Change Log)

> `/git` 워크플로우로 자동 생성됩니다. 최신 항목이 맨 위에 추가됩니다.

---

## 2026-03-06 21:30 — 백엔드 성능 최적화 및 결제 연동 고도화
- `functions/index.js`: 데이터 삭제 시 병렬 처리(`Promise.all`) 및 청크 단위 조회를 통한 성능 최적화 (Cloud Functions 타임아웃 및 OOM 방지)
- `firestore.indexes.json`: 데이터 삭제 및 조회를 위한 복합 인덱스 추가
- `subscriptionService.js` / `revenueCatService.js` / `authStore.js`: RevenueCat 인앱 결제 동기화 로직 및 구독 상태 체크 강화
- `ProjectPage.jsx` / `SettingsPage.jsx` / `PlanCompareTable.jsx`: 구독 상태에 따른 UI 반응성 개선 및 결제 모달 버그 수정
- `build.gradle`: 앱 버전 업데이트 (v1.9 / 9)
- Git 태그: `v260306-2130`
- 복원: `git checkout v260306-2130`

## 2026-03-05 20:44 — RevenueCat 인앱 결제 연동 및 UI 버그 수정
- `authStore.js` / `authService.js`: RevenueCat 연동(`@revenuecat/purchases-capacitor`) 및 구독 상태 실시간 동기화
- `revenueCatService.js` [NEW]: RevenueCat 초기화, 상품 정보 조회, 구매 비즈니스 로직 작성
- `SettingsPage.jsx` / `PlanCompareTable.jsx` / `UpgradeModal.jsx`: Pro/Team 구독 및 업그레이드 UI 연결 (결제 처리, Proration 반영)
- `PlanCompareTable.jsx` / `UpgradeModal.jsx`: 무료 혜택(리워드 광고 등) 중복 컴포넌트 호출 제거
- `PlanCompareTable.jsx` / `RewardedAd.css`: 연간 플랜 결제 버튼 텍스트가 잘리는 현상 해결(`.discount-badge` 제거)
- `package.json` / `build.gradle`: RevenueCat capacitor 모듈 종속성 반영
- Git 태그: `v260305-2044`
- 복원: `git checkout v260305-2044`

## 2026-03-05 01:47 — 채팅탭 헤더 UI 일관성 개선 및 구조 정돈
- `ProjectPage.jsx`: 채팅 전용 헤더/탭바 중복 코드 삭제 및 공용 헤더/탭바 하단으로 `.chat-container` 동적 위치 조정
- `ProjectPage.css`: 채팅 관련 불필요한 오버라이드 CSS 속성 제거 및 레이아웃 정리
- Git 태그: `v260305-0147`
- 복원: `git checkout v260305-0147`

## 2026-03-04 00:13 — 위젯 기능 개선 및 최적화
- `todo_widget_info.xml`: 위젯 초기 크기 3×2 셀, 자유 리사이징, reconfigurable 설정
- `widget_config_activity.xml`: 설정창 레이아웃 개선(여백, 미리보기 둥근 모서리, 앱 브랜드 색상)
- `widget_todo.xml`, `widget_todo_item.xml`: 빈 상태 색상 통일, 체크박스 영역 확대
- `TodoWidgetProvider.java`: 딥링크(페이지 제목→프로젝트, 체크리스트→항목), 새로고침 피드백(⏳→⟳), 시간대별 자동갱신(낮 30분/밤 2시간), 페이지 전환 items 갱신 수정
- `TodoWidgetService.java`: 체크리스트 정렬(미완료 우선+최신순), 캐시 우선 최적화, 설정 캐싱
- `WidgetDataHelper.java`: fontSize 저장/로드, toggleItem/Cache, shouldFetch, deleteConfig 완전화
- `TodoWidgetConfigActivity.java`: 설정값 복원, 글씨크기 SeekBar, 저장 버튼 브랜드 색상
- `MainActivity.java`: 위젯 딥링크 처리(onNewIntent, NPE 방어)
- `AndroidManifest.xml`: 위젯 액션 intent-filter 추가, NoActionBar 테마 적용
- Git 태그: `v260304-0013`
- 복원: `git checkout v260304-0013`

## 2026-03-03 15:25 — 체크리스트 보기 모드별 UI 레이아웃 최적화
- `ProjectPage.jsx`: 리스트 모드 — 즐겨찾기 버튼을 체크박스↔제목 사이로 이동, 첨부파일 아이콘을 🔒 왼쪽에 배치, 제목 1줄 말줄임
- `ProjectPage.jsx`: 카드/2열/상세 모드 — `todo-meta-wrap` 구조 도입, 작성자+첨부파일 Row1, 라벨 Row2
- `ProjectPage.jsx`: 카드/2열/상세 모드 — 🔒📅🗑️ 아이콘을 작성자 줄 오른쪽 끝에 인라인 배치
- `ProjectPage.css`: `todo-meta-wrap`, `todo-meta-row`, `todo-author`, `todo-actions-inline` 스타일 추가
- `ProjectPage.css`: 리스트 compact 모드 `todo-title` 말줄임, `todo-attach-icons` 숨김, `todo-attach-icons-compact` 추가
- Git 태그: `v260303-1525`
- 복원: `git checkout v260303-1525`

## 2026-03-03 03:21 — 헤더 고정 + CSV 삭제 + 관리자 배지 삭제 + 코드 정리
- `PageHeader.jsx` [NEW]: ResizeObserver 기반 동적 fixed 헤더 컴포넌트
- `global.css`: 헤더 sticky→fixed 전환, `.page-title` 중복 삭제
- `MainPage.jsx`/`ProjectPage.jsx`/`SettingsPage.jsx`: PageHeader 적용 + 관리자 배지 삭제
- `MainPage.css`/`ProjectPage.css`: `flex-row-gap-sm` 유틸리티 클래스 추가
- CSV 기능 전체 삭제: `csvService.js` 파일 삭제, 6개 파일에서 관련 코드 제거
- `subscriptionService.js`/`UpgradeModal.jsx`/`PlanCompareTable.jsx`: exportCsv 관련 코드 삭제
- 워크플로우 5개에 스킬 통합 (bugfix/pdca/review/design/git)
- Git 태그: `v260303-0321`
- 복원: `git checkout v260303-0321`

## 2026-03-03 02:21 — 체크리스트 참여자(assignees) 기능 구현 + 버그 수정 8건 + 디자인 토큰 정리
- `ProjectPage.jsx`: 체크리스트 참여자(assignees) 선택 UI/로직 구현, 필터·통계·확인을 assignees 기반으로 변경
- `ProjectPage.jsx`: 저장/나가기 시 2단계 네비게이션 버그 3곳 수정 (편집→뷰어 복귀로 통일)
- `ProjectPage.jsx`: 참여자 0명 저장 방지, 확인→완료 명칭, 전원완료 시 confirm 대화상자, 즐겨찾기 trailing space, DM 닉네임 검색
- `ProjectPage.jsx`: 충돌 처리 함수 뷰어 복귀, 반복 도트 `#6366f1`→`var(--color-primary)`
- `ProjectPage.css`: assignee/member-check CSS 추가, 완료 스타일(취소선+회색), 하드코딩 토큰 대체 4곳
- `SettingsPage.jsx`: 설정 페이지 크래시 수정 (import 누락)
- `todoService.js`: assignees 필드 지원
- `global.css`: 디자인 토큰 추가
- Git 태그: `v260303-0221`
- 복원: `git checkout v260303-0221`

## 2026-03-02 04:36 — 디자인 시스템 토큰화 및 멤버 관리 UI 개선
- `ProjectPage.jsx` & `ProjectPage.css`: 인라인 스타일 전면 제거 및 700여 개 하드코딩 수치를 디자인 토큰(`var(--spacing-*)`, `color-mix` 등)으로 교체, 멤버 리스트 Grid 레이아웃 및 권한 드롭다운 UI 통합
- `MainPage.jsx` & `MainPage.css`: 페이지 생성/수정 모달 내 활동명 옵션 정규화 및 디자인 토큰 적용
- `SettingsPage.jsx` & `SettingsPage.css`: 프로필 설정 및 글자수 제한 로직 하드코딩 제거, 디자인 토큰 적용
- `projectService.js`: `useDisplayName` 옵션 제거 및 활동명 상시 사용 로직 적용
- Git 태그: `v260302-0436`
- 복원: `git checkout v260302-0436`

## 2026-03-02 01:41 — 파일 다운로드 크래시 수정 및 검색 UI/디자인 고도화
- `storageService.js` & `FileSaver.java`: 대용량 파일 다운로드 시 OOM(메모리 부족) 방지를 위해 스트리밍 방식(Cache 디스크 경유)으로 전면 리팩토링 및 `try-with-resources` 도입
- `App.jsx` & `storageService.js`: 시스템 다운로드 창 종료 시 발생하는 뒤로가기 이벤트 레이스 컨디션 해결 (500ms 지연 및 이벤트 차단)
- `functions/index.js`: 채팅 이미지 7일 경과 시 자동 삭제 스케줄러 추가
- `MainPage.jsx`: 검색 탭 내 페이지/체크리스트 필터 및 정렬(최신순, 마감일순) UI 구현
- `ProjectPage.css`: 10px 폰트 및 하드코딩된 색상을 디자인 토큰(`var(--font-size-xs)`)으로 정규화
- Git 태그: `v260302-0141`
- 복원: `git checkout v260302-0141`

## 2026-03-01 23:20 — 채팅 키보드 버그 수정 및 디자인 일관성 정규화
- `BannerAd.jsx`: 키보드 활성 시 빈 공간 버그 수정 (AdMob 이벤트 차단 및 `useRef` 도입), 메모리 누수 방지 리스너 해제 추가
- `ProjectPage.jsx`: DM 모달을 MainPage 스타일로 통합 및 친구 즐겨찾기 기능 추가, 닉네임 클릭 시 DM 모달 자동 연결
- `MainPage.jsx`: 즐겨찾기 목록 내 아이템 및 친구 정보 표시 레이아웃 개선, 친구 별명(메모) 편집 기능 강화
- `storageService.js`: 파일 업로드 취소 시 정리를 위한 `deleteStorageFile` 함수 추가
- `global.css`, `MainPage.css`, `ProjectPage.css`: 10px 폰트, 50% 반경 등 하드코딩 제거 및 디자인 토큰(`var(--font-size-*)`, `var(--radius-*)`) 적용
- Git 태그: `v260301-2320`
- 복원: `git checkout v260301-2320`

## 2026-02-26 04:42 — 앱 아이콘 갱신, 용어 통일 및 UI 토큰 적용
- 안드로이드 버저닝 설정 업데이트 (`build.gradle` 버전 1.8 / 8)
- 신규 앱 아이콘 반영 (`@capacitor/assets` 플러그인 이용 안드로이드 에셋 생성)
- UI 노출 텍스트 용어 통일 ('프로젝트' ➡️ '페이지')
- `ProjectPage`, `MainPage` 등 코어 페이지 내 픽셀(px) 및 색상 하드코딩 제거, CSS 디자인 토큰(`var(--spacing-*)` 등) 일괄 적용
- Git 태그: `v260226-0442`
- 복원: `git checkout v260226-0442`

## 2026-02-25 20:30 — 안드로이드 파일 지정 다운로드(Save As) 기능 구현
- `FileSaver.java` [NEW]: 지정된 디렉토리에 파일을 저장하기 위해 안드로이드의 `ACTION_CREATE_DOCUMENT`를 호출하는 커스텀 네이티브 플러그인 추가
- `MainActivity.java`: 앱 구동 시 생성한 `FileSaver` 로컬 플러그인 레지스터 추가
- `storageService.js`: 안드로이드 다운로드 시 무조건 `Documents` 폴더에 저장하던 로직을 `FileSaverPlugin.saveAs` 호출로 변경하여 사용자가 직접 저장 위치를 선택할 수 있도록 개선
- Git 태그: `v260225-2030`
- 복원: `git checkout v260225-2030`

## 2026-02-25 18:22 — 안드로이드 파일 저장 개선 및 이미지 뷰어 줌 기준점 변경
- `storageService.js`: 안드로이드 다운로드 시 공유 시트 대신 기기 공용 문서(`Directory.Documents`) 폴더에 직접 저장하도록 개선 (내 파일 연동)
- `ImageViewer.jsx`: 이미지 뷰어 핀치 줌 시 화면 중앙이 아닌 터치/마우스 중심점 기준으로 확대/축소되도록 개선
- Git 태그: `v260225-1822`
- 복원: `git checkout v260225-1822`

## 2026-02-24 20:46 — 버그 수정 4건 (Storage 규칙 + 업로드 타임아웃 + 구독 UI)
- `storage.rules` [NEW]: Firebase Storage 보안 규칙 생성 (인증 사용자 5MB 이하 업로드 허용)
- `firebase.json`: storage/hosting 섹션 추가
- `storageService.js`: 업로드 30초 타임아웃 추가 (네트워크 불안정 시 무한 대기 방지)
- `MainPage.jsx`: 보낸 초대 카드에 '닫기' 버튼 추가 (카드 UI 통일)
- `subscriptionService.js`: imageChat Free/Pro → false 롤백 (Team 전용)
- `ProjectPage.jsx`: 비구독자 이미지 버튼 🔒 자물쇠 표시 + 클릭 시 업그레이드 모달
- Git 태그: `v260224-2046`
- 복원: `git checkout v260224-2046`

---

## 2026-02-24 20:14 — 버그 수정 3건 + 코드/디자인 리뷰 수정
- `ProjectPage.jsx`: 체크리스트 중복 제목 제한 제거, 완료 항목 하단 정렬 추가
- `subscriptionService.js`: Free/Pro 플랜 이미지 채팅 제한 해제 (`imageChat: true`)
- `todoService.js`: `toggleCheck`에 `updatedBy` 파라미터 추가 (알림 수정자 정확도 개선)
- `authStore.js`: FCM 등록 실패 에러 로깅 추가 (`console.warn`)
- `MainPage.jsx`: 닫기 버튼 `btn-outline` → `btn-secondary` (미정의 클래스 수정)
- `SettingsPage.css`: `gap: 2px` → `var(--spacing-xs)` (디자인 토큰 준수)
- Git 태그: `v260224-2014`
- 복원: `git checkout v260224-2014`

---

## 2026-02-24 15:27 — 리워드/체험판 Firestore 전환 + 코드 리뷰 이슈 수정
- `subscriptionService.js`: 리워드/체험판 localStorage → Firestore 계정 기반 전환, startFreeTrial 중복 방어
- `RewardedAd.jsx`: 광고 완주 시만 보상, 서버 실패 시 보상, 중도 종료 미지급, applyReward 에러 핸들링
- `PlanCompareTable.jsx`: onTrialStart 콜백으로 reload 제거
- `UpgradeModal.jsx`, `SettingsPage.jsx`, `ProjectPage.jsx`, `MainPage.jsx`: profile/onTrialStart/refreshProfile 전달
- Git 태그: `v260224-1527`
- 복원: `git checkout v260224-1527`

## 2026-02-24 02:54 — 페이지수정창 fullscreen-editor 전환 + 표시이름 설정 이동 + 디자인 토큰 정리
- `MainPage.jsx`: 페이지 편집 UI를 fullscreen-editor 패턴으로 전환
- `ProjectPage.jsx`: 페이지 편집 UI를 fullscreen-editor 패턴으로 전환
- `ProjectPage.css`: 삭제 (스타일을 global.css로 이동)
- `global.css`: ProjectPage 공용 스타일 통합, 하드코딩 색상을 디자인 토큰으로 교체
- Git 태그: `v260224-0254`
- 복원: `git checkout v260224-0254`

## 2026-02-24 00:52 — 즐겨찾기 기능 구현 + 체크리스트 상태변경 버그 수정
- `favoriteService.js`: 즐겨찾기(체크리스트/친구) CRUD 서비스 신규 생성
- `MainPage.jsx/css`: 즐겨찾기 탭 UI, DM 버튼, 해제 확인 메시지
- `ProjectPage.jsx/css`: 아이템 즐겨찾기 토글, 편집 모달 내 즐겨찾기 버튼
- `firestore.rules`: canWriteToProject `in [list]` → `!= 'viewer'` 수정 (초대 멤버 쓰기 권한 버그 수정)
- Git 태그: `v260224-0052`
- 복원: `git checkout v260224-0052`

## 2026-02-23 22:16 — 초기 업로드
- TodoList Share 프로젝트 전체 코드 최초 업로드
- `.gitignore`, `CHANGELOG.md`, Git 워크플로우 설정
- 최근 수정: 멤버 초대 권한 오류 수정, 리워드 남은시간 표시, 메시지 시간 위치, 체크리스트 검색 클릭
- Git 태그: `v260223-2216`
- 복원: `git checkout v260223-2216`
