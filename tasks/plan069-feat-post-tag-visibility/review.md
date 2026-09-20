# plan069 검토 지적 (판정: REVISE)

이 plan 을 이슈 #174 와 #175 의 태그 부분과 대조한 결과다.
다섯 plan 중 자체 결함이 가장 가볍다. **아래를 반영한 뒤 구현한다.**

## 재해석은 옳다

계획을 만든 쪽은 「`--json` 이 태그를 돌려주지 않는다」는 #174 의 보고가 코드와 맞지 않는다고 보고,
요구를 「태그 이름 해석과 일반 출력의 태그 줄과 목록 필터」로 다시 읽었다.
**그 재해석이 맞다.**

`src/commands/post/get.ts` 가 `client.getPost()` 의 `res.result` 를 그대로 `formatPostDetail` 에 넘기고,
`src/formatters/post.ts` 가 `opts.json` 이면 `printJson(post)` 로 응답 전체를 낸다.
`PostDetail` 에 `tags`, `workflow`, `users` 가 모두 있다.
`git log -- src/formatters/post.ts` 는 최초 릴리스 커밋 하나뿐이라 과거 버전이 달랐을 가능성도 없다.

#175 의 실측(`tags` 는 오지만 `id` 만 담는다)이 맞고, #174 의 「최상위 키가 둘뿐」은 틀렸다.

## Critical

### C1. #175 의 본 요청이 이 plan 밖에서도 아무 데도 없었다

#175 의 「요청」 절은 `post workflow` 와 `post done` 의 설명 보강이고,
태그 관련은 「함께 확인한 것」 곁다리다.
plan067~071 어디에도 그 본 요청이 없었다.

**이미 조치했다.** `tasks/plan072-fix-command-description-wording/` 의 phase-01 이 그것을 맡는다.
이 plan 에서 다시 다루지 않는다.

## Major

### M1. phase-03 의 `verify_task.py` 통과 조건이 그 phase 자신을 거절한다

`phase-03.md:144` 가 종료 코드 0 을 요구하는데 지금 돌리면 1 이다.

```
phase-03.md — 마지막 작업 항목이 테스트가 아니다: ### 6. index.json 을 완료로 표시한다
```

phase-01 과 02 는 마지막 항목에 `.test.ts` 가 있어 통과한다.

**고칠 것**: `index.json` 표시를 `###` 작업 항목에서 빼고 검증 절의 일반 문단으로 내린다.

### M2. phase-03 의 한국어 표기 검사가 기존 위반 때문에 실패한다

`phase-03.md:125` 의 명령을 그대로 돌리면 종료 코드 1 이고 출력은 하나다.

```
docs/prd.md:1  [DASH] 제목의 엠대시: 부제를 떼고 한 문장으로 쓴다
```

이 plan 이 손대는 것은 `docs/prd.md` 의 MVP 범위 한 줄이라 1행 제목과 무관하다.
구현자는 통과시키려고 범위 밖 제목을 고치거나 검사를 무시하게 된다.

**고칠 것**: 「`docs/prd.md:1` 의 엠대시는 이 plan 이 만든 것이 아니다. 제목을 한 문장으로 고쳐 함께 통과시킨다」를
작업 항목으로 명시하거나, 검사 대상을 `git diff` 로 바뀐 파일만으로 좁힌다.

### M3. `docs/code-architecture.md` 가 phase-03 에서 빠졌다

`phase-03.md:22-24` 가 `.claude/planning-overlay.md` 의 「변경 유형별 docs 영향 표」
「신규 ADR 동반 변경」 행을 근거로 드는데, 그 행의 `code-architecture.md` 칸이 비어 있지 않다.
그 문서는 `resolvers/tag.ts` 의 책임을 한 줄로 적는데 이 plan 이 `attachTagNames` 라는 새 책임을 더한다.

