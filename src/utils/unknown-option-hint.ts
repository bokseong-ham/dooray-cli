import type { Command } from "commander";

// ADR-058: 알 수 없는 옵션 오류에 그 이름의 실제 사용법을 붙인다.
const UNKNOWN_OPTION = /unknown option '(-+)([^']+)'/;

/** commander 의 오류 문자열에서 알 수 없는 옵션 이름을 뽑는다. 아니면 undefined. */
export function parseUnknownOptionName(message: string): string | undefined {
  return UNKNOWN_OPTION.exec(message)?.[2];
}

/**
 * 그 이름이 인자를 가리키면 붙일 안내를 만든다. 아니면 빈 문자열.
 *
 * 가리키는 것으로 보는 경우는 둘이다.
 * 1. 인자 이름과 정확히 같다 (`--project` 와 `[project]`)
 * 2. 인자 이름이 `<이름>-` 로 시작하고 그런 인자가 하나뿐이다 (`--post` 와 `[post-number]`)
 */
export function buildUsageHint(
  optionName: string | undefined,
  commandPath: string,
  argumentNames: string[],
): string {
  if (!optionName || argumentNames.length === 0) return "";

  const matched =
    argumentNames.includes(optionName) ||
    argumentNames.filter((a) => a.startsWith(`${optionName}-`)).length === 1;
  if (!matched) return "";

  const usage = argumentNames.map((a) => `<${a}>`).join(" ");
  return `  '${optionName}' 는 인자로 전달합니다: ${commandPath} ${usage}\n`;
}

/**
 * 명령 나무를 훑어 각 명령의 오류 출력에 안내를 붙인다.
 *
 * commander 의 `configureOutput` 은 하위 명령으로 전파되지 않는다.
 * 최상위에만 걸면 `addCommand` 로 붙인 하위 명령에서 불리지 않으므로 직접 훑는다.
 */
export function attachUsageHint(cmd: Command, path: string): void {
  const commandPath = path ? `${path} ${cmd.name()}` : cmd.name();
  cmd.configureOutput({
    outputError: (str, write) => {
      const name = parseUnknownOptionName(str);
      // registeredArguments 는 commander 의 내부에 가까운 표면이다.
      // 사라지면 빈 배열이 되어 안내만 빠지고 오류는 그대로 나간다.
      const args = (cmd.registeredArguments ?? []).map((a) => a.name());
      write(str + buildUsageHint(name, commandPath, args));
    },
  });
  for (const sub of cmd.commands) attachUsageHint(sub, commandPath);
}
