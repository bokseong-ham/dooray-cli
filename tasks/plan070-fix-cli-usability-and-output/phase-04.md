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

**README 에는 `download-all` 문자열이 아직 없다.** `post comment delete` 와 `post file delete` 도
「삭제 명령의 확인」 절의 표에만 나오고 설명 문장이 없다.
따라 쓸 선례가 없으므로 어느 절에 무엇을 더할지 여기서 정한다.

| 절 | 위치 | 더할 것 |
| --- | --- | --- |
| `### 첨부 파일 내려받기` | `### 댓글에 파일 첨부` 와 `### 삭제 명령의 확인` 사이에 새로 만든다 | `post file download-all` 사용 예와 두 줄 설명 |
| `### 삭제 명령의 확인` | 그 절의 마지막 문단 뒤 | 삭제 명령의 출력 모드 한 문단 |

새 절 `### 첨부 파일 내려받기` 에 아래를 적는다.

```
dooray post file download-all <project> 42 -o ./files
dooray post file download-all <project> 42 -o ./files --no-inline
```

- 첨부 목록과 본문에 삽입된 파일을 함께 받는다
- 본문 쪽을 제외하려면 `--no-inline` 을 준다

`### 삭제 명령의 확인` 절 끝에 `post comment delete` 와 `post file delete` 가
`--json` 과 `--quiet` 을 다룬다는 것을 한 문단으로 적는다.
`--json` 이 내는 키 이름이 명령마다 다르다는 것도 함께 적는다.

오류 안내는 README 에 적지 않는다. 사용자가 그 동작을 미리 알아야 할 이유가 없고, 오류 자체가 안내한다.

### 3. `skills/dooray-cli/SKILL.md` 를 고친다

이 문서에는 표가 둘 있다. 어느 표를 고치는지 구별해서 적는다.

| 표 | 절 | 무엇을 담는가 |
| --- | --- | --- |
| 스키마 표 | `## 파일 명령의 --json 스키마` | `upload`·`download`·`download-all`·`delete` 의 출력 형태 |
| 명령 표 | `## 업무 첨부`, `## 업무 댓글` | 의도와 커맨드 한 줄 |

네 곳을 고친다. 줄 번호는 이 phase 를 시작할 때의 것이고, 앞 항목을 고치면 밀린다.
문자열로 찾아 고친다.

**첫째, 스키마 표의 머리말(`:49`)을 고친다.**

지금은 「`post file` 과 `wiki page file` 이 같은 스키마를 쓴다. 한쪽 파싱 코드를 다른 쪽에 그대로 쓸 수 있다」다.
`post file upload` 가 `id` 하나만 내는 것이 확인돼 그 주장이 성립하지 않는다.
아래 뜻으로 바꾼다.

```
두 명령군은 출력 처리 방식이 같고, 서버가 돌려주는 필드는 다를 수 있다.
```

**둘째, 스키마 표의 `upload` 행(`:53`)을 고친다.**

「API 응답의 `result` 원형」을 그 명령이 실제로 내는 것으로 바꾼다.

```
post file upload 는 {"id": "<file-id>"} 하나다.
wiki page file upload 는 이름과 크기를 함께 내려준다
```

**셋째, 명령 표의 `post file download-all` 행(`:182`)에 `--no-inline` 을 적는다.**

`--no-inline` 은 **스키마 표에 적지 않는다.** 그 표는 `wiki page file` 과 공용이고,
phase 01 은 `wiki page file download-all` 을 범위 밖으로 둔다.
스키마 표에 적으면 위키 쪽도 그 옵션을 갖는다고 읽힌다.

**넷째, `## 업무 댓글` 명령 표의 `post comment delete` 행(`:169`)에 `--json` 출력 형태를 적는다.**

`{"commentId": "...", "status": "deleted"}` 다.

### 4. `docs/flow.md` 를 확인한다

첨부 파일 다운로드 흐름이 그려져 있으면 본문 참조를 합치는 단계를 더한다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "download-all\|첨부" docs/flow.md
```

### 5. 문서 검사를 돌리고 `index.json` 을 완료로 표시한다

아래 「검증」 절의 명령을 모두 돌려 종료 코드 0 을 확인한다.
확인한 **뒤에** 완료로 표시한다. 순서를 바꾸면 통과하지 않은 plan 이 완료로 남는다.

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
grep -c "result. 원형\|result 원형" skills/dooray-cli/SKILL.md || true   # = 0
```

0 이어야 한다. `grep -c` 는 찾지 못하면 종료 코드 1 로 끝나므로 `|| true` 로 받는다.

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
| `skills/dooray-cli/SKILL.md` | 수정 — 스키마 표 머리말과 `upload` 행, 명령 표 두 행 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan070-fix-cli-usability-and-output/index.json` | 수정 — `completed` 마킹 |
