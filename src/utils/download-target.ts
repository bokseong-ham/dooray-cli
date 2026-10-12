// 단일 파일 다운로드의 저장 경로 결정 (ADR-067).
// 디렉터리 옵션(-o/--output, --out)과 --output-file 을 함께 주면 --output-file 이 이긴다.
import type { Command } from "commander";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface DownloadTargetOptions {
  command: Command;
  // 디렉터리 옵션의 commander 키와 화면에 보일 이름 (명령마다 다르다)
  dirKey: string;
  dirFlag: string;
  dirValue: string;
  outputFile?: string;
  fileName: string;
}

// 파라미터 오류는 API 호출과 spinner 앞에서 막는다. 경고도 여기서 한 번만 낸다.
export async function checkOutputFile(
  o: Pick<DownloadTargetOptions, "command" | "dirKey" | "dirFlag" | "outputFile">,
): Promise<void> {
  if (o.outputFile === undefined) return;
  if (o.outputFile.trim() === "" || /[\\/]$/.test(o.outputFile)) {
    throw new DoorayCliError("--output-file 은 파일 경로여야 합니다 (디렉터리 경로 불가).", EXIT_PARAM_ERROR);
  }
  const existing = await stat(o.outputFile).catch(() => null);
  if (existing?.isDirectory()) {
    throw new DoorayCliError(
      `--output-file 경로가 디렉터리입니다: ${o.outputFile}. 디렉터리에 저장하려면 ${o.dirFlag} 를 쓰세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  if (o.command.getOptionValueSource(o.dirKey) === "cli") {
    process.stderr.write(`경고: --output-file 을 주면 ${o.dirFlag} 는 무시합니다.\n`);
  }
}

// 검사는 checkOutputFile 이 끝냈다고 보고 쓰기만 한다.
export async function saveDownload(o: DownloadTargetOptions, data: Uint8Array): Promise<string> {
  if (o.outputFile === undefined) {
    const outputPath = join(o.dirValue, o.fileName);
    await writeFile(outputPath, data);
    return outputPath;
  }
  await mkdir(dirname(o.outputFile), { recursive: true });
  await writeFile(o.outputFile, data);
  return o.outputFile;
}
