# 변경 이력 (Change Log)

> `/git` 워크플로우로 자동 생성됩니다. 최신 항목이 맨 위에 추가됩니다.

---

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
