# Phase 02. 알 수 없는 옵션 오류에 사용법을 붙인다

**Execution profile**: standard

## 목표

`error: unknown option '--project'` 한 줄 뒤에,
그 이름이 그 명령의 positional 인자를 가리키면 인자로 준다는 안내와 사용법을 덧붙인다.

**범위 외**: 인라인 파일 다운로드는 phase 01 이다. 출력 불일치 둘은 phase 03 이다. 문서는 phase 04 다.
옵션 이름의 오타 제안은 만들지 않는다. commander 가 이미 한다.

## 컨텍스트

**근거 문서**: `docs/adr/058-unknown-option-usage-hint.md` 와
`docs/adr/044-post-input-error-completed-command.md`.

ADR-044 는 입력을 해석한 **뒤**의 오류를 다룬다.
옵션 이름이 틀린 호출은 commander 가 해석 전에 끝내므로 그 경로에 닿지 않는다.

**실측으로 확인한 것 두 가지**가 ADR-058 에 적혀 있다. 그것이 이 phase 의 전제다.

1. commander 15 는 비슷한 옵션 이름이 있으면 `(Did you mean --url?)` 를 이미 붙인다.
   `--project` 처럼 비슷한 옵션이 없는 경우에만 안내가 비어 있다
2. `configureOutput` 은 하위 명령으로 전파되지 않는다.
   최상위에 걸고 `addCommand` 로 붙인 하위 명령을 부르면 그 설정이 불리지 않는다

2번 때문에 등록된 명령 나무를 훑어 각 명령에 직접 걸어야 한다.

commander 15 에서 쓸 수 있는 것은 둘이다.

| 무엇 | 무엇을 주는가 |
| --- | --- |
| `cmd.registeredArguments` | 그 명령의 positional 인자 목록. 각 항목의 `name()` 이 이름이다 |
| `cmd.configureOutput({ outputError })` | 오류 문자열과 쓰기 함수를 받는 후크 |

`src/index.ts` 가 `program.addCommand(...)` 로 최상위 명령 아홉을 붙인다.
하위 명령은 각 명령 파일 안에서 다시 `addCommand` 로 붙는다.

## 의도 메모

- 후크를 나무 전체에 거는 함수를 따로 둔다. 명령이 늘 때마다 걸어 주는 것을 기억하지 않아도 되게 한다.
- 문구를 만드는 판정을 순수 함수로 뺀다. commander 를 태우지 않고 테스트할 수 있다.
- **`registeredArguments` 는 commander 의 내부에 가까운 표면이다.**
  버전을 올릴 때 사라지면 안내가 조용히 없어진다. 없으면 빈 문자열을 돌려주게 만들어 오류 자체는 그대로 나가게 한다.
  그 대비가 되어 있는지는 작업 항목 2의 테스트가 확인한다.
- 오류 문자열을 정규식으로 읽는다. commander 가 그 문구를 바꾸면 안내가 붙지 않는다.
  붙지 않아도 종전 동작으로 돌아갈 뿐이라 감당할 수 있다.

## 작업 항목

### 1. `src/utils/unknown-option-hint.ts` 를 새로 만든다

```ts
/** commander 의 오류 문자열에서 알 수 없는 옵션 이름을 뽑는다. 아니면 undefined. */
export function parseUnknownOptionName(message: string): string | undefined;

/** 그 이름이 인자를 가리키면 붙일 안내를 만든다. 아니면 빈 문자열. */
export function buildUsageHint(
  optionName: string | undefined,
  commandPath: string,
  argumentNames: string[],
): string;
```

`parseUnknownOptionName` 은 `unknown option '--project'` 에서 `project` 를 뽑는다.
앞의 `-` 를 모두 뗀다. 짧은 옵션(`-p`)도 같은 문구로 오므로 함께 처리한다.

`buildUsageHint` 는 이름이 인자를 가리킬 때만 문자열을 만든다.
가리키는 것으로 보는 경우는 둘이다. ADR-058 이 그 판정을 소유한다.

| 판정 | 예 |
| --- | --- |
| 인자 이름과 정확히 같다 | `--project` 와 `[project]` |
| 인자 이름이 `X-` 로 시작하고 그런 인자가 그 명령에 하나뿐이다 | `--post` 와 `[post-number]` |

정확일치를 먼저 본다. 정확일치가 있으면 접두 판정을 하지 않는다.
`X-` 로 시작하는 인자가 둘 이상이면 어느 쪽인지 정할 수 없으므로 빈 문자열을 돌려준다.
`post get` 의 인자 이름은 `project` 와 `post-number` 다(`src/commands/post/get.ts`).
정확일치만 두면 이슈가 든 `--post` 에 안내가 붙지 않는다.

```
  'project' 는 인자로 전달합니다: dooray post get <project> <post-number>
```

- 앞에 공백 두 칸을 둔다. commander 의 오류 줄과 구별된다
- `commandPath` 는 `dooray post get` 처럼 최상위부터의 경로다
- 인자 이름은 `<이름>` 으로 감싸 공백으로 잇는다
- `argumentNames` 가 빈 배열이면 빈 문자열을 돌려준다
- 끝에 줄바꿈 하나를 붙인다

`--id` 나 `--url` 같은 다른 입력 경로는 안내에 넣지 않는다.
명령마다 그 경로가 달라, 넣으려면 명령별 문구를 다시 쓰게 된다.
사용자는 그 명령의 `--help` 로 나머지를 볼 수 있다.

