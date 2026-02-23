# 변경 이력 (Change Log)

> `/git` 워크플로우로 자동 생성됩니다. 최신 항목이 맨 위에 추가됩니다.

---

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
