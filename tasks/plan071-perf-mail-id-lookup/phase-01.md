# Phase 01. UID 탐색을 서버측 일자 필터로 바꾼다

**Execution profile**: standard

## 목표

`resolveUidByMailId` 가 사서함 전체 UID 를 받아 이분 탐색하던 것을,
`SEARCH SINCE`/`BEFORE` 로 후보를 좁힌 뒤 배치로 조회하는 방식으로 바꾼다.

**범위 외**: 문서 갱신은 phase 02 다.
`mail list` 와 `mail get` 의 UID 직접 입력 경로는 이 탐색을 타지 않으므로 대상이 아니다.
후보 판정(`isCandidateMatch`)과 모호한 경우의 처리 방식은 바꾸지 않는다.

## 컨텍스트

**근거 문서**: `docs/adr/040-mail-url-to-uid-lookup.md` 의 「보강 (Issue #164, 2026-09)」 절.
그 절이 측정값과 바꿀 방식, 범위의 실제 동작, 후보 수 상한의 근거를 이미 적고 있다.

지금 `src/api/imapClient.ts` 의 `resolveUidByMailId` 는 이렇게 동작한다.

1. `decodeDoorayIdTimeMs(mailId)` 로 찾는 시각 `wantMs` 를 얻는다
2. `client.search({ all: true }, { uid: true })` 로 사서함 전체 UID 를 받는다
3. 오름차순 정렬 후 이분 탐색한다. 중간점마다 `fetchOne` 으로 `internalDate` 를 받는다
4. 찾은 위치의 앞뒤 `MAIL_ID_CANDIDATE_NEIGHBORS`(8)통씩을 `fetchMailIdCandidates` 로 받는다
5. `isCandidateMatch` 로 걸러 한 건이면 그 UID 를, 0건이면 못 찾음, 여러 건이면 모호함으로 끝낸다

**측정값**이 ADR-040 에 있다. INBOX 4101통에서 왕복 14회에 1784ms 부터 2659ms 였고,
일자 필터는 왕복 2회에 135ms 부터 252ms, 후보 8통부터 14통이었다.

관련 상수는 같은 파일 위쪽에 있다.

| 상수 | 값 | 뜻 |
| --- | --- | --- |
| `MAIL_ID_SEARCH_TIME_MARGIN_MS` | 2000 | 이분 탐색 비교문이 쓰는 여유. 이 phase 가 그 비교문을 지우면 참조가 없어진다 |
| `MAIL_ID_CANDIDATE_NEIGHBORS` | 8 | 이분 탐색 위치의 앞뒤로 함께 받는 통수 |

## 의도 메모

- `SEARCH SINCE` 와 `BEFORE` 는 **일자 단위**다. 그래서 질의에 앞뒤 하루씩을 준다.
  그보다 좁히려 해도 서버가 무시한다.
- **질의에 준 값과 실제로 받는 범위가 다르다.** 둘을 구분해서 읽는다.
  - `node_modules/imapflow/lib/search-compiler.js` 의 `processDateField` 가
    `BEFORE` 에 넘긴 Date 의 UTC 시각이 `00:00:00.000Z` 가 아니면 하루를 더한다.
    앞뒤 하루로 계산한 값은 거의 항상 정각이 아니므로 상한이 하루 더 밀린다
  - 같은 라이브러리의 `formatDate` 가 `toISOString()` 을 써 일자를 UTC 로 만든다.
    서버의 시간대가 아니다
  - 그래서 질의는 `SINCE (대상일-1) BEFORE (대상일+2)` 가 되고
    받는 것은 `대상일-1`, `대상일`, `대상일+1` 의 UTC 사흘치다
  - 범위가 부족하지는 않다. 서버의 internal date 시간대가 어긋나도 이 폭이 흡수한다.
    다만 후보 수를 가늠할 때 하루치가 아니라 사흘치로 잡는다.
    다음 사람이 상한을 이틀로 줄이려 할 때 이 메모가 근거가 된다
- 후보 판정(`isCandidateMatch`)과 모호함 처리(`buildAmbiguousError`)는 그대로 쓴다.
  바꾸는 것은 후보를 모으는 방법뿐이다.
- 「조회 범위 끝이 일치하면 멈춘다」는 기존 보호는 **없어진다.**
  그 보호는 앞뒤 8통이라는 창 밖에 같은 시각의 메일이 있을 수 있어 둔 것이다.
  일자 필터는 사흘치를 통째로 받으므로 그 창 경계가 없다. 자세한 이유는 아래 작업 항목 2가 적는다.
- `MAIL_ID_CANDIDATE_NEIGHBORS` 와 `MAIL_ID_SEARCH_TIME_MARGIN_MS` 는 둘 다 쓰이지 않게 된다.
  상수를 남기면 다음 사람이 어디에 쓰이는지 찾게 된다.
- **후보가 상한을 넘으면 이분 탐색으로 되돌리지 않는다.** UID 를 고르지 않고 중단한다.
  ADR-040 의 보강 절이 그렇게 정했다. 되돌릴 경로를 남기지 않으므로 이분 탐색 코드는 지운다.

## 작업 항목

### 1. 탐색 상수를 정리한다

`MAIL_ID_CANDIDATE_NEIGHBORS` 와 `MAIL_ID_SEARCH_TIME_MARGIN_MS` 를 지우고 상수 셋을 더한다.
둘은 이분 탐색 비교문과 이웃 창 계산에서만 쓰이고, 작업 항목 2가 그 두 자리를 지운다.

```ts
// SEARCH SINCE/BEFORE 는 일자 단위라 질의에 앞뒤 하루씩을 준다 (ADR-040 의 보강 절).
// imapflow 가 BEFORE 를 하루 밀어 실제로 받는 것은 UTC 사흘치다.
const MAIL_ID_SEARCH_DAY_MARGIN_MS = 24 * 60 * 60 * 1000;
// 후보 UID 를 fetch 에 넘길 때 한 번에 묶는 개수. UID 문자열이 길어져 서버가 거절하는 것을 막는다.
const MAIL_ID_FETCH_BATCH = 500;
// 후보가 이보다 많으면 UID 를 고르지 않고 중단한다. 왕복이 1 + 2000/500 = 5 회를 넘지 않는다.
const MAIL_ID_CANDIDATE_LIMIT = 2000;
```

두 이름의 뜻이 다르다. `MAIL_ID_FETCH_BATCH` 는 **한 번의 `fetch` 에 넣는 UID 개수**이고,
`MAIL_ID_CANDIDATE_LIMIT` 는 **그 위에서 조회 자체를 포기하는 후보 수**다.
후보가 상한 이하이면 배치 크기로 잘라 전부 조회하고, 상한을 넘으면 한 번도 조회하지 않는다.

상한값 2000 의 근거를 주석이나 커밋 메시지에 남긴다.
ADR-040 의 측정에서 후보가 8통부터 14통이었으므로 2000 은 그보다 충분히 크다.
그리고 상한에서의 왕복 5회가 이분 탐색의 14회보다 적다.

```bash
# cwd: <repo root>
grep -n "MAIL_ID_SEARCH_TIME_MARGIN_MS\|MAIL_ID_CANDIDATE_NEIGHBORS" src/api/imapClient.ts
```

### 2. `resolveUidByMailId` 의 탐색 부분을 바꾼다

`getMailboxLock` 안쪽의 2번부터 4번 단계를 아래로 바꾼다.

```ts
const uids = await client.search(
  {
    since: new Date(wantMs - MAIL_ID_SEARCH_DAY_MARGIN_MS),
    before: new Date(wantMs + MAIL_ID_SEARCH_DAY_MARGIN_MS),
  },
  { uid: true },
);
if (!Array.isArray(uids) || uids.length === 0) {
  throw buildNoMatchError(mailId, mailbox);
}
if (uids.length > MAIL_ID_CANDIDATE_LIMIT) {
  throw buildTooManyCandidatesError(mailId, mailbox, uids.length);
}

const sortedUids = [...uids].sort((a: number, b: number) => a - b);
const fetched: MailIdCandidate[] = [];
for (let offset = 0; offset < sortedUids.length; offset += MAIL_ID_FETCH_BATCH) {
  fetched.push(
    ...(await fetchMailIdCandidates(
      client,
      sortedUids.slice(offset, offset + MAIL_ID_FETCH_BATCH),
      mailbox,
    )),
  );
}
const candidates = fetched.filter((candidate) => isCandidateMatch(candidate, wantSec));
```

그 아래의 판정은 그대로 둔다.

- `candidates.length === 1` 이면 그 UID 를 돌려준다
- `0` 이면 `buildNoMatchError`
- 그보다 많으면 `buildAmbiguousError`

**「조회 범위 끝이 일치하면 멈춘다」 분기를 지운다.**
그 분기는 `end < sortedUids.length && candidates[0].uid === sortedUids[end - 1]` 를 확인한다.
앞뒤 8통이라는 좁은 창 밖에 같은 초의 메일이 있을 수 있어 둔 보호다.
일자 필터는 찾는 시각을 포함한 UTC 사흘치를 통째로 받으므로, 같은 초의 메일은 모두 이 결과 안에 있다.
그 분기가 참조하는 `start` 와 `end` 변수도 함께 사라진다.

`fetchMailIdCandidates` 는 그대로 쓴다. 이 함수가 `pendingUids` 로 응답 누락을 이미 확인한다.

### 3. 후보가 많을 때 중단하는 오류를 더한다

`buildNoMatchError` 옆에 오류 생성 함수를 더한다.
안내는 기존 `mailboxLookupHint` 를 그대로 쓴다.
INBOX 는 `mail list --search "<제목 일부>"` 를, 다른 사서함은 웹 메일 폴더를 안내한다.

```ts
function buildTooManyCandidatesError(
  mailId: string,
  mailbox: string,
  candidateCount: number,
): DoorayCliError {
  return new DoorayCliError(
    `사서함 ${sanitizeCandidateText(mailbox)}의 mail id ${mailId} 조회 범위에 메일이 ` +
      `${candidateCount}통이라 UID 를 결정하지 않았습니다(상한 ${MAIL_ID_CANDIDATE_LIMIT}통).\n` +
      mailboxLookupHint(mailbox),
    EXIT_API_ERROR,
  );
}
```

**IMAP 범위 표기(`start:end`)로 줄이지 않는다.** 그 표기는 연속 구간을 뜻하는데
`search` 결과가 연속이라는 보장이 없다.

### 4. `src/api/imapClient.test.ts` 의 이분 탐색 전제를 제거하고 확인을 다시 짠다

**이 파일은 이미 있다.** 466줄이고 `resolveUidByMailId` 확인을 여럿 담는다.
새로 만들지 말고 아래 순서로 고친다.
mock 선례는 이 파일 안의 `createFakeClient` 자신이다. 다른 파일을 찾지 않는다.

#### 4-1. 가짜 `search` 가 `since` 와 `before` 를 읽도록 고친다

지금의 가짜 `search` 는 질의를 무시하고 항상 전체 UID 를 돌려준다.
그대로 두면 일자 필터가 후보를 실제로 좁히는지 확인되지 않는다.
`imapflow` 의 날짜 해석을 그대로 따라 걸러낸다.

```ts
function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// imapflow 의 processDateField 가 BEFORE 를 다루는 방식과 같다.
function beforeBoundMs(date: Date): number {
  const bumped = date.toISOString().substring(11) === "00:00:00.000Z"
    ? date
    : new Date(date.getTime() + 24 * 3600 * 1000);
  return utcDayStart(bumped);
}
```

`since` 와 `before` 가 없는 질의는 종전처럼 전체 UID 를 돌려준다.

#### 4-2. 이분 탐색을 전제한 확인을 고치거나 지운다

| 확인 | 깨지는 이유 | 할 것 |
| --- | --- | --- |
| `정확히 한 후보면 UID 를 반환한다` | `search` 를 `{ all: true }` 로, `fetchOne` 호출을 단언한다 | 단언을 `since`/`before` 와 `fetchOne` 미호출로 고친다 |
| `4000통 입력에서 fetchOne 조회는 로그 수준에 머문다` | `fetch` 첫 호출의 UID 개수를 17 이하로 단언한다 | 이름과 단언을 왕복 2회 기준으로 다시 쓴다 |
| `초 경계를 넘은 도착 시각과 문자열 날짜를 처리한다` | `fetchOne` 호출 인자를 단언한다 | 그 단언을 지우고 `fetch` 단언만 남긴다 |
| `조회 범위 끝의 단일 후보 뒤에 같은 초의 메일이 더 있으면 선택하지 않는다` | 이 phase 가 지우는 분기를 검사한다 | 지우고, 같은 상황이 모호함 오류가 되는 확인으로 다시 쓴다 |
| `sent의 %s 오류도 웹 폴더 확인을 안내한다` 의 두 갈래 | `fetchOne.mockResolvedValue(false)` 와 `조회 범위 끝` 갈래가 모두 사라진 경로다 | 불완전한 날짜를 `fetch` 쪽 mock 으로 만들고 `조회 범위 끝` 갈래를 지운다 |
| `탐색 응답 %j로 도착 시각을 알 수 없으면 중단한다` | `fetchOne` 응답으로 오류를 만들고 `fetch` 미호출을 단언한다 | `fetch` 가 그 응답을 흘리도록 바꾸고 `fetch` 미호출 단언을 지운다 |
| `검색 UID가 역순이고 사이 번호가 비어도 올바른 UID를 찾는다` | 이분 탐색 전제로 짜인 데이터다 | 세 통이 모두 같은 일자 안이므로 그대로 통과한다. 데이터만 확인하고 남긴다 |

#### 4-3. 확인 다섯을 더한다

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 질의 형태 | 정상 조회 | `search` 가 `since` 로 `wantMs - 하루`, `before` 로 `wantMs + 하루` 인 Date 를 받는다 |
| 왕복 횟수 | 후보 10통 | `search` 1회와 `fetch` 1회만 나가고 `fetchOne` 이 불리지 않는다 |
| 범위 밖 제외 | 사흘 범위 밖의 메일 | `search` 결과에 들어오지 않아 후보에서 빠진다 |
| 배치 분할 | 후보 1200통 | `fetch` 가 3회 불리고 각 호출의 UID 개수가 500 이하다 |
| 후보 상한 | `search` 가 2001개를 돌려줌 | `fetch` 가 불리지 않고 대체 조회 안내가 담긴 오류로 멈춘다 |

두 번째가 이 phase 의 목적이다. `fetchOne` 이 불리지 않는 것을 확인하지 않으면
이분 탐색이 남아 있어도 통과한다.

### 5. 단위 테스트와 정적 검사를 돌린다

아래 검증 절의 명령을 순서대로 돌리고 각 명령의 종료 코드를 그 자리에서 읽는다.
출력을 다른 명령에 파이프로 잇지 않는다. 파이프 뒤의 `$?` 는 마지막 명령의 것이다.

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
pnpm vitest run src/api/imapClient.test.ts src/resolvers/mail-input.test.ts
```

종료 코드 0 이어야 한다.

이분 탐색이 사라졌는지 본다.

```bash
# cwd: <repo root>
grep -c "fetchOne" src/api/imapClient.ts                    # = 1
grep -c "MAIL_ID_CANDIDATE_NEIGHBORS" src/api/imapClient.ts # = 0
grep -c "MAIL_ID_SEARCH_TIME_MARGIN_MS" src/api/imapClient.ts # = 0
grep -c "since" src/api/imapClient.ts                       # >= 1
```

`fetchOne` 은 `getMail` 이 쓰므로 1 이다. 0 이 아니다.
`resolveUidByMailId` 함수 안에 남지 않았는지는 그 함수의 범위를 읽어 본다.

**왕복 횟수**

왕복은 단위 테스트가 센다. 실제 사서함이 없어도 셀 수 있다.
`client.search` 와 `client.fetch` 와 `client.fetchOne` 의 호출 수를 더한 값이 왕복 수다.

```bash
# cwd: <repo root>
pnpm vitest run src/api/imapClient.test.ts -t "왕복"
```

종료 코드 0 이어야 한다.
합격 기준은 **후보 10통에서 `search` 1회와 `fetch` 1회, `fetchOne` 0회로 왕복 2회**다.
`4000통` 확인도 같은 기준을 쓴다. 사서함 크기가 왕복 수를 늘리지 않는 것이 이 phase 의 목적이다.

**전체 처리 시간**

이 측정은 실제 IMAP 서버가 필요하다. 아래 둘이 모두 갖춰졌을 때만 돌린다.

- `~/.dooray/config.json` 에 `imapUsername` 과 `imapPassword` 가 있다
- 대상 메일의 웹 주소를 사용자에게서 받았다

```bash
# cwd: <repo root>
node -e "const c=require('os').homedir()+'/.dooray/config.json';const j=require(c);process.exit(j.imapUsername&&j.imapPassword?0:1)"
```

종료 코드 0 이면 설정이 있다. 1 이면 **측정을 건너뛰고 건너뛴 사실을 이 phase 의 보고에 적는다.**
위 왕복 횟수 확인이 통과했으면 phase 는 통과한 것으로 본다.
설정이 없거나 주소를 받지 못한 것은 이 변경의 결함이 아니다.

설정이 있으면 아래를 돌린다. 조회만 하므로 되돌릴 것이 없다.

```bash
# cwd: <repo root>
time node dist/index.js mail get "<메일 웹 주소>" > /tmp/plan071-mail-get.txt 2>&1
```

출력을 파일로 받고 `time` 을 단일 명령에 건다.
파이프로 이으면 `time` 이 파이프라인 전체를 재고 뒤 명령이 먼저 끝나면 앞 명령이 신호를 받는다.

전체 처리 시간이 1초 아래여야 한다.
ADR-040 의 보강 절이 일자 필터로 135ms 부터 252ms 를 측정했고 여기에 연결과 로그인이 더해진다.
같은 절의 이분 탐색 측정값 1784ms 부터 2659ms 보다 뚜렷하게 작으면 된다.

**`mail reply` 로 확인하지 않는다.** 발송은 되돌릴 수 없다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/imapClient.ts` | 수정 — 탐색 방식 교체, 상수 정리, 배치 조회, 후보 상한 오류 |
| `src/api/imapClient.test.ts` | 수정 — 기존 확인 7건 손질, 확인 5건 추가 |
