# Phase 03. 문서를 이 plan 의 변경에 맞춘다

**Execution profile**: fast

## 목표

phase 01 과 02 로 달라진 동작을 사용자와 다음 구현자가 읽는 문서에 반영한다.

**범위 외**: ADR 은 이미 `docs/adr/054-private-project-resolution.md` 에 있다. 새 ADR 을 만들지 않는다.
`docs/data-schema.md` 는 손대지 않는다. 캐시 스키마와 유효 기간이 바뀌지 않았다.
`docs/prd.md` 도 손대지 않는다. 새 기능이 아니라 기존 기능의 결함 수정이다.

## 컨텍스트

**근거 문서**: `docs/adr/054-private-project-resolution.md`.

이 plan 이 바꾼 동작은 셋이다.

1. 개인 프로젝트 코드가 캐시 상태와 무관하게 해석된다. 사람이 `project list --type private` 를 미리 부르지 않아도 된다
2. `wiki tree`, `wiki pages`, `wiki page edit` 이 개인 위키를 다룬다
3. `wiki page edit` 이 `--id`, `--url`, Dooray URL positional 을 받는다

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」에서
「기존 resolver 입력 형식 확대」 행이 이 변경에 해당한다.

**공개 문서에는 내부 참조 번호를 넣지 않는다.** `README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다.
`ADR-054` 나 `Issue #173` 을 그 둘에 적지 않는다. `scripts/check-public-refs.mjs` 가 이것을 판정한다.

## 의도 메모

- `CLAUDE.md` 의 입력 형식 줄에 `wiki page edit` 을 더한다. 그 줄이 어느 명령이 공통 입력 형식을 받는지 정하는 곳이다.
- `docs/code-architecture.md` 에는 resolver 의 책임 한 줄만 고친다. 구현 방법은 ADR 이 소유한다.

## 작업 항목

### 1. `CLAUDE.md` 의 「명령 공통 규약」 을 고친다

「입력 형식」 항목의 첫 줄이 지금 이렇다.

```
- **입력 형식** — post 계열, wiki page get, wiki page file, wiki page comment 명령이 공통으로 받는다
```

`wiki page edit` 을 그 목록에 더한다. `wiki page delete` 도 같은 형태를 받는데 목록에 없으면 함께 더한다.
실제 코드에서 `resolveWikiPageInput` 을 쓰는 파일을 찾아 그 목록과 맞춘다.

```bash
# cwd: <repo root>
grep -rln "resolveWikiPageInput" src/commands/
```

그 출력이 목록의 근거다.

### 2. `docs/code-architecture.md` 의 resolver 절을 고친다

`resolveProject` 와 `resolveWiki` 의 책임 서술을 찾아 아래를 반영한다.

- `resolveProject` 는 공용 목록에서 실패하면 private 목록을 받아 다시 찾는다
- `resolveWiki` 는 공용과 private 두 캐시를 모두 본다

각각 한 줄이면 된다. 근거는 `ADR-054` 로 가리킨다.
해당 서술이 그 문서에 없으면 resolver 절에 두 줄을 더한다.

### 3. `README.md` 에 사용 예를 더한다

`wiki page edit` 의 사용 예에 페이지 ID 로 수정하는 형태를 더한다.

```bash
# cwd: <repo root>
dooray wiki page edit --id <pageId> --body-file notes.md
```

개인 프로젝트를 쓰는 사람을 위한 안내는 넣지 않는다.
이제 CLI 가 스스로 목록을 받으므로 사람이 할 일이 없다.

README 에 `project list --type private` 를 미리 부르라고 적은 곳이 있으면 지운다.

```bash
# cwd: <repo root>
grep -rn "type private" README.md skills/dooray-cli/SKILL.md
```

출력이 있으면 그 문장이 아직 필요한지 읽고 판단한다.
`project list --type private` 를 **목록을 보려고** 부르는 안내는 그대로 두고,
**캐시를 채우려고** 미리 부르라는 안내만 지운다.

### 4. `skills/dooray-cli/SKILL.md` 의 빠른 참조 표를 고친다

`wiki page edit` 행의 입력 형식 열에 `--id` 와 `--url` 을 더한다.
`wiki page get` 행이 이미 그 형식을 적고 있으므로 같은 표기를 쓴다.

### 5. `docs/flow.md` 를 확인한다

프로젝트 코드를 해석하는 흐름이 그려져 있으면 private 목록 조회 분기를 더한다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "resolveProject\|프로젝트 코드" docs/flow.md
```

### 6. `index.json` 을 완료로 표시한다

이 plan 의 마지막 phase 다.
`tasks/plan067-fix-private-project-resolution/index.json` 의 `status` 를 `completed` 로 바꾸고,
`current_phase` 를 3 으로 두고, `phases` 배열의 각 항목에 `"status": "completed"` 를 넣는다.

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
bash ~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md README.md docs/code-architecture.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다.

문서가 실제로 바뀌었는지 본다.

```bash
# cwd: <repo root>
grep -c "wiki page edit" CLAUDE.md          # >= 1
git diff --name-only -- README.md docs/code-architecture.md skills/dooray-cli/SKILL.md
```

두 번째 명령의 출력에 세 파일이 모두 있어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan067-fix-private-project-resolution
```

종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
```

둘 다 종료 코드 0 이어야 한다. 문서만 고쳤으므로 phase 01 과 02 의 결과가 그대로 유지되는지 보는 것이다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 수정 — 입력 형식 목록에 `wiki page edit` 추가 |
| `docs/code-architecture.md` | 수정 — resolver 두 곳의 책임 서술 |
| `README.md` | 수정 — `wiki page edit --id` 사용 예, 캐시 선행 실행 안내 제거 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표의 입력 형식 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan067-fix-private-project-resolution/index.json` | 수정 — `completed` 마킹 |
