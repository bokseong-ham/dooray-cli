# plan070 검토 지적 (판정: REJECT)

이 plan 을 이슈 #171, #170, #175, #173 과 대조한 결과다.
**구현을 시작하기 전에 아래를 plan 에 반영하고, 반영한 것을 커밋으로 남긴다.**

#171 과 #170 과 #173 덧붙임은 근거가 정확하고 실행 가능하다.
문제는 #175 와 아래 Major 다섯이다.

## Critical

### C1. #175 앞부분이 이 plan 어디에도 없었다

`tasks/plan070-fix-cli-usability-and-output/` 전체에 `workflow`, `업무 상태`, `진행 상태`, `done` 이
한 번도 나오지 않는다. `index.json` 의 description 도 세 가지만 적는다.

이슈가 요구한 대상은 그대로 남아 있다.

- `src/commands/post/workflow.ts:12` — `.description("업무 워크플로우 변경")`
- `src/commands/post/done.ts:8` — `.description("업무 완료 처리")`

**이미 조치했다.** `tasks/plan072-fix-command-description-wording/` 의 phase-01 이 그것을 맡는다.
이 plan 에서 다시 다루지 않는다. `index.json` 의 description 에서 #175 를 빼도 된다.

## Major

### M1. phase-01 의 안내 규칙이 같은 절 안에서 자기모순이었다

`phase-01.md:106` 이 「`--no-inline` 때문에 제외한 본문 참조가 있으면 그 수를 함께 적는다」를 적고
`:108-110` 이 출력 예시까지 드는데, `:112-115` 가 「그렇게 하지 않는다」로 되돌린다.
작업 항목 4 의 테스트 표도 `--no-inline` 일 때 `첨부파일이 없습니다` 만 나오기를 기대한다.

ADR-057 은 그 수를 적는다고 정하고 있었다.
**ADR 쪽은 이미 고쳤다.** `docs/adr/057-download-all-includes-inline-files.md` 가
그 결정을 철회하고 종전 문구를 그대로 쓴다고 적는다.

**고칠 것**: `phase-01.md:106` 과 `:108-110` 을 지운다.
`:114-115` 의 「안내는 `--no-inline` 을 쓰는 방법을 적는 데 그친다」도 뜻이 통하지 않으므로
「지금 문구를 그대로 낸다」로 줄인다.

### M2. `--post` 가 인자 이름과 같다는 전제가 사실과 달랐다

실제 인자 이름은 `post-number` 다(`src/commands/post/get.ts:12`).
`phase-02.md:69` 이 정확일치만 한다고 정하므로
`dooray post get <프로젝트> --post 456` 에는 안내가 붙지 않는다.
이슈 #170 이 든 두 옵션 중 하나가 종전 그대로 남는다.

**ADR 쪽은 이미 고쳤다.** `docs/adr/058-unknown-option-usage-hint.md` 가
정확일치에 더해 「인자 이름이 `X-` 로 시작하고 그런 인자가 그 명령에 하나뿐」인 경우를 함께 판정한다고 정한다.

**고칠 것**: `buildUsageHint` 의 판정 규칙을 그 두 가지로 바꾼다.
`phase-02.md:87-95` 의 테스트 표에 `post` 와 `["project", "post-number"]` 행을 더한다.

### M3. phase-02 의 전파 확인 단계가 성립하지 않는다

`phase-02.md:196-202` 가 이렇게 검증한다.

```bash
node dist/index.js wiki page get --project x 2>&1 | grep -c "인자로 전달합니다"   # >= 1
```

`wiki page get` 은 `--project` 를 실제 옵션으로 갖고 있어(`src/commands/wiki/page-get.ts:15`)
`unknown option` 오류 자체가 나지 않는다. 결과는 항상 0 이다.
`:201-202` 의 대비책도 통하지 않는다. 그 명령의 인자 이름이 `arg1`, `arg2` 라서다.

