# farm-pro (GitHub Pages 배포 저장소)

농장 투약관리 시스템(정적 웹앱 + Supabase 백엔드)의 GitHub Pages 배포 저장소.

## 커밋/푸시 워크플로우 (자동, 확인 불필요)

기능 추가·수정 작업을 완료하고 검증(문법 체크, 가능하면 브라우저 확인)까지 마쳤다면,
"커밋할까요?"라고 묻지 말고 바로 `git add` → `git commit` → `git push origin main`까지
자동으로 진행한다.

- 이 저장소는 `.github` 빌드 단계가 없는 순수 정적 사이트라 push가 곧 배포다. 별도 "사이트 반영" 단계 없음.
- 적용 범위: 새 기능/메뉴 추가, 버그 수정, 스타일 조정 등 "구현 후 검증 완료"된 작업.
- 커밋 전 `git status`/`git diff`로 변경사항 확인하는 절차는 생략하지 않는다.
- 세션 도중 사용자가 직접 만든 임시 파일(예: 백업용 xlsx)이나 무관한 변경은 함께 커밋하지 말고 분리한다.

## 항목을 추가·변경할 때 — 연결된 화면을 먼저 전부 찾고 한 번에 처리한다

이 앱은 **같은 데이터를 여러 화면이 각자 따로 그린다.** 그래서 필드 하나를 추가하면
입력 화면만 고치고 끝내기 쉬운데, 그러면 상세·인쇄·대시보드에서는 그 값이 빠진 채로
배포된다. 사용자가 화면을 하나씩 발견해서 알려주는 식으로 여러 번 왕복하지 말고,
**착수 전에 아래를 훑어 영향받는 지점을 모두 목록화한 뒤 한 커밋에 처리한다.**

필드/항목 하나를 건드릴 때 확인할 곳:

1. **입력** — 등록/편집 모달 (`openXxxModal`, `saveXxx`)
2. **목록** — `renderXxx()` 표에 열이 필요한가
3. **상세 보기** — `viewXxx()` / `renderXxxDetail()` (편집 모달과 별개 코드다)
4. **인쇄** — `js/print.js`, 그리고 각 기능 파일의 `printXxx()` (열 추가 시 `colgroup`·헤더·본문·빈 상태 `colspan`을 함께 맞출 것)
5. **대시보드** — `js/dashboard.js`의 카드가 그 값을 쓰는가
6. **저장 계층** — `supabase/schema.sql` 컬럼 + `js/supabaseClient.js`의 `toRow`/`fromRow` **양쪽**
7. **백업/복원** — `js/backup.js`의 복원 대상 목록(하드코딩된 배열이라 자동으로 안 늘어난다)
8. **캐시 토큰** — js/css를 고쳤으면 `index.html`·`login.html`의 `?v=` 토큰을 같은 커밋에서 올린다

특히 놓치기 쉬운 두 가지:

- **기존 데이터에 그 값이 비어 있는 경우.** 새 컬럼을 추가하면 이전에 만든 레코드는 전부
  `null`이다. 화면이 그 값을 그대로 읽으면 "기존 데이터에서는 기능이 안 보이는" 상태가 된다.
  값이 없을 때 무엇으로 대체할지(다른 테이블에서 유도 / 안내 문구)를 반드시 정한다.
  "사용자가 하나씩 다시 저장하면 된다"는 해결이 아니다.
- **조건부로 비는 화면.** 조건이 안 맞아 카드를 통째로 숨기면 사용자에게는 "기능이 없다"로
  보인다. 왜 안 보이는지와 어디서 채우면 되는지를 화면에 남긴다.

스키마 컬럼을 추가했으면, 사용자가 `supabase/schema.sql`을 다시 실행해야 한다는 점을
결과 보고에 명확히 적는다(안 하면 저장 자체가 실패한다).

## 예외 — 반드시 먼저 확인받고 진행 (치명적/위험한 변경)

아래에 해당하면 검증이 끝났어도 자동 푸시하지 말고, 무엇을 왜 바꾸는지 설명한 뒤 사용자 확인을 받는다:

- **데이터 삭제/파괴적 작업**: 실 데이터 삭제·초기화, `supabase/schema.sql`의 `drop table`/`drop column`/기존 컬럼 타입 변경 등 되돌리기 어려운 스키마 변경, RLS 정책 축소(권한이 넓어지는 쪽은 특히 주의).
- **인증/보안 관련 변경**: 로그인 로직(`js/auth.js`), Supabase URL/키 교체, 접근 제어 로직 수정.
- **git 이력을 되돌리는 작업**: `git reset --hard`, `git push --force`, 커밋 amend, 브랜치 삭제.
- **미완성/실험적 변경**: 브라우저로 검증하지 못했거나 일부만 동작 확인된 상태.
- **스코프가 애매한 변경**: 사용자가 명시적으로 요청하지 않은 범위까지 건드리게 된 경우.

위 항목은 daehan 프로젝트와 달리 이 저장소에서는 "확인 없이 자동 진행" 대상이 아니다. 애매하면 안전한 쪽(확인 요청)으로 기운다.

## graphify (토큰 절약용 코드 지식 그래프)

`graphify-out/graph.json`은 공개 도구 graphify(github.com/safishamsi/graphify)로 만든 코드 구조 그래프다.
파일을 통째로 읽기 전에 그래프로 관련 함수·파일 위치를 먼저 찾아 토큰을 줄이는 용도.
graphify가 설치돼 있지 않으면(`command -v graphify`로 확인) 먼저 `pip install graphifyy`로 설치한다(설치가 안 되면
아래 규칙은 건너뛰고 평소처럼 작업). 질문은 한국어 문장보다 함수·파일 이름(예: `kakaoSendPrintPages`)으로 해야 잘 찾는다.
코드를 바꾼 커밋에는 `graphify update .`로 갱신한 graph.json을 함께 넣는다(로컬 분석, API 비용 없음).

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
