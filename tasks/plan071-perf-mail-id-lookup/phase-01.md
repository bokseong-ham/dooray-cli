# Phase 01. UID 탐색을 서버측 일자 필터로 바꾼다

**Execution profile**: standard

## 목표

`resolveUidByMailId` 가 사서함 전체 UID 를 받아 이분 탐색하던 것을,
`SEARCH SINCE`/`BEFORE` 로 후보를 좁힌 뒤 한 번에 조회하는 방식으로 바꾼다.

**범위 외**: 문서 갱신은 phase 02 다.
`mail list` 와 `mail get` 의 UID 직접 입력 경로는 이 탐색을 타지 않으므로 대상이 아니다.
후보 판정과 모호한 경우의 처리 방식은 바꾸지 않는다.

## 컨텍스트

**근거 문서**: `docs/adr/040-mail-url-to-uid-lookup.md` 의 「보강 (Issue #164, 2026-09)」 절.
그 절이 측정값과 바꿀 방식을 이미 적고 있다.

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
| `MAIL_ID_SEARCH_TIME_MARGIN_MS` | 2000 | id 가 담은 시각과 IMAP 도착 시각의 차이를 흡수하는 여유 |
| `MAIL_ID_CANDIDATE_NEIGHBORS` | 8 | 이분 탐색 위치의 앞뒤로 함께 받는 통수 |

## 의도 메모

- `SEARCH SINCE` 와 `BEFORE` 는 **일자 단위**다. 그래서 범위를 앞뒤 하루씩으로 둔다.
  그보다 좁히려 해도 서버가 무시한다.
- 후보 판정(`isCandidateMatch`)과 모호함 처리(`buildAmbiguousError`)는 그대로 쓴다.
  바꾸는 것은 후보를 모으는 방법뿐이다.
- 「조회 범위 끝이 일치하면 멈춘다」는 기존 보호는 **없어진다.**
  그 보호는 앞뒤 8통이라는 창 밖에 같은 시각의 메일이 있을 수 있어 둔 것이다.
  일자 필터는 하루 전체를 받으므로 그 창 경계가 없다. 자세한 이유는 아래 작업 항목 2가 적는다.
- `MAIL_ID_CANDIDATE_NEIGHBORS` 는 쓰이지 않게 된다. 상수를 남기면 다음 사람이 어디에 쓰이는지 찾게 된다.

## 작업 항목

### 1. 탐색 상수를 정리한다

`MAIL_ID_CANDIDATE_NEIGHBORS` 를 지우고 범위 상수를 더한다.

```ts
// SEARCH SINCE/BEFORE 는 일자 단위라 앞뒤 하루씩을 받는다 (ADR-040 의 보강 절).
const MAIL_ID_SEARCH_DAY_MARGIN_MS = 24 * 60 * 60 * 1000;
```

`MAIL_ID_SEARCH_TIME_MARGIN_MS` 는 남긴다. 후보 판정에 쓰이는지 확인하고, 쓰이지 않으면 함께 지운다.

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

const sortedUids = [...uids].sort((a: number, b: number) => a - b);
const candidates = (await fetchMailIdCandidates(client, sortedUids, mailbox))
  .filter((candidate) => isCandidateMatch(candidate, wantSec));
```

그 아래의 판정은 그대로 둔다.

- `candidates.length === 1` 이면 그 UID 를 돌려준다
- `0` 이면 `buildNoMatchError`
- 그보다 많으면 `buildAmbiguousError`

**「조회 범위 끝이 일치하면 멈춘다」 분기를 지운다.**
그 분기는 `end < sortedUids.length && candidates[0].uid === sortedUids[end - 1]` 를 확인한다.
앞뒤 8통이라는 좁은 창 밖에 같은 초의 메일이 있을 수 있어 둔 보호다.
일자 필터는 찾는 시각의 앞뒤 하루를 통째로 받으므로, 같은 초의 메일은 모두 이 결과 안에 있다.
그 분기가 참조하는 `start` 와 `end` 변수도 함께 사라진다.

`fetchMailIdCandidates` 는 그대로 쓴다. 이 함수가 `pendingUids` 로 응답 누락을 이미 확인한다.

### 3. 후보가 많을 때를 대비한다

일자 필터의 후보 수는 그날 도착한 메일 수에 달려 있다.
측정한 사서함에서는 8통부터 14통이었지만, 하루에 수천 통이 오는 사서함에서는 그만큼이 된다.

`fetchMailIdCandidates` 가 UID 를 쉼표로 이어 붙인 문자열을 만든다.
후보가 매우 많으면 그 문자열이 길어져 서버가 거절할 수 있다.

후보 수가 임계값을 넘으면 범위를 순차 조회로 나눈다.

```ts
const MAIL_ID_FETCH_BATCH = 500;
```

`sortedUids` 를 그 크기로 잘라 `fetchMailIdCandidates` 를 여러 번 부르고 결과를 합친다.
합친 뒤 `isCandidateMatch` 로 거른다.

**IMAP 범위 표기(`start:end`)로 줄이지 않는다.** 그 표기는 연속 구간을 뜻하는데
`search` 결과가 연속이라는 보장이 없다.

### 4. `src/api/imapClient.test.ts` 에 확인 넷을 더한다

이 파일이 없으면 만든다. IMAP 연결을 mock 한다.
`src/resolvers/mail-input.test.ts` 가 이 계열을 어떻게 mock 하는지 보고 같은 방식을 쓴다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 질의 형태 | 정상 조회 | `search` 가 `since` 와 `before` 를 받고 두 값의 차이가 이틀이다 |
| 왕복 횟수 | 후보 10통 | `search` 1회와 `fetch` 1회만 나가고 `fetchOne` 이 불리지 않는다 |
| 한 건 일치 | 후보 중 한 건만 시각이 맞음 | 그 UID 를 돌려준다 |
| 여러 건 일치 | 같은 초의 메일 둘 | 모호함 오류로 던지고 후보 둘이 문구에 들어간다 |
| 검색 결과 없음 | `search` 가 빈 배열 | 못 찾음 오류로 던진다 |

두 번째가 이 phase 의 목적이다. `fetchOne` 이 불리지 않는 것을 확인하지 않으면
이분 탐색이 남아 있어도 통과한다.

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
grep -c "fetchOne" src/api/imapClient.ts                    # = 0
grep -c "MAIL_ID_CANDIDATE_NEIGHBORS" src/api/imapClient.ts # = 0
grep -c "since" src/api/imapClient.ts                       # >= 1
```

`fetchOne` 이 다른 용도로도 쓰이고 있으면 0 이 아닐 수 있다.
그 경우 `resolveUidByMailId` 함수 안에만 없으면 된다. 그 함수의 범위를 읽어 확인한다.

실제 사서함으로 측정한다. 메일 웹 주소를 사용자에게 받는다. 조회만 하므로 되돌릴 것이 없다.

```bash
# cwd: <repo root>
time node dist/index.js mail get "<메일 웹 주소>" 2>&1 | head -5
```

전체 처리 시간이 ADR-040 의 보강 절이 적은 값 범위와 비슷해야 한다.
그 절은 일자 필터로 135ms 부터 252ms 를 측정했다. 여기에 연결과 로그인 시간이 더해진다.

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
| `src/api/imapClient.ts` | 수정 — 탐색 방식 교체, 상수 정리, 배치 조회 |
| `src/api/imapClient.test.ts` | 신규 또는 수정 — 확인 5건 |
