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

**공개 문서에는 내부 참조 번호를 넣지 않는다.** `README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다.

## 의도 메모

- 2번이 동작 변경 중 가장 크다. 종전에는 성공하던 호출이 이제 실패한다.
  README 와 스킬 문서에 그 조건을 적어야 자동화가 대비할 수 있다.
- `docs/code-architecture.md` 에는 새 유틸리티의 위치와 책임만 적는다. 형식별 표기는 ADR 이 소유한다.

## 작업 항목

### 1. `docs/code-architecture.md` 에 `src/utils/body-markup.ts` 를 더한다

디렉터리 트리의 `src/utils/` 아래에 파일을 넣고, utils 절에 책임을 한 줄 적는다.

```
본문 형식별 링크 문법과 지원 판정. mention 과 task-link 와 comment-files 가 이것을 쓴다 (ADR-055)
```

`src/utils/mention.ts` 와 `task-link.ts` 와 `comment-files.ts` 의 서술이 그 문서에 있으면
형식 인자를 받는다는 것을 각각 한 줄로 더한다.

### 2. `README.md` 에 동작 조건을 적는다

`post comment file delete` 의 설명에 아래를 더한다.

- 본문에서 참조를 찾지 못하면 파일을 지우지 않고 멈춘다

`post edit --mention` 과 `--link-task` 의 설명에 아래를 더한다.

- 본문 형식이 `text/html` 이면 그 형식의 표기로 넣는다.
  넣을 수 없는 형식이면 멈추고 `--mime-type` 으로 형식을 바꾸는 방법을 안내한다

**ADR-055 의 실측 표에서 `확인 못함` 인 항목이 무엇인지 읽고 그것에 맞게 쓴다.**
넷이 모두 확인됐으면 거절에 대한 서술은 빼고 형식별 동작만 적는다.
넷이 모두 확인되지 않았으면 `text/html` 본문에서는 이 옵션들을 쓸 수 없다고 적는다.

### 3. `skills/dooray-cli/SKILL.md` 를 고친다

자동화 시나리오 절에서 멘션과 첨부를 다루는 항목을 찾아 형식 조건을 더한다.
빠른 참조 표에 `post comment file delete` 행이 있으면 실패 조건을 한 줄 더한다.

### 4. `docs/flow.md` 를 확인한다

댓글 첨부의 삭제 흐름이 그려져 있으면 「참조를 찾지 못함」 분기를 더한다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "comment file\|첨부\|reference" docs/flow.md
```

### 5. `index.json` 을 완료로 표시한다

이 plan 의 마지막 phase 다.
`tasks/plan068-fix-body-mimetype-aware-markup/index.json` 의 `status` 를 `completed` 로 바꾸고,
`current_phase` 를 4 로 두고, `phases` 배열의 각 항목에 `"status": "completed"` 를 넣는다.

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
bash ~/personal/fos-skills/korean-check/scripts/check.sh README.md docs/code-architecture.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다.

문서가 실제로 바뀌었는지 본다.

```bash
# cwd: <repo root>
grep -c "body-markup" docs/code-architecture.md   # >= 1
git diff --name-only -- README.md skills/dooray-cli/SKILL.md
```

두 번째 명령의 출력에 두 파일이 모두 있어야 한다.

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

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/code-architecture.md` | 수정 — `body-markup.ts` 추가와 utils 세 파일의 서술 |
| `README.md` | 수정 — 형식 조건과 삭제 중단 조건 |
| `skills/dooray-cli/SKILL.md` | 수정 — 자동화 시나리오와 빠른 참조 표 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan068-fix-body-mimetype-aware-markup/index.json` | 수정 — `completed` 마킹 |
