# Phase 04. 문서를 이 plan 의 변경에 맞춘다

**Execution profile**: fast

## 목표

phase 01 부터 03 까지의 변경을 문서에 반영하고,
`post file upload --json` 이 `id` 하나만 낸다는 사실을 스킬 문서에 반영한다.

**범위 외**: ADR 은 `docs/adr/057-download-all-includes-inline-files.md` 와
`docs/adr/058-unknown-option-usage-hint.md` 에 이미 있고,
`docs/adr/031-file-json-output-schema.md` 의 정정도 이미 들어갔다. 새 ADR 을 만들지 않는다.
`docs/data-schema.md` 는 손대지 않는다. 저장 모델이 바뀌지 않았다.

## 컨텍스트

**근거 문서**: `docs/adr/057-download-all-includes-inline-files.md`,
`docs/adr/058-unknown-option-usage-hint.md`,
`docs/adr/031-file-json-output-schema.md` 의 「정정」 절.

이 plan 이 바꾼 것은 넷이다.

1. `post file download-all` 이 본문의 `/files/<id>` 참조도 받는다. `--no-inline` 으로 제외한다
2. 알 수 없는 옵션 오류에 인자 사용법이 붙는다
3. `post comment delete` 가 `--json` 과 `--quiet` 을 다룬다
4. `feedback` 의 환경 블록 버전이 `--version` 과 같아진다

여기에 코드 변경 없이 문서만 고치는 것이 하나 더 있다.

5. `post file upload --json` 은 `{"id": "..."}` 하나만 낸다.
   `skills/dooray-cli/SKILL.md` 의 표가 「API 응답의 `result` 원형」이라고만 적어
   `wiki page file upload` 와 같은 필드가 온다고 읽힌다

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」에서
「신규 ADR 동반 변경」 행이 이 변경에 해당한다.

**공개 문서에는 내부 참조 번호를 넣지 않는다.** `README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다.

## 의도 메모

- 1번이 기본 동작을 바꾼다. 받는 파일 수를 세거나 디렉터리를 비교하던 자동화가 영향을 받으므로
  README 와 스킬 문서 양쪽에 적는다.
- 5번은 자동화가 `name` 이나 `size` 를 읽으려다 실패하는 것을 막는 항목이다.
  표의 서술 한 줄이 그 실패를 없앤다.

## 작업 항목

### 1. `docs/code-architecture.md` 에 새 유틸리티 둘을 더한다

디렉터리 트리의 `src/utils/` 아래에 두 파일을 넣고 각각 책임을 한 줄 적는다.

```
inline-file-refs.ts  본문에서 /files/<id> 참조를 뽑는다 (ADR-057)
unknown-option-hint.ts  알 수 없는 옵션 오류에 인자 사용법을 붙이고, 명령 나무 전체에 그 후크를 건다 (ADR-058)
```

`src/index.ts` 의 서술이 그 문서에 있으면 후크를 거는 한 줄을 더한다.

### 2. `README.md` 를 고친다

`post file download-all` 의 설명에 아래를 더한다.

- 첨부 목록과 본문에 삽입된 파일을 함께 받는다
- 본문 쪽을 제외하려면 `--no-inline`

`post comment delete` 의 설명에 `--json` 과 `--quiet` 을 쓸 수 있다는 것을 더한다.
`post file delete` 의 설명과 같은 형태로 쓴다.

오류 안내에 대한 항목이 README 에 있으면 인자 사용법이 붙는다는 것을 한 줄 더한다.
없으면 만들지 않는다. 사용자가 그 동작을 미리 알아야 할 이유가 없고, 오류 자체가 안내한다.

### 3. `skills/dooray-cli/SKILL.md` 를 고친다

세 곳을 고친다.

- 빠른 참조 표의 `post file download-all` 행에 `--no-inline` 과 본문 파일을 함께 받는다는 것을 적는다
- 빠른 참조 표의 `post comment delete` 행에 `--json` 출력 형태를 적는다
- `post file upload --json` 의 출력 서술을 고친다.
  「API 응답의 `result` 원형」이라는 표현을 그 명령이 실제로 내는 것으로 바꾼다

```
{"id": "<file-id>"} — post file upload 는 id 하나만 온다.
wiki page file upload 는 이름과 크기를 함께 내려준다
```

표의 다른 행을 함께 확인한다. 같은 표현이 다른 곳에도 있으면 그것도 사실과 맞는지 본다.

### 4. `docs/flow.md` 를 확인한다

첨부 파일 다운로드 흐름이 그려져 있으면 본문 참조를 합치는 단계를 더한다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "download-all\|첨부" docs/flow.md
```

### 5. `index.json` 을 완료로 표시한다

이 plan 의 마지막 phase 다.
`tasks/plan070-fix-cli-usability-and-output/index.json` 의 `status` 를 `completed` 로 바꾸고,
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
grep -c "no-inline" README.md skills/dooray-cli/SKILL.md          # >= 1
grep -c "inline-file-refs" docs/code-architecture.md              # >= 1
grep -c "unknown-option-hint" docs/code-architecture.md           # >= 1
```

`result 원형` 이라는 표현이 남아 있지 않은지 본다.

```bash
# cwd: <repo root>
grep -c "result. 원형\|result 원형" skills/dooray-cli/SKILL.md    # = 0
```

0 이어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan070-fix-cli-usability-and-output
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
| `docs/code-architecture.md` | 수정 — 새 유틸리티 둘과 `src/index.ts` 서술 |
| `README.md` | 수정 — `download-all` 과 `post comment delete` 설명 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표 세 곳 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan070-fix-cli-usability-and-output/index.json` | 수정 — `completed` 마킹 |
