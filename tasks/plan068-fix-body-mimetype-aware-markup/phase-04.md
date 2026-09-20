# Phase 04. 문서를 이 plan 의 변경에 맞춘다

**Execution profile**: fast

## 목표

phase 02 와 03 으로 달라진 동작을 사용자와 다음 구현자가 읽는 문서에 반영한다.

**범위 외**: ADR 은 `docs/adr/055-body-mimetype-aware-markup.md` 에 이미 있고
phase 01 이 실측 절을 더했다. 새 ADR 을 만들지 않는다.
`docs/data-schema.md` 는 손대지 않는다. 저장 모델이 바뀌지 않았다.

## 컨텍스트

**근거 문서**: `docs/adr/055-body-mimetype-aware-markup.md`.

이 plan 이 바꾼 동작은 셋이다.

1. `text/html` 본문에서 멘션과 업무 링크와 첨부 reference 가 그 형식의 문법으로 들어간다.
   표기를 확인하지 못한 항목은 종료 코드 3 으로 거절한다
2. `post comment file delete` 가 본문에서 참조를 찾지 못하면 파일을 지우지 않고 멈춘다
3. `post comment file upload` 가 넣을 수 없는 형식이면 파일을 올리기 전에 멈춘다

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」에서
「신규 ADR 동반 변경」 행이 이 변경에 해당한다.

**공개 문서에는 내부 참조 번호를 넣지 않는다.**
`README.md` 와 `skills/` 아래 전부가 그 대상이다.
`scripts/check-public-refs.mjs` 의 `TARGETS` 가 범위를 소유한다.

## 의도 메모

- 2번이 동작 변경 중 가장 크다. 종전에는 성공하던 호출이 이제 실패한다.
  README 와 스킬 문서에 그 조건을 적어야 자동화가 대비할 수 있다.
- `docs/code-architecture.md` 에는 새 유틸리티의 위치와 책임만 적는다. 형식별 표기는 ADR 이 소유한다.
- 마크다운 링크 표기를 실제로 소유한 문서는 `skills/dooray-cli/references/mention-link.md` 다.
  README 가 아니라 그 파일이 「Dooray 마크다운 링크 형식」 절을 갖고 있다.
  표기를 형식별로 나누는 이 변경은 그 파일을 반드시 고쳐야 한다.

## 작업 항목

### 1. `docs/code-architecture.md` 에 `src/utils/body-markup.ts` 를 더한다

디렉터리 트리의 `src/utils/` 아래에 파일을 넣고, 그 줄에 책임을 한 줄 적는다.
`mention.ts` 바로 앞이 자리다. 그 셋이 이것을 쓴다.

```
body-markup.ts          # 본문 형식별 링크 문법과 지원 판정 (ADR-055)
```

이미 있는 `mention.ts` 와 `task-link.ts` 와 `comment-files.ts` 줄에
형식 인자를 받는다는 것을 각각 한 조각 더한다.

### 2. `README.md` 에 절 둘을 만들거나 고친다

**`--mention` 과 `--link-task` 를 설명하는 절이 README 에 없다.** 새로 만든다.

| 무엇 | 어디 | 제목 |
| --- | --- | --- |
| 멘션과 업무 링크 | `### 본문 형식` 절 바로 뒤 | `### 멘션과 업무 링크` |
| 댓글 첨부 삭제 조건 | 이미 있는 `### 댓글에 파일 첨부` 절 | 그 절 안에 문단을 더한다 |

새 절에 적을 것이다.

- `post edit` 과 `post comment edit` 이 `--mention`, `--mention-group`, `--link-task` 를 받는다
- 본문 형식이 `text/html` 이면 그 형식의 표기로 넣는다.
  넣을 수 없는 형식이면 멈추고 `--mime-type` 으로 형식을 바꾸는 방법을 안내한다
- `--dry-run` 으로 합성 결과를 먼저 본다

`### 댓글에 파일 첨부` 절에 더할 것이다.

- `comment file delete` 는 본문에서 참조를 찾지 못하면 파일을 지우지 않고 멈춘다
- `comment file upload` 는 넣을 수 없는 형식이면 파일을 올리기 전에 멈춘다

**ADR-055 의 실측 표에서 `확인 못함` 인 항목이 무엇인지 읽고 그것에 맞게 쓴다.**
넷이 모두 확인됐으면 거절에 대한 서술은 빼고 형식별 동작만 적는다.
넷이 모두 확인되지 않았으면 `text/html` 본문에서는 이 옵션들을 쓸 수 없다고 적는다.

