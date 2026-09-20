# Phase 01. `download-all` 이 본문에 삽입된 파일도 받게 한다

**Execution profile**: standard

## 목표

`post file download-all` 이 첨부 목록과 본문의 `/files/<id>` 참조를 합쳐 받게 한다.
`--no-inline` 으로 본문 쪽을 제외할 수 있게 한다.

**범위 외**: 알 수 없는 옵션 안내는 phase 02 다. 출력 불일치 둘은 phase 03 이다. 문서는 phase 04 다.
`wiki page file download-all` 은 이 phase 가 다루지 않는다.
위키 본문의 참조 형태가 업무와 같은지 확인되지 않았고, 이슈가 보고한 것은 업무 쪽이다.

## 컨텍스트

**근거 문서**: `docs/adr/057-download-all-includes-inline-files.md` 와
`docs/adr/031-file-json-output-schema.md`.

지금 `src/commands/post/file/download-all.ts` 는 `client.getPostFiles(projectId, postId)` 결과만 받는다.
그 결과가 비면 `첨부파일 없음` 으로 끝난다.

본문에 이미지를 붙여 넣은 업무는 첨부 목록이 비어 있어도 본문에 참조가 있다.

```markdown
![Inline-image-2026-09-09 11.46.04.968.png](/files/<fileId>)
```

같은 파일을 `post file download --file-id <id>` 로는 받을 수 있다.
받는 경로 자체는 `client.downloadPostFile(projectId, postId, fileId)` 로 같다.

`--json` 출력 스키마는 ADR-031 이 정한 `{ count, succeeded: [{path, fileName}], failed: [{fileId, error}] }` 다.
`src/formatters/file-output.ts` 의 `emitDownloadAllResult` 가 그 출력을 소유한다.

## 의도 메모

- 본문 참조를 뽑는 것을 유틸리티로 뺀다. 순수 함수라 단위 테스트가 쉽고,
  `post get` 이나 다른 명령이 나중에 같은 것을 필요로 할 때 다시 만들지 않는다.
- 첨부 목록과 본문 참조에 같은 id 가 있으면 한 번만 받는다.
  본문에 삽입한 이미지가 첨부 목록에도 잡히는 업무가 있을 수 있다.
- 파일 이름은 본문의 대괄호 안 문자열을 쓰지 않는다.
  `downloadPostFile` 이 응답 헤더에서 이름을 얻고 있고, 그쪽이 서버가 아는 이름이다.
  본문의 이름은 사용자가 고쳐 쓸 수 있어 믿을 수 없다.
- `--no-inline` 은 commander 의 `--no-` 접두사 규약을 그대로 쓴다.
  `opts.inline` 이 기본 참이고 옵션을 주면 거짓이 된다.
  같은 저장소의 `post edit --no-confirm` 이 선례다.

## 작업 항목

### 1. `src/utils/inline-file-refs.ts` 를 새로 만든다

```ts
/** 본문에서 `/files/<id>` 형태로 참조된 파일 id 를 뽑는다. 순서를 유지하고 중복을 없앤다. */
export function extractInlineFileIds(body: string): string[];
```

- 정규식은 `/files/` 뒤의 연속된 숫자를 찾는다. Dooray 파일 id 는 숫자다
- 같은 id 가 여러 번 나오면 처음 것만 남긴다
- 본문이 빈 문자열이거나 참조가 없으면 빈 배열을 돌려준다
- 마크다운과 HTML 을 구별하지 않는다. 두 형식 모두 `/files/<id>` 문자열을 담는다

**코드 블록 안의 문자열도 대상이 된다.** 구별하지 않는 이유는 ADR-057 의 「결과」가 적는다.
받아서 손해가 나지 않는 쪽이고, 구별하려면 본문 형식별 파서가 필요하다.

### 2. `src/utils/inline-file-refs.test.ts` 를 만든다

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 이미지 참조 | `![a.png](/files/123)` | `["123"]` |
| 일반 파일 참조 | `[a.pdf](/files/123)` | `["123"]` |
| 둘 이상 | 서로 다른 id 두 개 | 본문에 나온 순서대로 둘 |
| 중복 | 같은 id 가 두 번 | 하나만 |
| 참조 없음 | 참조가 없는 본문 | 빈 배열 |
| 빈 본문 | 빈 문자열 | 빈 배열 |
| HTML 앵커 | `<img src="/files/123">` 형태 | `["123"]` |
| 숫자가 아닌 것 | `/files/abc` | 빈 배열 |

마지막은 정규식이 숫자만 받는지 확인하는 것이다.
넓게 잡으면 본문의 다른 경로 문자열까지 파일 id 로 읽는다.

### 3. `src/commands/post/file/download-all.ts` 를 고친다

옵션을 더한다.

```ts
.option("--no-inline", "본문에 삽입된 파일을 제외하고 첨부 목록만 받는다")
```

동작 순서를 이렇게 바꾼다.

1. 첨부 목록을 받는다 (`getPostFiles`)
2. `opts.inline` 이 참이면 업무 상세를 받아 (`getPost`) 본문에서 id 를 뽑는다
3. 첨부 목록의 id 와 뽑은 id 를 합치고 중복을 없앤다. 첨부 목록이 앞이다
4. 합친 목록이 비면 안내를 내고 끝낸다
5. 비지 않으면 지금과 같은 반복으로 각각 받는다

