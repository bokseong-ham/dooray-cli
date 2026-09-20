# Phase 03. 출력이 문서와 어긋난 두 곳을 고친다

**Execution profile**: fast

## 목표

`post comment delete --json` 이 JSON 을 내게 하고, `feedback` 이 붙이는 환경 블록의 버전이
`dooray --version` 과 같은 값이 되게 한다.

**범위 외**: 인라인 파일 다운로드는 phase 01, 알 수 없는 옵션 안내는 phase 02 다. 문서는 phase 04 다.
`post file upload --json` 은 **코드를 고치지 않는다.** 서버가 `id` 하나만 내려주는 것이고,
저장소 서술을 사실에 맞추는 정정은 `docs/adr/031-file-json-output-schema.md` 에 이미 들어갔다.
남은 것은 `skills/dooray-cli/SKILL.md` 의 표를 고치는 일이고 그것은 phase 04 다.

## 컨텍스트

**근거 문서**: `docs/adr/031-file-json-output-schema.md` 의 「정정」 절과
`docs/adr/036-delete-confirmation-policy.md`.

### `post comment delete --json`

`src/commands/post/comment/delete.ts` 의 마지막 줄이 출력 모드와 무관하게 평문을 낸다.

```ts
process.stdout.write(`댓글이 삭제되었습니다: ${commentId}\n`);
```

같은 성격의 `post file delete` 는 세 모드를 모두 다룬다.
그 파일의 출력 분기를 읽어 형태를 맞춘다.

```bash
# cwd: <repo root>
grep -n "globalOpts" src/commands/post/file/delete.ts
```

이 명령은 `globalOpts` 를 아직 읽지 않는다. `optsWithGlobals()` 호출을 더해야 한다.
같은 디렉터리의 다른 명령이 그것을 어떻게 부르는지 보고 같은 형태로 쓴다.

### `feedback` 의 버전

`src/utils/feedback-meta.ts` 의 `readCliVersion` 이 `process.argv[1]` 의 디렉터리부터
위로 세 단계까지 `package.json` 을 찾는다. 찾지 못하면 `"unknown"` 을 돌려준다.

**전역 설치에서는 세 후보 어디에도 그 파일이 없다.** `argv[1]` 이 `bin` 디렉터리의 실행 파일이라
찾는 자리가 `bin/package.json` 과 그 위 둘이 되는데, 실제 파일은
`lib/node_modules/@bifos/dooray-cli/package.json` 에 있다.

`dooray --version` 은 다른 경로를 쓴다.
`src/version.ts` 의 `CLI_VERSION` 이고, `tsup.config.ts` 의 `define` 이 빌드할 때 값을 상수로 박는다.
설치 위치와 무관하고 파일을 찾지 않는다.

실측이다.

```
$ dooray --version
0.19.0

$ dooray feedback --dry-run --title t --body b
## 환경
- dooray-cli 버전: unknown
```

저장소에서 `node dist/index.js` 로 부르면 두 단계 위가 저장소 root 라 정상으로 나온다.
그래서 개발 중에는 드러나지 않았다.

## 의도 메모

- `readCliVersion` 을 고치지 않고 **없앤다.** 파일을 찾는 방식 자체가 설치 위치에 기대는 것이라,
  후보를 늘려도 다른 설치 형태에서 같은 일이 난다.
  `CLI_VERSION` 은 빌드 시점에 박히므로 찾을 것이 없다.
- 두 값이 같은 곳에서 나오면 `--version` 과 `feedback` 이 어긋날 수 없다.
- `post comment delete` 의 평문 출력 문구는 그대로 둔다. 바꾸면 그 문구를 읽던 쪽이 깨진다.

## 작업 항목

### 1. `src/commands/post/comment/delete.ts` 에 출력 분기를 넣는다

`action` 의 첫머리에서 `commentDeleteCommand.optsWithGlobals() as OutputOptions` 를 받는다.

마지막 출력을 세 모드로 나눈다.

```ts
if (globalOpts.json) {
  printJson({ commentId, status: "deleted" });
} else if (globalOpts.quiet) {
  process.stdout.write(`${commentId}\n`);
} else {
  process.stdout.write(`댓글이 삭제되었습니다: ${commentId}\n`);
}
```

`post file delete` 의 `--json` 이 `{ fileId, status: "deleted" }` 를 낸다.
키 이름만 그 명령이 다루는 식별자에 맞춘다. `status` 값은 같은 `"deleted"` 를 쓴다.

**취소 경로의 출력은 바꾸지 않는다.** 확인에서 거절하면 지금처럼 stderr 에 `취소되었습니다.` 를 내고 끝낸다.
JSON 으로 바꾸면 삭제하지 않은 것을 삭제 결과처럼 읽을 수 있다.

