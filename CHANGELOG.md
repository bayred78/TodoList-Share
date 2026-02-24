# 변경 이력 (Change Log)

> `/git` 워크플로우로 자동 생성됩니다. 최신 항목이 맨 위에 추가됩니다.

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