2번의 `getPost` 는 `opts.inline` 이 참일 때만 부른다. `--no-inline` 을 준 호출에 왕복을 더하지 않는다.

3번에서 본문에서만 온 id 는 이름을 모른다. 실패 기록과 진행 출력에 쓸 이름이 없다.
다운로드가 성공하면 응답 헤더의 이름을 쓰고, 실패하면 id 를 이름 자리에 쓴다.
지금 코드의 `process.stderr.write(\`✗ ${file.name} (${file.id}): ...\`)` 가 `file.name` 을 쓰고 있으므로
이름이 없는 항목에 맞게 고친다.

4번의 안내 문구는 바꾸지 않는다.
받을 것이 하나도 없으면 지금 문구 `첨부파일이 없습니다` 를 그대로 낸다.
`--no-inline` 을 준 호출에서도 같은 문구를 쓴다.

제외한 본문 참조의 수는 적지 않는다.
그 수를 세려면 제외하기로 한 본문을 다시 받아야 하고, `--no-inline` 이 아끼려던 왕복이 되살아난다.
이 결정은 ADR-057 이 소유한다.

5번의 진행 출력은 합친 목록을 기준으로 센다.
`stopSpinner(true, \`${n}개 파일 다운로드 시작\`)` 의 `n` 과
`emitDownloadAllResult` 에 넘기는 `count` 가 모두 합친 목록의 길이여야 한다.
첨부 개수만 세면 본문에서 온 파일이 진행 출력에서 빠진다.

`--json` 출력 스키마는 바꾸지 않는다. ADR-031 이 정한 세 키를 그대로 쓴다.

### 4. `src/commands/post/file/download-all.test.ts` 에 확인 여섯을 더한다

이 파일이 없으면 만든다. 같은 디렉터리의 다른 테스트 파일의 mock 방식을 따른다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 첨부 0건, 본문 2건 | 첨부 목록이 비고 본문에 참조 둘 | `downloadPostFile` 이 두 번 불리고 `count` 가 2 다 |
| 겹치는 id | 첨부 1건, 본문에 같은 id | `downloadPostFile` 이 한 번만 불린다 |
| `--no-inline` | 첨부 0건, 본문에 참조 둘 | `getPost` 가 불리지 않고 `첨부파일이 없습니다` 가 나온다 |
| 기본 호출의 상세 조회 | 첨부 1건, 본문 참조 없음 | `getPost` 가 한 번 불리고 `count` 가 1 이다 |
| 본문 항목의 실패 | 본문 참조 하나의 다운로드가 실패 | `failed` 에 그 id 가 담기고 `process.exitCode` 가 1 이다 |
| 진행 출력의 개수 | 첨부 1건, 본문 1건 | 시작 문구의 개수가 2 다 |

세 번째가 `--no-inline` 의 요점이다. 조회 횟수를 확인하지 않으면 왕복을 아꼈는지 알 수 없다.
마지막은 진행 출력이 합친 목록을 세는지 확인하는 것이다. `count` 만 보면 시작 문구가 첨부 개수에 머물러도 통과한다.

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
pnpm vitest run src/utils/inline-file-refs.test.ts src/commands/post/file/download-all.test.ts
```

종료 코드 0 이어야 한다.

옵션이 등록됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post file download-all --help
```

출력에 `--no-inline` 이 있어야 한다.

변경이 들어갔는지 본다.

```bash
# cwd: <repo root>
ls src/utils/inline-file-refs.ts src/utils/inline-file-refs.test.ts
grep -c "extractInlineFileIds" src/commands/post/file/download-all.ts   # >= 1
grep -c "opts.inline" src/commands/post/file/download-all.ts            # >= 1
```

실제 계정으로 확인한다. 본문에 이미지가 있고 첨부가 없는 업무를 사용자에게 받는다.
받는 위치는 저장소 밖의 임시 디렉터리로 둔다. 저장소 안에 받으면 추적되지 않는 파일이 남는다.

**대상 업무를 받지 못하면 이 확인을 건너뛴다.** 작업 항목 4의 단위 테스트가 같은 경로를 mock 으로 판정한다.
건너뛰었으면 이 phase 의 보고에 「실계정 확인은 대상 업무를 받지 못해 하지 않았다」를 적는다.
적지 않으면 확인한 것으로 읽힌다.

```bash
# cwd: <repo root>
OUT=$(mktemp -d)
node dist/index.js post file download-all <프로젝트> <업무번호> -o "$OUT" ; echo "종료코드=$?"
ls "$OUT"
node dist/index.js post file download-all <프로젝트> <업무번호> -o "$OUT" --no-inline ; echo "종료코드=$?"
rm -rf "$OUT"
```

첫 호출은 `종료코드=0` 이고 `ls` 출력에 이미지 파일이 나와야 한다.
두 번째 호출은 `종료코드=0` 이고 `첨부파일이 없습니다` 가 나와야 한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/inline-file-refs.ts` | 신규 — 본문에서 파일 id 추출 |
| `src/utils/inline-file-refs.test.ts` | 신규 |
| `src/commands/post/file/download-all.ts` | 수정 — 본문 참조 합치기와 `--no-inline` |
| `src/commands/post/file/download-all.test.ts` | 신규 또는 수정 — 확인 5건 |
