# Phase 02. 「UID 는 확인 없이 보낸다」고 적은 문서 셋을 고친다

**Execution profile**: fast

## 목표

phase 01 이 바꾼 동작을 문서에 반영한다.
지금은 세 문서가 UID 직접 입력을 확인 없는 경로로 적고 있어, 고치지 않으면 코드와 반대가 된다.

**범위 외**: 코드는 손대지 않는다. phase 01 이 끝난 뒤에 실행한다.
`README.md` 는 대상이 아니다. 그 파일에 `mail reply` 절이 없다.
`docs/prd.md` 와 `docs/data-schema.md` 도 대상이 아니다.
제품 범위와 저장 모델이 바뀌지 않는다.

## 컨텍스트

phase 01 이 확인 판정을 입력 형식에서 떼어 냈다.
그 전의 동작을 적은 자리가 셋이다.

| 파일 | 줄 | 현재 서술 |
| --- | --- | --- |
| `CLAUDE.md` | 66 | `UID 직접 입력은 확인 없이 보낸다` |
| `skills/dooray-cli/SKILL.md` | 241 | `UID 직접 입력은 확인 없이 보낸다` |
| `docs/flow.md` | 657 | `UID 직접 입력의 답장은 기존처럼 확인 없이 보낸다` |

`docs/flow.md:679` 의 `시스템 폴더 형식이 아닌 주소와 mail id 와 UID 직접 입력은 INBOX 를 조회한다` 는
사서함 선택을 말하는 문장이라 이번 변경과 무관하다. 손대지 않는다.

**근거 문서**: `docs/adr/060-mail-reply-confirmation-policy.md`

## 의도 메모

- 세 문서가 같은 사실을 적으므로 한 곳만 고치면 나머지가 코드와 어긋난 채 남는다.
  셋을 한 phase 에서 함께 고치는 이유가 그것이다.
- `docs/adr/060-mail-reply-confirmation-policy.md` 는 이미 있다. 새로 만들지 않는다.
  ADR 을 고칠 일도 없다. 이 phase 는 그 결정을 옮겨 적는 쪽이다.
- 공개 문서인 `skills/dooray-cli/SKILL.md` 에는 ADR 번호를 적지 않는다.
  동작만 적는다. 판정은 `node scripts/check-public-refs.mjs` 가 한다.

## 작업 항목

### 1. `CLAUDE.md` 의 mail 계열 규약을 고친다

66번 줄이 대상이다. 그 줄은 지금 `-y`/`--yes` 와 non-TTY 차단을 적은 뒤
`UID 직접 입력은 확인 없이 보낸다` 로 끝난다.

마지막 문장을 지우고, 확인이 세 입력 형식에 모두 걸린다는 것으로 바꾼다.
65번 줄이 웹 주소와 mail id 의 확인 화면을 따로 적고 있으므로,
그 화면이 UID 에도 나온다는 것이 드러나야 한다.

`(ADR-060)` 을 붙인다. `CLAUDE.md` 는 내부 문서라 ADR 번호를 그대로 쓴다.
64번 줄이 `(ADR-040)` 을 쓰고 있는 것이 선례다.

### 2. `skills/dooray-cli/SKILL.md` 의 메일 절을 고친다

241번 줄의 `UID 직접 입력은 확인 없이 보낸다` 를 지운다.

그 위의 239번 줄부터가 웹 주소와 mail id 만 확인한다고 읽히므로,
확인이 세 입력 형식 모두에 걸린다는 것으로 다시 쓴다.
비대화형에서 `-y` 없이 종료 코드 3 으로 끝난다는 서술은 그대로 둔다.

ADR 번호와 이슈 번호를 넣지 않는다.

### 3. `docs/flow.md` 의 메일 절을 고친다

657번 줄의 `UID 직접 입력의 답장은 기존처럼 확인 없이 보낸다` 를 지운다.

그 위 654번 줄부터가 웹 주소와 mail id 의 확인을 적고 있다.
그 문단을 세 입력 형식 모두에 걸리는 확인으로 다시 쓴다.
추정 입력에만 해당하는 서술(시간 일치가 동일성을 보장하지 않는다는 것)은 남긴다.
그것은 여전히 그 두 형식만의 성질이다.

### 4. 세 문서의 표기를 검사한다

한국어 표기 검사기를 이 phase 가 고친 파일에만 돌린다.

```bash
# cwd: <repo root>
~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md docs/flow.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다. 걸리면 이유를 덧붙이지 말고 문장을 풀어 쓴다.

마지막으로 `tasks/plan073-fix-mail-reply-confirmation/index.json` 의
`status` 를 `completed` 로, `current_phase` 를 `2` 로 바꾼다.

## 검증

```bash
# cwd: <repo root>
grep -rn "확인 없이 보낸다" CLAUDE.md docs/flow.md skills/dooray-cli/SKILL.md | wc -l
```

0 이어야 한다. 세 자리가 모두 고쳐진 것을 본다.

```bash
# cwd: <repo root>
grep -c "ADR-060" CLAUDE.md
```

1 이상이어야 한다.

```bash
# cwd: <repo root>
node scripts/check-public-refs.mjs
node scripts/check-pii.mjs
```

둘 다 종료 코드 0 이어야 한다.
앞의 것이 `skills/dooray-cli/SKILL.md` 에 내부 번호가 들어가지 않은 것을 판정한다.

```bash
# cwd: <repo root>
~/personal/fos-skills/korean-check/scripts/check.sh CLAUDE.md docs/flow.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm test src/commands/mail/reply.test.ts
```

종료 코드 0 이어야 한다. 문서만 고쳤으므로 phase 01 의 확인이 그대로 통과해야 한다.
깨지면 이 phase 에서 코드를 건드린 것이다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 수정 |
| `docs/flow.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
