# Phase 03. `mail attachment` 명령

**Execution profile**: standard

## 목표

`dooray mail attachment <target> [--id <순번>]... [-o <dir>] [--force]` 로 메일 첨부를 파일에 저장하고 명령 그룹에 등록한다.

**범위 외**: `imapClient` 와 `mail get` 출력(phase 01, 02). 문서(이미 갱신됨). 업무·위키 다운로드의 덮어쓰기 규칙.

## 컨텍스트

- phase 01 이 `src/api/imapClient.ts` 에 `getMailAttachments(config, uid, mailbox)` 를 더했다. 반환은 `{ subject, attachments: Array<{ index, fileName, size, contentType, inline, content: Buffer }> }` 이고, `fileName` 은 이미 저장 이름 규칙(중복은 `<이름>-<순번><확장자>`)이 적용된 값이다.
- 입력 해석은 `mail get` 과 같다. `src/commands/mail/get.ts` 가 `resolveMailTarget(target)` 로 잘못된 입력을 설정 조회 전에 거절하고, `getConfigOrThrow()` 후 `resolveMailUid(config, target)` 로 `{ uid, mailbox }` 를 얻는다. 이 순서와 스피너(`startSpinner`, `stopSpinner`) 사용을 그대로 따른다.
- 결과 출력은 `src/formatters/file-output.ts` 의 `emitDownloadAllResult(globalOpts, { count, succeeded: [{ path, fileName }], failed: [{ fileId, error }] })` 를 쓴다 (ADR-031). 메일에는 파일 ID 가 없어 `failed[].fileId` 에는 순번을 문자열로 넣는다.
- 종료 코드는 `src/utils/exit-codes.ts` 의 `EXIT_PARAM_ERROR`(3)를 쓰고, 오류는 `src/utils/errors.ts` 의 `DoorayCliError(message, exitCode)` 로 던진다. 부분 실패는 `process.exitCode = 1` 로 표시한다 (`src/commands/post/file/download-all.ts` 의 끝부분과 같다).
- 명령은 `src/index.ts` 의 `mailCommand.addCommand(mailGetCommand)` 다음 줄에 등록한다.

**근거 문서**: `docs/adr/071-mail-attachment-download.md`, `docs/flow.md` 의 「`mail attachment`」 절

## 의도 메모

- `--force` 가 없으면 `writeFile(path, content, { flag: "wx" })` 로 열고 `EEXIST` 를 그 첨부의 실패로 센다. 존재 확인 후 쓰기(`access` 뒤 `writeFile`)는 그 사이에 생긴 파일을 덮어쓰므로 쓰지 않는다.
- 저장 전 확인은 묻지 않는다. 대신 대상 메일의 제목과 UID 를 stderr 에 한 줄로 알린다. 근거는 ADR-071 이다. `--json` 과 `--quiet` 에서는 알리지 않는다.
- 옵션 이름 `-o, --output` 은 업무·위키 다운로드와 같다.

## 작업 항목

### 1. `src/commands/mail/attachment.ts` 신규

`export const mailAttachmentCommand = new Command("attachment")`

- 설명: `메일 첨부 파일 저장`
- 인자: `<target>` — `메일 UID / 메일 웹 주소 / 웹 주소의 mail id`
- 옵션:
  - `--id <index>`: `저장할 첨부 순번 (mail get 이 보여 준 값, 여러 번 줄 수 있다. 없으면 모두 저장)`. 값마다 commander 의 누적 파서로 모아 배열로 받는다. 값 검증은 아래 2번과 같은 자리(설정 조회 전)에서 한다.
  - `-o, --output <dir>`: `저장 디렉토리`, 기본 `.`
  - `--force`: `같은 이름의 파일을 덮어쓴다`
