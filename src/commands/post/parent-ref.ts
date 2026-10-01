/**
 * `post list --parent` 값을 읽어 어떻게 postId 로 풀지 정하는 순수 함수.
 *
 * `post list` 는 프로젝트를 이미 받으므로 짧은 숫자는 그 프로젝트의 업무 번호로 본다.
 * 15자리 이상 숫자는 postId, `<project>/<number>` 는 다른 프로젝트의 업무 번호다.
 * 그 밖의 값은 API 를 부르기 전에 `EXIT_PARAM_ERROR` 로 거른다 (ADR-064).
 */

import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export type ParentRef =
  | { kind: "number"; number: number }
  | { kind: "postId"; postId: string }
  | { kind: "ref"; ref: string };

const POST_ID = /^\d{15,}$/;
const POST_NUMBER = /^\d{1,14}$/;
const PROJECT_REF = /^[^/\s]+\/\d{1,14}$/;

function paramError(value: string): DoorayCliError {
  return new DoorayCliError(
    `--parent 값을 읽을 수 없습니다: "${value}" ` +
      `(이 프로젝트의 업무 번호(42), <project>/<number>, postId(15자리 이상 숫자) 중 하나로 주세요)`,
    EXIT_PARAM_ERROR,
  );
}

export function parseParentRef(value: string): ParentRef {
  if (POST_ID.test(value)) return { kind: "postId", postId: value };
  if (POST_NUMBER.test(value)) {
    const number = Number(value);
    if (number <= 0) throw paramError(value);
    return { kind: "number", number };
  }
  if (PROJECT_REF.test(value)) {
    if (Number(value.slice(value.indexOf("/") + 1)) <= 0) throw paramError(value);
    return { kind: "ref", ref: value };
  }
  throw paramError(value);
}