**고칠 것**: 인자 이름이 `project` 인 두 단계 아래 명령으로 바꾼다.
`post file download-all` 이 `[project]` 와 `[post-number]` 를 갖는다.

### M4. phase-04 가 README 에 없는 설명을 고치라고 한다

`README.md` 에 `download-all` 문자열이 0건이다.
`post comment delete` 와 `post file delete` 도 삭제 확인 대상을 나열한 표에만 나오고 설명 절이 없다.
「`post file delete` 의 설명과 같은 형태로 쓴다」가 가리킬 선례가 없다.
그런데 `phase-04.md:137` 의 검증은 결과를 강제한다.

**고칠 것**: README 의 어느 절에 무엇을 더할지 절 제목과 위치를 phase 에 적는다.

### M5. SKILL.md 의 대상 표가 공용이라는 것을 phase-04 가 다루지 않는다

그 표는 `post file` 과 `wiki page file` 공용이고,
표 머리말이 「두 명령군이 같은 스키마를 쓴다」고 적는다.
ADR-031 의 정정이 바로 그 주장을 제한한 것인데 phase 가 머리말을 대상으로 잡지 않았다.
또 `download-all` 행에 `--no-inline` 을 적으면 `wiki page file download-all` 도
그 옵션을 갖는다고 읽히는데, phase-01 은 위키를 범위 밖으로 둔다.

「빠른 참조 표」가 스키마 표인지 명령 목록 표인지도 분명하지 않다. 둘 다 있다.

**고칠 것**: 고칠 줄 번호와 표 이름을 적는다.
머리말을 「출력 처리 방식이 같고 서버가 돌려주는 필드는 다를 수 있다」로 고치는 항목을 더한다.
`--no-inline` 은 post 전용 행에 적는다.

### M6. phase-03 이 이미 있는 공용 출력 함수를 쓰지 않고 분기를 다시 쓴다

`phase-03.md:82-90` 이 손으로 쓴 세 갈래 분기를 지시하는데,
`src/formatters/file-output.ts` 의 `emitDeleteResult` 가 그 일을 하고 키 이름 바꾸기까지 지원한다.

```ts
emitDeleteResult(globalOpts, {
  id: commentId, jsonKey: "commentId",
  message: `댓글이 삭제되었습니다: ${commentId}`,
})
```

`jsonKey` 와 `message` 는 이런 재사용을 위해 있는 것으로 보인다.
손으로 다시 쓰면 삭제 출력 형식이 두 곳으로 갈라진다.

**고칠 것**: `emitDeleteResult` 재사용으로 바꾼다.
`DeleteResult` 타입에 그 둘이 선택 필드인지 확인하는 단계를 함께 둔다.

## Minor

- **m1.** 항목 수가 문서마다 다르다.
  `index.json` 과 phase-01·02 는 「출력 불일치 세 곳」, phase-03 제목은 「두 곳」이다.
- **m2.** `phase-02.md:100` 은 후크를 `src/index.ts` 에 넣으라 하고
  `:135` 와 Critical Files 는 `src/utils/unknown-option-hint.ts` 를 적는다. 항목 3 의 제목을 맞춘다.
- **m3.** `phase-02.md:130` 이 가리킨 `src/index.test.ts` 는 없다. 선택지에서 뺀다.
- **m4.** 합친 뒤의 개수를 진행 출력에 반영할지 적지 않았다.
  `download-all.ts` 의 `stopSpinner` 문구와 `count` 가 첨부 개수만 센다.
  테스트 표가 `count` 는 보지만 진행 출력은 보지 않는다.
- **m5.** `phase-04.md:146` 의 `grep -c ... # = 0` 은 종료 코드 1 로 끝난다.
- **m6.** `phase-03.md:78` 의 `optsWithGlobals()` 위치가 선례와 다르다.
  `src/commands/post/file/delete.ts` 는 확인을 통과한 뒤에 둔다. 동작 차이는 없다.