- 동작 순서:
  1. `resolveMailTarget(target)` 으로 입력을 검사한다.
  2. `--id` 값이 1 이상의 정수가 아니면 `EXIT_PARAM_ERROR` 로 중단한다. 중복 값은 하나로 합친다. 여기까지는 설정 조회 전이다.
  3. `getConfigOrThrow()`, `resolveMailUid(config, target)`, `getMailAttachments(config, uid, mailbox)`. 스피너는 `get.ts` 와 같게 조회 전체를 `try` 로 감싸고, `getMailAttachments` 직후 `stopSpinner(true, ...)` 를 부른다. 이후 단계(6번, `mkdir`)의 오류는 `catch` 에서 `stopSpinner(false)` 후 다시 던진다. 4번의 stderr 줄과 8번의 출력은 스피너를 끈 뒤에 쓴다. 5번의 조기 종료도 스피너를 끈 뒤다.
  4. `--json` 도 `--quiet` 도 아니면 stderr 에 `대상 메일: UID <uid> "<제목>"` 을 한 줄 쓴다. 제목은 `sanitizeForTerminal` 을 거친다.
  5. 첨부가 없고 `--id` 도 없으면 `--json` 은 `{ count: 0, succeeded: [], failed: [] }`, `--quiet` 는 아무것도 쓰지 않고, 그 밖에는 `첨부파일이 없습니다.` 를 stdout 에 쓰고 종료 코드 0 으로 끝낸다. 첨부가 없는데 `--id` 가 있으면 아래 6번으로 간다.
  6. `--id` 로 준 순번 중 메일에 없는 것이 있으면 파일을 하나도 쓰기 전에 `EXIT_PARAM_ERROR` 로 중단한다. 메시지에 없는 순번과 유효한 범위(`1-<n>`, 첨부가 없으면 `첨부 없음`)를 쓴다.
  7. 대상은 `--id` 가 있으면 그 순번들(오름차순), 없으면 전부다. 출력 디렉터리를 `mkdir(..., { recursive: true })` 로 만든다.
  8. 대상마다 `join(output, fileName)` 에 `writeFile(path, content, { flag: force ? "w" : "wx" })` 로 쓴다.
     - 성공이면 `succeeded` 에 `{ path, fileName }` 을 더하고, 평문 모드(`--json`, `--quiet` 아님)에서만 `✓ <fileName>` 을 stdout 에 쓴다.
     - `EEXIST` 면 `failed` 에 `{ fileId: String(index), error: "이미 있습니다 (덮어쓰려면 --force): <path>" }` 를 더한다.
     - 그 밖의 오류는 `failed` 에 `{ fileId: String(index), error: <오류 메시지> }` 를 더한다.
     - 실패는 `--json` 이 아니면 stderr 에 `✗ <fileName> (<index>): <error>` 로 쓴다.
     - `✓`, `✗` 줄과 오류 메시지에 들어가는 fileName 과 path 는 `sanitizeForTerminal` 을 거쳐 쓴다. `--json` 과 `--quiet` 의 경로 출력(`emitDownloadAllResult`)은 그대로 둔다.
  9. `emitDownloadAllResult(globalOpts, { count: 대상 수, succeeded, failed })`. `failed` 가 있으면 `process.exitCode = 1`.
- 로직이 길어지면 `src/commands/post/file/download-all.ts` 처럼 한 파일 안의 action 에 둔다. 새 유틸 파일은 만들지 않는다.

### 2. `src/index.ts` 변경

`import { mailAttachmentCommand } from "./commands/mail/attachment.js";` 를 `mailGetCommand` import 다음에 더하고, `mailCommand.addCommand(mailGetCommand);` 다음 줄에 `mailCommand.addCommand(mailAttachmentCommand);` 를 더한다.

### 3. `src/commands/mail/attachment.test.ts` 신규

`src/commands/mail/get.test.ts` 와 같은 방식으로 `getConfigOrThrow`, `../../api/imapClient.js`(`getMailAttachments`, `resolveUidByMailId`), `../../utils/spinner.js` 를 mock 한다. 파일은 실제로 `os.tmpdir()` 아래 `mkdtemp` 한 디렉터리에 쓰고 `afterEach` 에서 지운다. 다음을 확인한다.

- 정상: 첨부 둘을 전부 저장하고 두 파일의 내용이 `content` 와 같다. `--json` 출력의 `count` 가 2 이고 `succeeded` 가 두 경로다.
- `--id 2` 만 주면 2번 첨부만 저장한다.
- 같은 이름의 파일이 이미 있으면 그 첨부는 실패하고(`failed` 에 순번) 기존 내용이 그대로이며 `process.exitCode` 가 1 이다. `--force` 를 주면 덮어쓴다.
- 없는 순번(`--id 9`)은 `EXIT_PARAM_ERROR` 로 중단하고 어떤 파일도 쓰지 않는다. `--id 0` 과 `--id abc` 는 `getConfigOrThrow` 호출 전에 중단한다.
- 첨부가 없는 메일(`--id` 없음)은 종료 코드 0 이고 파일을 만들지 않는다.
- 쓰기 오류(EEXIST 가 아닌 것, 예: 출력 경로 자리에 디렉터리가 있음)는 그 첨부만 `failed` 로 세고 나머지는 계속 저장한다.
- stderr 에 `대상 메일: UID` 줄이 평문 모드에서 한 번 나오고 `--json` 과 `--quiet` 에서는 나오지 않는다 (`process.stderr.write` 스파이). `--quiet` 의 stdout 은 저장한 경로뿐이다.
- 메일 웹 주소 입력은 `resolveUidByMailId` 로 UID 를 찾는다 (`get.test.ts` 의 같은 이름 테스트를 참고).

`process.exitCode` 를 바꾸는 테스트는 끝에서 `process.exitCode = undefined` 로 되돌린다.

### 4. 마지막 phase 마감

이 phase 가 끝나면 `tasks/plan74-mail-attachment/index.json` 의 `status` 를 `completed` 로 바꾼다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm vitest run src/commands/mail/attachment.test.ts
pnpm test
pnpm run build
node dist/index.js mail attachment --help
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

기대값: `tsc` 오류 0건, 새 테스트 전부 통과, 전체 테스트 통과, 빌드 성공, `--help` 출력에 `--id <index>`, `-o, --output <dir>`, `--force` 가 모두 보인다, PII 검사와 공개 문서 참조 검사 통과.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/mail/attachment.ts` | 신규 |
| `src/commands/mail/attachment.test.ts` | 신규 |
| `src/index.ts` | 수정 |