### 2. `src/utils/unknown-option-hint.test.ts` 를 만든다

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 긴 옵션 | `unknown option '--project'` | `project` |
| 짧은 옵션 | `unknown option '-p'` | `p` |
| 다른 오류 | `error: required option '--x' not specified` | `undefined` |
| 인자와 같은 이름 | `project`, 인자 `["project", "post-number"]` | 안내에 `<project> <post-number>` 가 들어간다 |
| 접두가 맞는 이름 | `post`, 인자 `["project", "post-number"]` | 안내에 `<project> <post-number>` 가 들어간다 |
| 접두 후보가 둘 | `post`, 인자 `["post-number", "post-id"]` | 빈 문자열 |
| 정확일치가 접두보다 앞선다 | `post`, 인자 `["post", "post-number"]` | 안내가 붙는다 |
| 인자와 다른 이름 | `zzz`, 같은 인자 목록 | 빈 문자열 |
| 이름이 없음 | `undefined` | 빈 문자열 |
| 인자가 없는 명령 | `project`, 빈 배열 | 빈 문자열 |

두 번째와 세 번째가 접두 판정 경로다.
접두 후보가 둘일 때 붙이지 않는 것을 함께 확인해야 엉뚱한 인자로 보내지 않는다.
마지막은 `registeredArguments` 가 없어졌을 때의 대비다.
그 자리에서 빈 배열이 넘어오므로 안내가 붙지 않고 오류만 나간다.

### 3. `src/utils/unknown-option-hint.ts` 에 후크를 거는 함수를 두고 `src/index.ts` 가 부른다

명령 나무를 훑어 각 명령에 `configureOutput` 을 건다.
함수는 작업 항목 1의 파일에 함께 두고 내보낸다. 테스트에서 직접 부를 수 있어야 한다.

```ts
function attachUsageHint(cmd: Command, path: string): void {
  const commandPath = path ? `${path} ${cmd.name()}` : cmd.name();
  cmd.configureOutput({
    outputError: (str, write) => {
      const name = parseUnknownOptionName(str);
      const args = (cmd.registeredArguments ?? []).map((a) => a.name());
      write(str + buildUsageHint(name, commandPath, args));
    },
  });
  for (const sub of cmd.commands) attachUsageHint(sub, commandPath);
}
```

`program.addCommand(...)` 가 모두 끝난 **뒤**, `program.parseAsync()` **앞**에 한 번 부른다.

```ts
attachUsageHint(program, "");
```

최상위 `program` 의 이름이 `dooray` 인지 확인한다. 아니면 `attachUsageHint(program, "")` 대신
빈 경로에 `dooray` 를 넣어 부른다. 사용자가 실제로 입력하는 명령 이름이어야 안내를 그대로 옮겨 쓸 수 있다.

`registeredArguments` 가 commander 15 에 있는 것은 확인했다.
타입에 없으면 `as` 로 억지로 맞추지 말고, 없을 때 빈 배열이 되는 접근을 쓴다.

### 4. `src/utils/unknown-option-hint.test.ts` 에 확인 둘을 더 담는다

commander 명령 나무를 직접 만들어 확인한다. `src/index.ts` 를 통째로 태우지 않는다.
그 파일은 설정 읽기를 포함해 부작용이 많다.

작업 항목 3에서 `attachUsageHint` 를 이 유틸리티에 두고 내보내므로 테스트에서 그대로 부른다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 하위 명령까지 전파 | 두 단계 아래 명령에 인자 이름과 같은 옵션을 준다 | 그 명령의 후크가 불려 안내가 붙는다 |
| 경로 조립 | 위와 같은 상황 | 안내의 명령 경로가 최상위부터 이어진다 |

첫 번째가 이 phase 의 핵심이다. 전파되지 않는 것이 ADR-058 이 적은 실측이다.

명령 나무를 만들 때 `exitOverride()` 를 걸어야 테스트가 프로세스를 끝내지 않는다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm vitest run src/utils/unknown-option-hint.test.ts
```

종료 코드 0 이어야 한다.

이슈가 보고한 호출을 그대로 실행한다.

```bash
# cwd: <repo root>
node dist/index.js post get --project 123 --post 456 ; echo "종료코드=$?"
```

출력 첫 줄이 `error: unknown option '--project'` 이고,
둘째 줄에 `'project' 는 인자로 전달합니다:` 와 `<project> <post-number>` 가 있어야 한다.
종료 코드는 commander 의 기본값인 1 이다.

인자 이름과 겹치지 않는 옵션에는 안내가 붙지 않는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post get --zzzz 1 2>&1 | grep -c "인자로 전달합니다" || true   # = 0
```

0 이어야 한다. `grep -c` 는 찾지 못하면 종료 코드 1 로 끝나므로 `|| true` 로 받는다.

옵션 오타 제안이 그대로 나오는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post get --urls 1 2>&1 | grep -c "Did you mean"   # >= 1
```

1 이상이어야 한다. commander 의 기존 동작을 이 변경이 덮지 않았다는 값이다.

두 단계 아래 명령에도 전파됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post file download-all --project x 2>&1 | grep -c "인자로 전달합니다"   # >= 1
```

`post file download-all` 의 인자는 `[project]` 와 `[post-number]` 다
(`src/commands/post/file/download-all.ts`). `--project` 는 앞의 것과 정확일치한다.
`wiki page get` 은 이 확인에 쓰지 않는다. 그 명령은 `--project` 를 실제 옵션으로 갖고 있어
`unknown option` 오류 자체가 나지 않는다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/unknown-option-hint.ts` | 신규 — 오류 문자열 해석, 안내 조립, 나무 전체에 후크 걸기 |
| `src/utils/unknown-option-hint.test.ts` | 신규 — 확인 12건 |
| `src/index.ts` | 수정 — `attachUsageHint` 한 줄 호출 |