- **m7.** `index.json` 의 `execution_profile` 이 phase-03 을 `fast` 로 두는데,
  그 phase 는 `npm link` 로 전역 상태를 바꾸고 되돌리는 단계를 포함한다.
  되돌리기가 실패하면 사용자의 전역 설치가 바뀐 채 남는다.
- **m8.** `phase-01.md:169-182` 의 실계정 확인이 「본문에 이미지가 있고 첨부가 없는 업무를 사용자에게 받는다」라
  사용자 입력 없이 진행할 수 없다. 받지 못했을 때 무엇으로 대신할지가 없다.
- **m9.** `feedback` 의 버전 항목은 #173 의 덧붙임이지만 `--json` 불일치가 아니다.
  맡은 범위를 「덧붙임 전체」로 다시 적거나 그 항목을 옮긴다. 결함 자체는 실재한다.

## 반영 결과

구현을 시작하기 전에 아래와 같이 반영했다.

| 항목 | 반영 |
| --- | --- |
| C1 | plan072 가 맡으므로 다루지 않는다. `index.json` 의 description 에 이슈 175 를 가리키는 문구가 원래 없어 뺄 것이 없었다 |
| M1 | `phase-01.md` 의 제외 수 안내를 지우고 ADR-057 의 결정을 그대로 가리킨다 |
| M2 | `phase-02.md` 의 판정 규칙을 정확일치와 접두 판정 둘로 바꾸고 테스트 표에 세 행을 더했다 |
| M3 | 전파 확인 명령을 `post file download-all --project x` 로 바꿨다 |
| M4 | README 에 만들 절 제목과 위치를 표로 적었다 |
| M5 | SKILL.md 의 표 둘을 구별하고, 머리말과 `--no-inline` 을 적을 자리를 정했다 |
| M6 | `phase-03.md` 를 `emitDeleteResult` 재사용으로 바꾸고 선택 필드 확인 단계를 넣었다 |
| m1 | 「셋」을 「둘」로 맞췄다 (`index.json`, phase-01·02) |
| m2 | 항목 3의 제목을 `src/utils/unknown-option-hint.ts` 로 맞췄다 |
| m3 | `src/index.test.ts` 를 뺐다 |
| m4 | 진행 출력의 개수를 합친 목록 기준으로 적고 테스트 표에 한 행을 더했다 |
| m5 | `grep -c ... # = 0` 에 `|| true` 를 붙였다 (phase-02·04) |
| m6 | `optsWithGlobals()` 를 확인 뒤에 두도록 적었다 |
| m7 | phase-03 의 `execution_profile` 을 `standard` 로 올렸다 |
| m8 | 실계정 확인을 건너뛸 때의 대체와 보고 의무를 적었다 |
| m9 | phase-03 의 목표에 두 항목의 성격이 다르다는 것을 적었다 |

## 확인해 맞았던 것

아래는 대조해 사실과 맞는 것이다. 고치지 않는다.

- `phase-01.md` 가 인용한 `getPostFiles`, `downloadPostFile`, `emitDownloadAllResult`, ADR-031 의 세 키
- `post edit --no-confirm` 선례, `getPost` 로 본문을 얻는 경로
- `phase-02.md:23-26` 의 commander 전제 둘. 설치된 버전은 15.0.0 이고
  `addCommand` 가 `copyInheritedSettings` 를 부르지 않아 출력 설정이 전파되지 않는 것이 맞다
- `phase-02.md:174` 의 「종료 코드는 commander 의 기본값인 1」
- `phase-03.md` 의 `readCliVersion` 서술과 전역 설치에서 `unknown` 이 되는 이유
- `phase-03.md:11-13` 의 `post file upload` 판단. `printJson(res.result)` 로 raw 를 내므로 고칠 것이 없다
- `phase-04.md:90-95` 의 `docs/flow.md` 조건부 처리
