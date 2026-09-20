# Phase 02. 문서에 남은 이분 탐색 서술을 정리한다

**Execution profile**: fast

## 목표

phase 01 이 바꾼 탐색 방식을 남은 문서와 코드 주석에 반영한다.

**범위 외**: ADR 은 `docs/adr/040-mail-url-to-uid-lookup.md` 에 보강 절로 이미 들어갔다.
새 ADR 을 만들지 않는다. 그 ADR 의 본문 서술은 당시의 판단이므로 고쳐 쓰지 않는다.
`docs/data-schema.md` 와 `docs/prd.md` 는 손대지 않는다. 저장 모델도 제품 범위도 바뀌지 않았다.

## 컨텍스트

**근거 문서**: `docs/adr/040-mail-url-to-uid-lookup.md` 의 「보강 (Issue #164, 2026-09)」 절.

ADR 은 phase 01 시작 전에 이미 갱신됐다.
남은 것은 그 ADR 밖에서 이분 탐색을 언급하는 자리를 찾아 고치는 일이다.

`.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」에서
「새 API 호출 패턴」 행이 이 변경에 가장 가깝다.

**공개 문서에는 내부 참조 번호를 넣지 않는다.** `README.md` 와 `skills/dooray-cli/SKILL.md` 가 그 대상이다.

## 의도 메모

- 사용자가 읽는 문서에는 탐색 방식을 적지 않는다. 그것은 구현이고, 사용자에게 달라지는 것은 속도뿐이다.
  README 에 탐색 방식을 적은 곳이 있으면 지운다.
- 코드 주석이 가장 어긋나기 쉽다. `이분 탐색` 이라고 적힌 주석이 남으면 다음 사람이 코드와 주석 중 무엇을 믿을지 판단해야 한다.

## 작업 항목

### 1. 이분 탐색을 언급한 자리를 모두 찾는다

```bash
# cwd: <repo root>
grep -rn "이분 탐색\|binary search" src/ docs/ README.md skills/ CLAUDE.md
```

그 출력이 고칠 자리 목록이다.
`docs/adr/040-mail-url-to-uid-lookup.md` 의 본문에 남은 것은 **고치지 않는다.**
그 문서는 당시의 판단을 담고, 보강 절이 무엇이 바뀌었는지 이미 적는다.

### 2. `src/api/imapClient.ts` 의 주석을 고친다

phase 01 이 코드를 바꿀 때 함께 고쳤어야 하는 자리다. 남아 있으면 지금 고친다.
`MAIL_ID_SEARCH_TIME_MARGIN_MS` 위의 주석이 여기 해당한다.

### 3. `docs/code-architecture.md` 를 고친다

`src/api/imapClient.ts` 의 책임 서술에 탐색 방식이 적혀 있으면 고친다.
없으면 손대지 않는다.

### 4. `README.md` 와 `skills/dooray-cli/SKILL.md` 를 확인한다

`mail get` 과 `mail reply` 의 설명에 탐색 방식이나 조회 횟수가 적혀 있으면 지운다.
사용자가 그 값으로 할 일이 없다.

메일 웹 주소로 조회할 때 시간이 걸린다고 적은 곳이 있으면 그 문장을 지운다.
왕복이 14회에서 2회로 줄었으므로 사실과 맞지 않게 된다.

### 5. `docs/flow.md` 를 확인한다

메일 조회 흐름이 그려져 있으면 탐색 단계를 고친다.
이분 탐색 반복 대신 검색 한 번과 배치 조회 한 번이 된다.
그 흐름이 없으면 손대지 않고, 없다는 것을 이 phase 의 보고에 적는다.

```bash
# cwd: <repo root>
grep -n "mail\|UID" docs/flow.md
```

### 6. `index.json` 을 완료로 표시한다

이 plan 의 마지막 phase 다.
`tasks/plan071-perf-mail-id-lookup/index.json` 의 `status` 를 `completed` 로 바꾸고,
`current_phase` 를 2 로 두고, `phases` 배열의 각 항목에 `"status": "completed"` 를 넣는다.

## 검증

ADR 밖에 이분 탐색 서술이 남지 않았는지 본다.

```bash
# cwd: <repo root>
grep -rn "이분 탐색" src/ docs/ README.md skills/ CLAUDE.md | grep -vc "docs/adr/040"   # = 0
```

0 이어야 한다.

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
bash ~/personal/fos-skills/korean-check/scripts/check.sh README.md docs/code-architecture.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다.

plan 의 제출 조건을 본다.

```bash
# cwd: <repo root>
python3 ~/.claude/skills/planning/scripts/verify_task.py plan071-perf-mail-id-lookup
```

종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
```

둘 다 종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/imapClient.ts` | 수정 — 주석이 남아 있을 때만 |
| `docs/code-architecture.md` | 수정 — 해당 서술이 있을 때만 |
| `README.md` | 수정 — 해당 서술이 있을 때만 |
| `skills/dooray-cli/SKILL.md` | 수정 — 해당 서술이 있을 때만 |
| `docs/flow.md` | 수정 — 해당 흐름이 있을 때만 |
| `tasks/plan071-perf-mail-id-lookup/index.json` | 수정 — `completed` 마킹 |