**고칠 것**: `resolvers/tag.ts` 주석에 태그 이름 보강을 더하고,
`commands/post/get.ts` 와 `list.ts` 항목에 `--with-tag-names` 와 `--tag` 를 적는 항목을 더한다.
범위 외로 둘 거면 그 판단 근거를 적는다.

### M4. 의도 메모가 정한 분기 둘에 확인이 없다

`phase-01.md:78` 은 이름을 못 찾은 태그를 `<id> (이름 없음)` 으로 내라고 정하고,
`phase-01.md:131-135` 는 `attachTagNames` 가 실패하면 옵션이 없을 때 오류를 삼키고
stderr 경고 뒤 이름 없이 진행하라고 정한다.
그런데 확인 표(`phase-01.md:163-169`)의 다섯 항목에 그 둘이 없다.

오류를 삼키는 경로는 회귀가 나도 종료 코드로 드러나지 않는 유일한 자리다.

**고칠 것**: 확인 표에 둘을 더한다.
「일반 출력, 태그 하나를 캐시에서 못 찾음 → 출력에 `(이름 없음)` 이 있고 종료 코드 0」,
「일반 출력, `ensureTags` 가 던짐 → stderr 에 경고가 있고 종료 코드 0」.

## Minor

- **m1.** `phase-02.md:95` 의 `joinIds` 서술이 틀렸다.
  빈 배열이면 빈 문자열이 아니라 `undefined` 를 돌려주고, 전개도 truthy 검사라 키가 붙지 않는다.
  확인 항목 자체는 유효하다.
- **m2.** `--json` 만 준 호출에서도 태그 목록 조회가 붙는다.
  `phase-01.md:123-129` 의 순서가 그렇다. 결과를 아무 데도 쓰지 않는데
  캐시가 만료된 첫 호출에서는 `fetchAllTags` 의 페이지 순회가 통째로 붙는다.
  「`opts.json` 이고 `--with-tag-names` 가 없으면 `attachTagNames` 를 부르지 않는다」를 2번과 3번 사이에 명시한다.
- **m3.** `--with-tag-names` 를 `--json` 없이 준 경우가 정의되지 않았다.
  `CLAUDE.md` 의 「무시되는 옵션」 규약과 맞추려면 경고를 낼지 정해야 한다.
- **m4.** `phase-03.md:85-93` 의 `docs/flow.md` 지시가 모호하다.
  grep 이 잡는 자리가 흐름도가 아니라 명령 예시 목록이라 「있다」와 「없다」로 갈린다.
  예시 목록에 두 줄을 더하는 것으로 지시를 확정한다.
- **m5.** `phase-03.md:134` 의 `grep -c` 에 파일 셋을 주면 하나만 맞아도 종료 코드 0 이다.
  파일마다 따로 돌린다.
- **m6.** #174 의 보고가 코드와 달랐다는 사실이 어디에도 남지 않는다.
  ADR-056 의 맥락 절은 올바른 사실만 적는다. 다음에 같은 보고가 오면 같은 조사를 반복한다.
  이슈에 회신하는 항목을 두는 것이 좋다.
- **m7.** `post list` 표에 태그 열을 넣지 않는 판단이 ADR 에 없다.
  ADR-056 의 대안 기각은 `--json` 보강만 기각한다. 표의 열은 phase 의 의도 메모에만 있다.
- **m8.** 태그 이름을 못 찾았을 때의 안내가 두 명령에서 비대칭이다.
  `post get` 에는 `dooray cache clear` 안내를 붙이는데,
  `post list --tag` 쪽은 `lookupTagIds` → `matchByName` 이 `helpHint` 없이 던져 안내가 없다.
- **m9.** phase-02 작업 항목 1 이 `tagIds` 다중 값의 해석을 확정하라고 하고
  phase-03 이 그 결과를 README 에 옮기라고 하는데,
  확정하지 못했을 때 phase-03 의 문구가 비는 경우의 지시가 없다.
