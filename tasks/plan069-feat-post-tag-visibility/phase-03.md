# Phase 03. 문서를 이 plan 의 변경에 맞춘다

**Execution profile**: fast

## 목표

phase 01 과 02 로 생긴 태그 노출과 필터를 사용자와 다음 구현자가 읽는 문서에 반영한다.

**범위 외**: ADR 은 `docs/adr/056-json-enrichment-behind-option.md` 에 이미 있다. 새 ADR 을 만들지 않는다.
`docs/data-schema.md` 는 손대지 않는다. 태그 캐시의 스키마와 유효 기간이 바뀌지 않았다.

## 컨텍스트

**근거 문서**: `docs/adr/056-json-enrichment-behind-option.md`.

이 plan 이 더한 것은 셋이다.

1. `post get` 의 일반 출력에 태그 줄
2. `post get --with-tag-names` 로 `--json` 의 태그에 이름을 채우는 옵션
3. `post list --tag <이름>` 필터

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」에서
「신규 ADR 동반 변경」 행이 이 변경에 해당한다.

**공개 문서에는 내부 참조 번호를 넣지 않는다.** `README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다.

## 의도 메모

- `CLAUDE.md` 의 출력 규약 줄을 고친다. 지금 그 줄은 `--json` 이 raw 를 유지한다고만 적는다.
  보강을 여는 옵션이 생겼으므로 그 예외를 한 줄로 적어야 규약과 코드가 맞는다.
- 2번은 `--json` 규약의 예외라 자동화를 쓰는 쪽이 가장 알아야 하는 항목이다. 스킬 문서의 시나리오에 넣는다.

## 작업 항목

### 1. `CLAUDE.md` 의 「명령 공통 규약」 을 고친다

「출력」 항목이 지금 이렇다.

```
- **출력**: `--json` 은 raw 유지, `--quiet` 은 식별자만
```

보강 옵션의 예외를 더한다.

```
- **출력**: `--json` 은 raw 유지, `--quiet` 은 식별자만
  - 보강한 값이 필요하면 그것을 명시하는 옵션을 둔다. `post get --with-tag-names` 가 그 형태다.
    옵션을 주지 않은 호출의 출력은 달라지지 않는다
```

### 2. `docs/prd.md` 에 한 줄을 더한다

태그를 붙인 뒤 확인하는 수단과 태그로 찾는 수단이 MVP 범위에 들어온 것을 한 줄로 적는다.
그 문서의 기존 서술 형태를 읽고 같은 형태로 쓴다.

### 3. `README.md` 에 사용 예를 더한다

```bash
# cwd: <repo root>
dooray post get <project> <number> --json --with-tag-names
dooray post list <project> --tag "<태그 이름>"
```

`--with-tag-names` 의 설명에 아래를 함께 적는다.

- 이름을 채우지 못한 태그가 있으면 멈춘다
- 옵션을 주지 않으면 출력이 서버 응답 그대로다

`--tag` 의 설명에는 phase 02 의 작업 항목 1에서 확인한 동작을 적는다.
여러 번 주었을 때 모두 가진 업무인지 하나라도 가진 업무인지가 그것이다.

### 4. `skills/dooray-cli/SKILL.md` 를 고친다

빠른 참조 표의 `post get` 행에 `--with-tag-names` 를, `post list` 행에 `--tag` 를 더한다.

자동화 시나리오 절에 「태그를 붙이고 확인한다」 흐름을 한 항목으로 더한다.

```
dooray post edit <project> <number> --tag "<이름>"
dooray post get <project> <number> --json --with-tag-names
```

이것이 이슈가 보고한 우회를 없애는 경로다.

### 5. `docs/flow.md` 를 확인한다

업무 조회 흐름이 그려져 있으면 태그 이름 조회 분기를 더한다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "post get\|업무 조회" docs/flow.md
```

### 6. `index.json` 을 완료로 표시한다

이 plan 의 마지막 phase 다.
`tasks/plan069-feat-post-tag-visibility/index.json` 의 `status` 를 `completed` 로 바꾸고,
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
bash ~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md README.md docs/prd.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다.

문서가 실제로 바뀌었는지 본다.

```bash
# cwd: <repo root>
grep -c "with-tag-names" CLAUDE.md README.md skills/dooray-cli/SKILL.md   # >= 1
git diff --name-only -- docs/prd.md
```

두 번째 명령의 출력에 `docs/prd.md` 가 있어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
node scripts/check-plan.mjs plan069-feat-post-tag-visibility
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
| `CLAUDE.md` | 수정 — 출력 규약에 보강 옵션 예외 |
| `docs/prd.md` | 수정 — MVP 범위 한 줄 |
| `README.md` | 수정 — 사용 예 둘과 설명 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표와 자동화 시나리오 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan069-feat-post-tag-visibility/index.json` | 수정 — `completed` 마킹 |
