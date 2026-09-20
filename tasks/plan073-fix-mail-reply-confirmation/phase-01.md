# Phase 01. UID 직접 입력도 발송 전에 확인을 거치게 한다

**Execution profile**: standard

## 목표

`mail reply` 의 확인 판정을 입력 형식에서 떼어 내, 세 입력 형식 모두가 발송 전에 한 번 멈추게 한다.
되돌릴 수 없는 발송을 `-y` 없이 비대화형으로 실행하는 경로를 없앤다.

**범위 외**: `resolveMailTarget` 과 `resolveMailUid` 의 동작은 바꾸지 않는다.
`mail get` 은 조회라 대상이 아니다. `mail send` 도 대상이 아니다.
문서 갱신은 phase 02 가 맡는다.

## 컨텍스트

`src/commands/mail/reply.ts:29` 가 확인 여부를 입력 형식으로 정한다.

```ts
const needsConfirmation = mailTarget.kind === "mailId" && !opts.yes;
```

`kind` 는 `src/resolvers/mail-input.ts:51-58` 의 `classifyMailInputToken` 이 정한다.
32비트 경계 이하의 숫자는 `uid`, 그보다 큰 숫자와 메일 웹 주소는 `mailId` 가 된다.
그래서 `dooray mail reply 5 --body "hi"` 는 TTY 든 아니든 확인 없이 바로 발송한다.

확인 화면을 만드는 데 필요한 원본은 UID 경로에서도 이미 받고 있다.
`src/commands/mail/reply.ts:60` 의 `getMail` 이 답장 제목과 `In-Reply-To` 를 얻으려고 부르는 호출이고,
그 응답에 제목과 보낸사람과 `internalDate` 와 `uid` 가 모두 들어 있다.
**확인을 붙여도 IMAP 왕복이 늘지 않는다.**

non-TTY 차단은 `src/commands/mail/reply.ts:30-36` 에 이미 있고
`getConfigOrThrow` 보다 앞에 있다. 그 위치는 그대로 둔다.

**근거 문서**: `docs/adr/060-mail-reply-confirmation-policy.md`

## 의도 메모

- `src/utils/delete-confirmation.ts` 의 `authorizeDeletion` 을 쓰지 않는다.
  그 헬퍼의 `promptDeletion` 은 프롬프트를 stdout 에 내는데,
  이 명령은 `src/commands/mail/reply.ts:86` 에서 `{ output: process.stderr }` 를 준다.
  데이터는 stdout, 프롬프트는 stderr 라는 저장소 규약을 지키려면 그 인자가 필요하다.
  헬퍼를 고쳐 맞추면 삭제 명령 여섯의 출력 위치가 함께 바뀌므로 이 변경의 범위를 넘는다.
  같은 모양을 쓰되 코드는 공유하지 않는다.
- 확인 화면의 머리말은 입력 형식에 따라 다르게 둔다.
  추정으로 찾은 원본과 UID 로 지목한 원본은 사용자가 확인할 것이 다르다.
  앞의 것은 원본이 맞는지, 뒤의 것은 받는 사람이 맞는지가 물음이다.
- 확인을 묻기 전에 스피너를 멈추는 지금 처리(`src/commands/mail/reply.ts:71-72`)를 유지한다.
  확인을 물을 자리에서 「조회 완료」를 내면 이미 답장까지 끝난 것으로 읽힌다는 주석이 그 자리에 있다.

## 작업 항목

### 1. `src/commands/mail/reply.ts` 의 확인 판정을 입력 형식에서 뗀다

29번 줄을 아래로 바꾼다.

```ts
const needsConfirmation = !opts.yes;
```

`mailTarget` 은 그대로 둔다. 스피너 문구(`:49`, `:56`)와 머리말 분기가 그 값을 계속 쓴다.

### 2. non-TTY 오류 문구를 입력 형식과 무관하게 고친다

30번 줄부터의 `DoorayCliError` 메시지가 지금은 「시간으로 찾은 원본 메일」을 말한다.
UID 입력에는 맞지 않으므로 아래 뜻을 담아 고친다.

- non-TTY 에서는 원본 메일을 확인할 수 없다는 것
- 발송은 되돌릴 수 없다는 것
- `--yes(-y)` 로 다시 실행하라는 것

`--yes(-y)` 라는 표기는 그대로 둔다. `src/commands/mail/reply.test.ts:188` 이 그 문자열을 단언한다.

### 3. `--yes` 옵션 설명을 고친다

25번 줄의 `"시간으로 찾은 원본 메일 확인 생략 (자동화용)"` 을
`"원본 메일 확인 생략 (자동화용)"` 으로 바꾼다.