### 3. `skills/dooray-cli/` 의 문서 셋을 고친다

| 파일 | 무엇 |
| --- | --- |
| `references/mention-link.md` | 「Dooray 마크다운 링크 형식」 절이 마크다운 본문에만 해당한다는 것을 적는다. `text/html` 본문의 동작을 그 절에 더한다 |
| `references/comment.md` | 댓글 첨부를 다루는 자리에 삭제 중단 조건과 업로드 거절 조건을 더한다 |
| `SKILL.md` | 자동화 시나리오 절에서 멘션과 첨부를 다루는 항목에 형식 조건을 더한다. 빠른 참조 표의 `post comment file delete` 행에 실패 조건을 한 줄 더한다 |

`SKILL.md` 의 빠른 참조 표는 `댓글 첨부 삭제` 행이 이미 있다. 그 행의 설명에 붙인다.

### 4. `docs/flow.md` 의 댓글 첨부 흐름을 고친다

「댓글 첨부파일 흐름」 절이 이미 있고, `delete` 가 두 참조 형식을 모두 제거한 뒤
파일을 삭제한다고 적혀 있다. 그 서술이 이제 틀렸다.

```bash
# cwd: <repo root>
grep -n "comment file\|첨부\|reference" docs/flow.md
```

그 절에 더할 것이다.

- 본문 형식에 맞는 표기를 찾고, 찾지 못하면 파일을 지우지 않고 종료 코드 3 으로 멈춘다
- `upload` 는 형식을 먼저 판정하고 거절이면 파일을 올리지 않는다

### 5. 문서가 코드와 어긋나지 않는지 검사한다

넷을 하나씩 본다.

- README 와 `skills/` 에 적은 종료 코드가 phase 02 와 03 이 실제로 던지는 값과 같다
- README 와 `skills/` 에 `ADR-NNN` 과 `Issue #NN` 이 들어가지 않았다
- `docs/flow.md` 의 서술이 `src/commands/post/comment/file/` 의 실제 순서와 같다
- ADR-055 의 실측 표에서 `확인 못함` 인 항목과 문서가 적은 거절 대상이 일치한다

어긋나면 문서를 고친다. 코드를 고쳐야 할 일이 나오면 그것은 phase 02 나 03 의 누락이므로
그 phase 로 돌아가 고치고 다시 이 phase 를 돈다.

## 검증

공개 문서에 내부 참조 번호가 들어가지 않았는지 본다.

```bash
# cwd: <repo root>
node scripts/check-public-refs.mjs
```

종료 코드 0 이어야 한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

한국어 표기를 확인한다.

```bash
# cwd: <repo root>
bash ~/personal/fos-skills/korean-check/scripts/check.sh README.md docs/code-architecture.md docs/flow.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/mention-link.md skills/dooray-cli/references/comment.md
```

종료 코드 0 이어야 한다.

문서가 실제로 바뀌었는지 본다.

```bash
# cwd: <repo root>
grep -c "body-markup" docs/code-architecture.md   # >= 1
git diff --name-only -- README.md docs/flow.md skills/dooray-cli/
```

두 번째 명령의 출력에 `README.md` 와 `docs/flow.md` 와
`skills/dooray-cli/SKILL.md` 와 `skills/dooray-cli/references/mention-link.md` 가 모두 있어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan068-fix-body-mimetype-aware-markup
```

종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
```

둘 다 종료 코드 0 이어야 한다.

위 명령이 모두 통과하면 이 plan 의 마지막 phase 이므로
`tasks/plan068-fix-body-mimetype-aware-markup/index.json` 의 `status` 를 `completed` 로 바꾸고,
`current_phase` 를 4 로 두고, `phases` 배열의 각 항목에 `"status": "completed"` 를 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/code-architecture.md` | 수정 — `body-markup.ts` 추가와 utils 세 파일의 서술 |
| `README.md` | 수정 — 멘션과 업무 링크 절 신규, 댓글 첨부 절에 중단 조건 |
| `docs/flow.md` | 수정 — 댓글 첨부 흐름에 중단 분기 |
| `skills/dooray-cli/SKILL.md` | 수정 — 자동화 시나리오와 빠른 참조 표 |
| `skills/dooray-cli/references/mention-link.md` | 수정 — 형식별 링크 표기 |
| `skills/dooray-cli/references/comment.md` | 수정 — 첨부 삭제와 업로드 조건 |
| `tasks/plan068-fix-body-mimetype-aware-markup/index.json` | 수정 — `completed` 마킹 |
