# Phase 02. `mail get` 출력에 첨부 목록 더하기

**Execution profile**: fast

## 목표

`dooray mail get` 이 첨부가 있는 메일에서 첨부 목록을 평문 출력에 더하고, `--json` 에 `attachments` 배열을 둔다. 사용자가 `mail attachment` 의 `--id` 순번을 여기서 읽는다.

**범위 외**: `mail attachment` 명령(phase 03), 이미 끝난 `imapClient` 변경(phase 01).

## 컨텍스트

- phase 01 이 `src/api/imapClient.ts` 의 `getMail` 반환에 `attachments: MailAttachmentInfo[]` 를 더했다. 항목은 `index`(1부터), `fileName`, `size`, `contentType`, `inline` 이다.
- `src/commands/mail/get.ts` 는 `getMail` 결과로 `--json` 객체와 평문 출력을 만든다. 평문은 `제목:`, `보낸사람:`, `받는사람:`, `날짜:`, `읽음:` 줄 다음에 빈 줄과 본문이다.
- 크기 표기는 `src/utils/format-size.ts` 의 `formatSize(bytes)` 를 쓴다.
- `src/commands/mail/get.test.ts` 는 `getMail` 을 `vi.hoisted` 의 mock 으로 바꾸고 `mail` 픽스처를 돌려준다. 첫 테스트가 `--json` 출력을 `toEqual` 로 필드 전체와 비교하므로 새 필드를 더하면 그 단언이 깨진다.

**근거 문서**: `docs/adr/071-mail-attachment-download.md`, `docs/flow.md` 의 「`mail get`」 절

## 의도 메모

- 첨부가 없으면 평문 출력은 지금과 한 글자도 달라지지 않는다. `--json` 만 빈 `attachments` 배열이 늘어난다.
- 옵션을 더하지 않는다. 첨부 목록은 이미 받은 원문에서 나와 추가 호출이 없다 (ADR-071 이 ADR-056 과 갈리는 이유).

## 작업 항목

### 1. `src/commands/mail/get.ts` 변경

- `--json` 객체의 `body` 앞이나 뒤가 아니라 **마지막 필드**로 `attachments: mail.attachments` 를 더한다. 항목 필드 이름은 `index`, `fileName`, `size`, `contentType`, `inline` 이고 `getMail` 이 돌려준 객체를 그대로 쓴다.
- 평문에서 `읽음:` 줄 바로 다음에, `mail.attachments.length > 0` 일 때만 아래를 더한다. 그 뒤의 `\n${mail.body}\n` 구조는 그대로다.

  ```
  첨부: 2개
    1. a.crt (1.2KB)
    2. logo.png (3.0KB) [인라인]
  ```

  굵게 하는 쪽은 `첨부:` 라벨이고 `chalk.bold` 를 다른 라벨과 같게 쓴다. `[인라인]` 은 `inline` 이 true 일 때만 붙인다. 파일 이름은 터미널 제어 문자를 막기 위해 `src/utils/sanitize.ts` 의 `sanitizeForTerminal` 을 거쳐 출력한다 (`imapClient` 의 이름은 이미 제어 문자를 지웠지만 출력 직전 방어를 같은 규약으로 둔다).

### 2. `src/commands/mail/get.test.ts` 변경

- `mail` 픽스처에 `attachments: []` 를 더하고, 첫 테스트의 `toEqual` 기대값 끝에 `attachments: []` 를 더한다.
- 새 테스트 둘: (a) 첨부 둘이 든 픽스처에서 `--json` 의 `attachments` 가 그 두 항목을 그대로 담는다, (b) 같은 픽스처의 평문 출력이 `첨부: 2개` 와 ` 1. ` 줄과 `[인라인]` 표기를 담고, 첨부 없는 픽스처의 평문 출력에는 `첨부:` 가 없다. 평문 검증은 `process.stdout.write` 호출 문자열을 모아 `toContain` / `not.toContain` 으로 한다 (`chalk` 색 코드 때문에 `첨부:` 앞뒤를 통째로 비교하지 않는다).

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm vitest run src/commands/mail/get.test.ts
pnpm test
pnpm run build
node scripts/check-pii.mjs
```

기대값: `tsc` 오류 0건, `get.test.ts` 전부 통과, 전체 테스트 통과, 빌드 성공, PII 검사 통과.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/mail/get.ts` | 수정 |
| `src/commands/mail/get.test.ts` | 수정 |
