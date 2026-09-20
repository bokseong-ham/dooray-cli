# Phase 01. `text/html` 본문의 링크 표기를 공식 문서로 확인한다

**Execution profile**: deep

## 목표

`text/html` 본문에서 멤버 멘션, 그룹 멘션, 업무 링크, 첨부 파일 reference 를
각각 어떤 태그로 표현하는지 공식 API 문서에서 확인하고, 그 결과를 ADR-055 에 실측 절로 남긴다.

**범위 외**: 이 phase 는 `src/` 를 고치지 않는다. 구현은 phase 02 와 03 이다.

## 컨텍스트

**근거 문서**: `docs/adr/055-body-mimetype-aware-markup.md` 와
`docs/adr/046-official-api-doc-precedence.md`.

지금 CLI 가 만드는 마크다운 표기는 넷이다.

| 무엇 | 만드는 함수 | 지금 표기 |
| --- | --- | --- |
| 멤버 멘션 | `prependMentions` (`src/utils/mention.ts`) | `[@이름](dooray://<orgId>/members/<memberId> "member")` 형태 |
| 그룹 멘션 | 같은 함수 | 그룹용 `dooray://` 링크 |
| 업무 링크 | `buildTaskLink` (`src/utils/task-link.ts`) | `[<projectCode>/<number> 제목](dooray://<orgId>/tasks/<postId> "<workflowClass>")` |
| 첨부 reference | `appendFileReference` (`src/utils/comment-files.ts`) | `![name](/files/<fileId>)` 또는 `[name](/files/<fileId>)` |

실제 문자열은 그 세 파일을 읽어 확인한다. 위 표는 형태를 알리는 것이고 정확한 값은 코드가 소유한다.

공식 API 문서는 React 앱이라 `WebFetch` 로 본문을 읽을 수 없다.
`~/.claude/scripts/browser-driver` 로 열어야 한다. 명령 목록과 유의할 점은 `browser-driver help` 의 출력이 소유한다.

문서 주소는 `CLAUDE.md` 의 「API 스펙 확인 절차」 절에 있다.

## 의도 메모

- **확인되지 않은 표기를 추측해 넣지 않는다.** 렌더링되지 않는 문자열이 본문에 남고 그 사실이 출력에 드러나지 않는다.
  ADR-055 가 표기를 확인하지 못한 경로를 거절하기로 정한 이유다.
- 표기를 찾지 못한 것과 문서에 없는 것을 구별해 적는다.
  전자는 다시 찾으면 되지만 후자는 설계 판단의 근거가 된다.
- 웹 화면에서 만든 HTML 본문을 조회해 표기를 역으로 읽는 방법도 있다.
  공식 문서에 없을 때의 보조 근거로 쓰고, 그것만으로 구현을 정하지는 않는다.
  ADR-046 이 근거의 순서를 정한다.

## 작업 항목

### 1. 공식 API 문서에서 본문 형식과 멘션 표기를 찾는다

`browser-driver` 로 공식 문서를 열어 아래를 찾는다.

- 업무 본문과 댓글 본문의 `mimeType` 이 받는 값 목록
- `text/html` 본문에서 멤버를 멘션하는 표기
- `text/html` 본문에서 그룹을 멘션하는 표기
- `text/html` 본문에서 다른 업무로 가는 링크 표기
- `text/html` 본문에서 첨부 파일을 가리키는 표기

찾은 것과 찾지 못한 것을 넷 각각에 대해 따로 적는다.

### 2. 웹 화면으로 실측을 보탠다

공식 문서가 표기를 정의하지 않은 항목이 있으면 그 항목만 실측한다.

1. 사용자에게 실측에 쓸 업무를 물어 대상을 받는다. 임의의 업무를 고르지 않는다
2. Dooray 웹 화면에서 그 업무의 댓글에 멘션과 업무 링크와 첨부를 넣는다
3. `dooray post comment list <project> <number> --json` 으로 그 댓글의 `body.mimeType` 과 `body.content` 를 받는다
4. `content` 안의 태그를 그대로 적는다

**웹 화면이 만든 본문이 `text/x-markdown` 이면 이 실측은 성립하지 않는다.**
그 경우 `text/html` 본문을 가진 기존 업무를 사용자에게 받아 그 본문을 읽는다.

CLI 로 본문을 쓰지 않는다. 지금 CLI 가 만드는 표기가 틀렸다는 것이 이 plan 의 전제라, CLI 출력은 근거가 되지 않는다.

### 3. `docs/adr/055-body-mimetype-aware-markup.md` 에 실측 절을 더한다

문서 끝에 아래 형태로 더한다.

```markdown
**실측으로 확인한 것 (Issue #173, 2026-09):**

| 무엇 | `text/html` 표기 | 근거 |
| --- | --- | --- |
| 멤버 멘션 | ... | 공식 문서 / 웹 화면 실측 / 확인 못함 |
| 그룹 멘션 | ... | |
| 업무 링크 | ... | |
| 첨부 reference | ... | |
```

`근거` 열에 셋 중 하나를 적는다. 어느 경로로 확인했는지가 다음 phase 의 판단 근거다.

`확인 못함` 인 항목은 phase 02 와 03 에서 거절 대상이 된다. ADR-055 의 결정이 그렇게 정한다.

### 4. 확인 결과를 사용자에게 보고한다

넷 중 몇이 확인됐고 몇이 거절 대상인지 적는다.
넷 모두 확인하지 못했으면 phase 02 와 03 의 구현 범위가 거절 처리만 남으므로 그 사실을 함께 알린다.

## 검증

ADR 에 실측 절이 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "실측으로 확인한 것" docs/adr/055-body-mimetype-aware-markup.md   # >= 1
```

표의 네 행이 모두 있는지 본다.

```bash
# cwd: <repo root>
grep -c "멤버 멘션\|그룹 멘션\|업무 링크\|첨부 reference" docs/adr/055-body-mimetype-aware-markup.md   # >= 4
```

`src/` 를 고치지 않았는지 본다.

```bash
# cwd: <repo root>
git diff --name-only -- src/
```

출력이 비어 있어야 한다.

한국어 표기를 확인한다.

```bash
# cwd: <repo root>
bash ~/personal/fos-skills/korean-check/scripts/check.sh docs/adr/055-body-mimetype-aware-markup.md
```

종료 코드 0 이어야 한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다. 실측에 쓴 업무 번호와 프로젝트 코드가 ADR 에 들어가지 않았는지를 보는 것이다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/adr/055-body-mimetype-aware-markup.md` | 수정 — 실측 절 추가 |