### 2. `src/commands/feedback.ts` 가 `CLI_VERSION` 을 쓰게 한다

`readCliVersion()` 호출을 `CLI_VERSION` 으로 바꾼다.
그 값은 상수라 `await` 이 필요 없다. 호출부의 `await` 을 함께 뺀다.

```ts
import { CLI_VERSION } from "../version.js";
// ...
const meta = collectMeta(CLI_VERSION);
```

`readCliVersion` 을 `src/utils/feedback-meta.ts` 에서 삭제한다.
그 함수만 쓰던 import(`readFile`, `dirname`, `join`)가 있으면 함께 뺀다.

`readCliVersion` 을 쓰는 다른 곳이 있는지 먼저 확인한다.

```bash
# cwd: <repo root>
grep -rn "readCliVersion" src/
```

그 함수의 테스트가 `src/utils/feedback-meta.test.ts` 에 있으면 함께 지운다.
없어진 함수의 테스트를 남기면 빌드가 깨진다.

### 3. 테스트를 더한다

`src/commands/post/comment/delete.ts` 의 테스트 파일이 있으면 거기에, 없으면 만들어 담는다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| `--json` | `-y --json` | 출력이 `{"commentId": "...", "status": "deleted"}` 로 parse 된다 |
| `--quiet` | `-y --quiet` | 출력이 댓글 id 한 줄이다 |
| 기본 | `-y` | 종전 문구가 나온다 |
| 취소 | TTY 에서 거절 | 삭제 API 가 불리지 않고 stdout 에 아무것도 나오지 않는다 |

`src/utils/feedback-meta.test.ts` 에는 확인 하나를 더한다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 환경 블록의 버전 | `collectMeta(CLI_VERSION)` 결과로 만든 블록 | 버전 자리가 `unknown` 이 아니다 |

테스트에서 `CLI_VERSION` 은 `__DOORAY_CLI_VERSION__` 이 정의되지 않아 `0.0.0-dev` 가 된다.
그 값이 `unknown` 이 아닌 것이 이 확인의 요점이다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 종료 코드 0 이어야 한다.

`readCliVersion` 이 사라졌는지 본다.

```bash
# cwd: <repo root>
grep -rc "readCliVersion" src/ | grep -v ":0" ; echo "남은파일=$?"
```

`남은파일=1` 이어야 한다. `grep` 이 아무것도 찾지 못했다는 뜻이다.

`CLI_VERSION` 을 쓰는지 본다.

```bash
# cwd: <repo root>
grep -c "CLI_VERSION" src/commands/feedback.ts   # >= 1
```

빌드한 결과로 실제 출력을 본다.

```bash
# cwd: <repo root>
node dist/index.js --version
node dist/index.js feedback --dry-run --title t --body b 2>&1 | grep "dooray-cli 버전"
```

두 출력의 버전이 같아야 하고 `unknown` 이 아니어야 한다.

전역 설치에서도 확인한다. 이 결함이 전역 설치에서만 드러나기 때문이다.

```bash
# cwd: <repo root>
pnpm run build
npm link
dooray --version
dooray feedback --dry-run --title t --body b 2>&1 | grep "dooray-cli 버전"
```

두 값이 같아야 한다.
확인이 끝나면 되돌린다.

```bash
# cwd: <repo root>
npm unlink -g @bifos/dooray-cli
```

`npm link` 가 전역 상태를 바꾸므로, 이미 전역 설치가 있으면 그것을 대신하게 된다.
되돌린 뒤 `which dooray` 로 원래 경로가 돌아왔는지 본다. 돌아오지 않으면 `npm i -g @bifos/dooray-cli` 로 다시 설치한다.

`post comment delete --json` 은 실제 삭제를 요구하므로 자동 확인을 하지 않는다.
동작은 위 단위 테스트가 판정한다.
실제 삭제로 확인하려면 사용자가 버려도 되는 댓글을 직접 정해서 실행한다.
댓글 삭제는 되돌릴 수 없다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/post/comment/delete.ts` | 수정 — `--json` 과 `--quiet` 분기 |
| `src/commands/feedback.ts` | 수정 — `CLI_VERSION` 사용 |
| `src/utils/feedback-meta.ts` | 수정 — `readCliVersion` 삭제 |
| `src/utils/feedback-meta.test.ts` | 수정 — 삭제된 함수의 테스트 제거, 확인 1건 추가 |
| `src/commands/post/comment/delete.test.ts` | 신규 또는 수정 — 확인 4건 |
