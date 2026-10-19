# Phase 01. 첨부 파싱과 저장 이름 규칙

**Execution profile**: standard

## 목표

`api/imapClient` 가 메일의 첨부 메타데이터와 내용을 돌려주고, 저장 이름을 정하는 순수 함수를 둔다. 뒤 phase 의 두 명령이 이 둘을 쓴다.

**범위 외**: `mail get` 출력 변경(phase 02), `mail attachment` 명령과 등록(phase 03). 문서는 이미 갱신되어 있어 이 plan 의 어느 phase 도 `docs/` 를 고치지 않는다.

## 컨텍스트

- `src/api/imapClient.ts` 의 `getMail` 은 `fetchOne(..., { source: true })` 로 원문을 받아 `simpleParser(source)` 로 파싱한다. 파싱 결과 `ParsedMail.attachments` 에 첨부가 이미 있다. 각 항목의 `filename?`, `contentType`, `size`, `contentDisposition`, `related`, `content`(Buffer)는 `node_modules/@types/mailparser/index.d.ts` 의 `Attachment` 에서 읽는다.
- 저장 이름 정리에는 `src/utils/content-disposition.ts` 의 `sanitizeFileName(name): string | null` 을 쓴다 (NFC, basename, 제어 문자 제거, 255바이트 초과면 null). `src/utils/attachment-check.ts` 에도 같은 이름의 `sanitizeFileName` 이 있지만 터미널 출력용이라 다른 함수다. 가져오는 경로를 틀리지 않는다.
- `src/api/imapClient.test.ts` 는 `imapflow` 의 `ImapFlow` 를 가짜 클라이언트로 바꾸고 실제 `mailparser` 로 원문을 파싱한다. 새 테스트도 이 방식을 따른다. 첨부가 든 원문은 테스트 안에서 RFC 822 문자열로 직접 만든다 (`Content-Type: multipart/mixed` 와 base64 파트).

**근거 문서**: `docs/adr/071-mail-attachment-download.md`, `docs/flow.md` 의 「`mail attachment`」 절, `docs/adr/067-attachment-file-name-decoding.md`

## 의도 메모

- IMAP 에는 안정적인 첨부 ID 가 없어 순번(1부터, `parsed.attachments` 순서)을 식별자로 쓴다 (ADR-071).
- `getMail` 의 반환에 첨부 **메타데이터만** 더한다. 내용(Buffer)은 `getMailAttachments` 에서만 준다. `mail get` 과 `mail reply` 가 큰 Buffer 를 들고 있지 않게 하려는 것이다.
- 파일 이름 중복 규칙(두 번째부터 `<이름>-<순번><확장자>`)은 `--force` 가 같은 메일의 첨부끼리 덮어쓰는 일을 막으려는 것이다. 이 규칙은 이름 함수가 소유한다.

## 작업 항목

### 1. `src/utils/mail-attachment-name.ts` 신규

```ts
export function assignAttachmentFileNames(
  items: ReadonlyArray<{ index: number; filename: string | undefined }>,
): Map<number, string>
```

- `index` 는 1부터 시작하는 순번이다. 반환 Map 의 키도 `index` 다.
- 이름은 `sanitizeFileName(filename)` 으로 정한다. `filename` 이 없거나 null 이 나오면 `attachment-<index>` 다.
- 이미 쓰인 이름과 같으면(대소문자를 구분한다) `<확장자 앞까지>-<index><확장자>` 로 바꾼다. 확장자는 마지막 `.` 이후이고, 이름이 `.` 으로 시작하는 파일(`.env`)이나 `.` 이 없는 이름은 확장자가 없다. 바꾼 이름도 255바이트를 넘으면 `attachment-<index>` 로 대체한다.
- 파일 시스템에는 의존하지 않는다 (순수 함수).

### 2. `src/api/imapClient.ts` 변경

- 타입 추가·export:

  ```ts
  export interface MailAttachmentInfo {
    index: number;        // 1부터 시작
    fileName: string;     // assignAttachmentFileNames 가 정한 저장 이름
    size: number;
    contentType: string;
    inline: boolean;      // contentDisposition === "inline" || related
  }
  ```

- `getMail` 의 반환 타입에 `attachments: MailAttachmentInfo[]` 를 더한다. `parsed.attachments` 에서 만든다. 첨부가 없으면 빈 배열이다.
- 새 함수 `getMailAttachments(config, uid, mailbox = "INBOX")` 를 export 한다. `getMail` 과 같은 방식(`createImapClient`, `connectImapClient`, `getMailboxLock`, `fetchOne` 에 `source: true`, `finally` 에서 lock 해제와 `closeImapClient`)으로 원문을 받아 파싱하고 아래를 돌려준다.

  ```ts
  Promise<{ subject: string; attachments: Array<MailAttachmentInfo & { content: Buffer }> }>
  ```

  메일이 없으면 `getMail` 과 같은 메시지(`메일을 찾을 수 없습니다: UID ${uid}`)와 종료 코드 1 의 `DoorayCliError` 를 던진다. `subject` 는 envelope 의 제목이고 없으면 `(제목 없음)` 이다.
- 두 함수가 `parsed.attachments` 를 같은 방식으로 `MailAttachmentInfo` 로 바꾸도록 비공개 헬퍼 하나로 묶는다. 이름은 이 헬퍼가 `mail-attachment-name.ts` 의 `assignAttachmentFileNames` 로 정한다.

### 3. 테스트

- `src/utils/mail-attachment-name.test.ts` 신규: 정상(이름 그대로), 이름 없음(`attachment-<index>`), 경로가 든 이름(`../a/b.txt` → `b.txt`), 같은 이름 둘(`a.crt`, `a-2.crt`), 확장자 없는 이름과 `.env` 의 중복, 255바이트 초과(`attachment-<index>`)를 확인한다.
- `src/api/imapClient.test.ts` 에 추가: 첨부가 둘인 원문에서 `getMail` 의 `attachments` 가 순번 1, 2 와 이름과 크기와 `inline` 값을 돌려주고, 첨부가 없는 원문은 빈 배열을 돌려준다. `getMailAttachments` 가 `content` Buffer 를 돌려주고, 없는 UID 에서 `DoorayCliError` 를 던진다. 같은 이름 둘이 `a.crt`, `a-2.crt` 로 나온다.
- 기존 `getMail` 테스트는 그대로 통과해야 한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm vitest run src/utils/mail-attachment-name.test.ts src/api/imapClient.test.ts
pnpm test
pnpm run build
node scripts/check-pii.mjs
```

기대값: `tsc` 오류 0건(시작 시점 0건), 위 두 테스트 파일 전부 통과, 전체 테스트 통과, 빌드 성공, PII 검사 통과.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/utils/mail-attachment-name.ts` | 신규 |
| `src/utils/mail-attachment-name.test.ts` | 신규 |
| `src/api/imapClient.ts` | 수정 |
| `src/api/imapClient.test.ts` | 수정 |