### 4. 확인 화면의 머리말을 입력 형식에 따라 나눈다

77번 줄부터의 `message` 배열 첫 줄이 지금은 `"도착 시각으로 찾은 원본 메일입니다."` 하나다.
`mailTarget.kind` 로 나눈다.

| `kind` | 첫 줄 |
| --- | --- |
| `mailId` | `도착 시각으로 찾은 원본 메일입니다.` (지금 문구 그대로) |
| `uid` | `이 메일에 답장합니다. 발송은 되돌릴 수 없습니다.` |

나머지 네 줄(제목, 보낸사람, IMAP 도착 시각, UID)과 마지막 물음 줄은 그대로 둔다.
`sanitizeReplyPreview` 를 거치는 처리도 그대로다.
`src/commands/mail/reply.test.ts:246` 이 그 위조 방지를 단언하므로 건드리면 깨진다.

### 5. `src/commands/mail/reply.test.ts` 의 기존 확인 하나를 뒤집고 넷을 더한다

**이 파일은 이미 있다. 331줄이고 확인 열한 건을 담고 있다.**
기본값은 `beforeEach` 에서 TTY 가 참이고 `confirm` 이 참을 돌려준다(`:78-82`).

먼저 `:166` 의 확인을 지운다.

```
it.each([true, false])("TTY %s에서 UID 직접 입력은 탐색과 확인을 생략한다", ...)
```

이 확인이 단언하는 `mocks.confirm).not.toHaveBeenCalled()` 와
`stopSpinner(true, "원본 메일 조회 완료")` 가 이번 변경으로 둘 다 거짓이 된다.
그 자리에 아래 넷을 둔다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| UID 도 확인을 거친다 | TTY, UID `337`, 플래그 없음 | `confirm` 이 한 번 불리고 `sendMail` 도 불린다. `resolveUidByMailId` 는 불리지 않는다 |
| UID 의 확인 머리말 | 위와 같음 | `confirm` 에 넘어간 `message` 가 `되돌릴 수 없습니다` 를 담는다 |
| 거절하면 보내지 않는다 | TTY, UID `337`, `confirm` 이 거짓 | `sendMail` 이 불리지 않고 예외 없이 끝난다 |
| non-TTY 의 UID 도 차단한다 | non-TTY, UID `337`, 플래그 없음 | `EXIT_PARAM_ERROR` 로 거절하고 `getConfigOrThrow` 와 `getMail` 이 불리지 않는다 |

네 번째가 이슈가 보고한 사고 경로다. 이것이 이 phase 의 실패 확인이다.

`:179` 의 `non-TTY 추정 입력 %s은 설정 조회 전에 차단한다` 는 `it.each` 의 입력 목록에
UID `"337"` 을 더해도 된다. 더하면 네 번째 확인과 겹치므로 둘 중 하나만 둔다.

나머지 확인 열 건은 그대로 통과한다. 기본 TTY 가 참이고 `confirm` 이 참을 돌려주기 때문이다.
`:305` 는 `getMail` 이 확인보다 먼저 실패하고, `:316` 은 확인을 통과해 발송까지 간다.
통과를 전제로만 두지 말고 실제로 `pnpm test` 로 확인한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
```

타입 오류가 없어야 한다.

```bash
# cwd: <repo root>
pnpm test src/commands/mail/reply.test.ts
```

종료 코드 0 이어야 한다. 확인 건수가 종전 열한에서 열넷이 된다.
`:179` 에 UID 를 더하는 쪽을 골랐으면 열셋이다.

```bash
# cwd: <repo root>
pnpm test
```

종료 코드 0 이어야 한다. 다른 파일의 확인이 함께 돈다.

```bash
# cwd: <repo root>
grep -c 'kind === "mailId" && !opts.yes' src/commands/mail/reply.ts || true
```

0 이어야 한다. 입력 형식으로 정하던 판정이 남지 않은 것을 본다.

```bash
# cwd: <repo root>
grep -c "시간으로 찾은" src/commands/mail/reply.ts || true
```

0 이어야 한다. 오류 문구와 옵션 설명 둘 다 고쳐진 것을 본다.

**실제 발송 확인은 하지 않는다.** 이 명령은 메일을 보내고 그것을 되돌릴 수 없다.
이슈가 보고한 사고가 바로 그 확인을 하다가 난 것이다.
동작 판정은 위 단위 확인이 소유한다.

빌드 산출물로 도움말만 본다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js mail reply --help
```

`-y, --yes` 행의 설명이 `원본 메일 확인 생략 (자동화용)` 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/mail/reply.ts` | 수정 |
| `src/commands/mail/reply.test.ts` | 수정 |
