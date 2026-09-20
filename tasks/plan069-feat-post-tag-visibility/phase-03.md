# Phase 03. 문서를 이 plan 의 변경에 맞춘다

**Execution profile**: fast

## 목표

phase 01 과 02 로 생긴 태그 노출과 필터를 사용자와 다음 구현자가 읽는 문서에 반영한다.

**범위 외**: 새 ADR 을 만들지 않는다. 결정은 `docs/adr/056-json-enrichment-behind-option.md` 에 이미 있다.
그 ADR 의 본문을 보강하는 것은 범위 안이다.
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

### 3. `docs/code-architecture.md` 를 고친다

`.claude/planning-overlay.md` 의 「신규 ADR 동반 변경」 행이 이 문서를 대상으로 지목한다.
이 plan 이 `resolvers/tag.ts` 에 새 책임을 더하고 두 명령에 옵션을 더했으므로 그 줄들이 실제와 어긋난다.

- `resolvers/` 의 `tag.ts` 줄에 태그 이름 보강(`attachTagNames`)을 더한다
- `commands/post/` 의 `get.ts` 줄에 `--with-tag-names` 를 적는다
- `commands/post/` 의 `list.ts` 줄에 `--tag` 필터를 적는다

`get.ts` 와 `list.ts` 는 지금 설명 주석이 없는 줄이다. 같은 파일의 다른 줄과 같은 형태로 적는다.

### 4. `README.md` 에 사용 예를 더한다

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
phase 02 가 그것을 확정하지 못했으면 단정하지 않는다.
그 phase 가 정한 대체 문장(「여러 번 주면 그 태그들을 함께 보낸다」)을 그대로 쓴다.

### 5. `skills/dooray-cli/SKILL.md` 를 고친다

빠른 참조 표의 `post get` 행에 `--with-tag-names` 를, `post list` 행에 `--tag` 를 더한다.

자동화 시나리오 절에 「태그를 붙이고 확인한다」 흐름을 한 항목으로 더한다.

```
dooray post edit <project> <number> --tag "<이름>"
dooray post get <project> <number> --json --with-tag-names
```

이것이 이슈가 보고한 우회를 없애는 경로다.

### 6. `docs/flow.md` 의 명령 예시 목록에 두 줄을 더한다

이 문서에 업무 조회 흐름도는 없다.
`post get` 이 나오는 자리는 139행부터의 명령 예시 목록이다.

```bash
# cwd: <repo root>
grep -n "post get\|post list" docs/flow.md
```

그 목록의 `post get` 줄들 다음과 `post list` 줄 다음에 각각 한 줄을 더한다.
번호 주석의 형태는 그 목록의 기존 줄을 따른다.

```
dooray post get my-project 42 --json --with-tag-names   # 태그 이름까지 채워서
dooray post list my-project --tag "<태그 이름>"          # 태그로 거르기
```

### 7. `docs/adr/056-json-enrichment-behind-option.md` 의 본문을 보강한다

두 가지가 지금 그 ADR 에 없다.

- **맥락 절**: 이슈의 보고가 「`--json` 이 최상위 키 둘만 돌려준다」였고,
  코드를 읽어 보니 그렇지 않았다는 사실을 한 문단으로 적는다.
  실제 문제는 `tags[]` 가 `id` 만 담는 것이었다.
  이것을 적지 않으면 같은 보고가 다시 왔을 때 같은 조사를 반복한다
- **대안 기각 절**: `post list` 의 표에 태그 열을 더하는 안을 기각 항목으로 더한다.
  기각 근거는 phase 02 의 「의도 메모」가 적은 것과 같다.
  표가 이미 다섯 열이고 태그는 업무마다 개수가 달라 열 폭이 불규칙하다.
  목록에서 태그로 찾는 요구는 `--tag` 필터가 직접 담는다

ADR 은 공개 문서가 아니므로 내부 참조 번호를 그대로 쓴다.

### 8. 문서 검사기를 통과시킨다

```bash
# cwd: <repo root>
bash ~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md README.md docs/prd.md skills/dooray-cli/SKILL.md docs/flow.md docs/code-architecture.md
```

지금 이 검사는 아래 하나로 종료 코드 1 이다.

```
docs/prd.md:1  [DASH] 제목의 엠대시: 부제를 떼고 한 문장으로 쓴다
```

이 위반은 이 plan 이 만든 것이 아니다.
다만 이 plan 이 같은 파일을 고치므로 여기서 함께 고친다.
`# PRD — dooray-cli` 를 엠대시 없는 한 문장 제목으로 바꾼다.
그 제목을 가리키는 다른 문서가 있는지 먼저 본다.

```bash
# cwd: <repo root>
grep -rn "PRD — dooray-cli" docs/ README.md CLAUDE.md .claude/
```

범위 밖 파일을 고치려 하거나 검사를 건너뛰지 않는다.
검사가 다른 위반을 새로 내면 그것은 이 plan 이 만든 것이므로 그 자리에서 고친다.

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
bash ~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md README.md docs/prd.md skills/dooray-cli/SKILL.md docs/flow.md docs/code-architecture.md
```

종료 코드 0 이어야 한다.

문서가 실제로 바뀌었는지 본다.
`grep -c` 에 파일을 여럿 주면 하나만 맞아도 종료 코드가 0 이므로 파일마다 따로 돌린다.

```bash
# cwd: <repo root>
grep -c "with-tag-names" CLAUDE.md
grep -c "with-tag-names" README.md
grep -c "with-tag-names" skills/dooray-cli/SKILL.md
grep -c "with-tag-names" docs/code-architecture.md
```

넷 다 1 이상이어야 한다.

```bash
# cwd: <repo root>
git diff --name-only -- docs/prd.md docs/flow.md docs/adr/056-json-enrichment-behind-option.md
```

세 경로가 모두 출력에 있어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan069-feat-post-tag-visibility
```

종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
```

둘 다 종료 코드 0 이어야 한다.

위 검증이 모두 통과하면 `tasks/plan069-feat-post-tag-visibility/index.json` 을 완료로 표시한다.
`status` 를 `completed` 로 바꾸고, `current_phase` 를 3 으로 두고,
`phases` 배열의 각 항목에 `"status": "completed"` 를 넣는다.
이 표시는 작업 항목이 아니라 plan 을 닫는 기록이므로 검증 뒤에 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 수정 — 출력 규약에 보강 옵션 예외 |
| `docs/prd.md` | 수정 — MVP 범위 한 줄과 1행 제목의 엠대시 제거 |
| `docs/code-architecture.md` | 수정 — `tag.ts` 책임과 `post get`·`post list` 옵션 |
| `README.md` | 수정 — 사용 예 둘과 설명 |
| `skills/dooray-cli/SKILL.md` | 수정 — 빠른 참조 표와 자동화 시나리오 |
| `docs/flow.md` | 수정 — 명령 예시 목록에 두 줄 |
| `docs/adr/056-json-enrichment-behind-option.md` | 수정 — 맥락 보강과 대안 기각 한 항목 |
| `tasks/plan069-feat-post-tag-visibility/index.json` | 수정 — `completed` 마킹 |
