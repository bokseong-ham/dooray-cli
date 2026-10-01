/**
 * `wiki page replace` — 위키 페이지 본문에서 문자열 하나를 찾아 바꾼다.
 *
 * 현재 본문을 GET 해 치환한 뒤 `PUT .../content` 로 본문만 보낸다. 제목은 건드리지 않고
 * 본문 형식은 기존 값을 보존한다. 별도 명령으로 둔 이유와 왕복의 한계는 ADR-065 가 소유한다.
 */
import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import {
  resolveWikiPageInput,
  WIKI_PAGE_ID_OPTION_DESC,
  WIKI_PAGE_PROJECT_OPTION_DESC,
} from "../../resolvers/wiki-page-input.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveBodyMimeType } from "../../utils/body-input.js";
import { applyReplace, formatHunks, readReplaceInputs } from "../../utils/body-replace.js";

export const wikiPageReplaceCommand = new Command("replace")
  .description("위키 페이지 본문의 일부만 치환 (긴 본문에서 한두 군데를 고칠 때 edit 대신 사용)")
  .argument("[arg1]", "프로젝트 코드, Dooray Wiki URL, 또는 (`--id`/`--url` 모드일 때) 미사용")
  .argument("[arg2]", "page-id (positional 2개 모드)")
  .option("--id <pageId>", WIKI_PAGE_ID_OPTION_DESC)
  .option("--url <url>", "Dooray Wiki URL")
  .option("--project <code>", WIKI_PAGE_PROJECT_OPTION_DESC)
  .option("--old <text>", "찾을 문자열 (공백·줄바꿈까지 정확히 일치, - 입력 시 stdin)")
  .option("--old-file <path>", "찾을 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--new <text>", "바꿀 문자열 (빈 문자열이면 old 구간 삭제, - 입력 시 stdin)")
  .option("--new-file <path>", "바꿀 문자열 파일 경로 (- 입력 시 stdin)")
  .option("--all", "일치하는 곳을 모두 치환 (없으면 정확히 한 군데일 때만 치환)")
  .option("--dry-run", "API 수정 없이 바뀌는 줄만 출력")
  .action(async (arg1, arg2, opts) => {
    const { oldText, newText } = await readReplaceInputs(opts);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);
    const globalOpts = wikiPageReplaceCommand.optsWithGlobals() as OutputOptions;

    const { wikiId, pageId } = await resolveWikiPageInput(client, {
      projectArg: arg1,
      pageIdArg: arg2,
      idOpt: opts.id,
      urlOpt: opts.url,
      project: opts.project,
    });

    startSpinner("위키 페이지 조회 중...");
    const page = (await client.getWikiPage(wikiId, pageId)).result;
    stopSpinner(true, "위키 페이지 조회 완료");

    const result = applyReplace(page.body?.content ?? "", oldText, newText, !!opts.all);
    const bodyMimeType = resolveBodyMimeType(page.body?.mimeType);

    if (opts.dryRun) {
      if (globalOpts.json) {
        printJson({
          dryRun: true,
          pageId,
          replaced: result.replaced,
          mimeType: bodyMimeType,
          hunks: result.hunks,
        });
      } else {
        process.stdout.write(formatHunks(result.hunks));
        process.stdout.write(`${result.replaced}군데가 바뀝니다 (dry-run, 수정하지 않음).\n`);
      }
      return;
    }

    startSpinner("위키 페이지 본문 수정 중...");
    await client.updateWikiPageContent(wikiId, pageId, {
      body: { mimeType: bodyMimeType, content: result.content },
    });
    stopSpinner(true, "위키 페이지 수정 완료");

    if (globalOpts.json) {
      printJson({ wikiId, pageId, replaced: result.replaced });
    } else if (globalOpts.quiet) {
      process.stdout.write(`${pageId}\n`);
    } else {
      process.stdout.write(`위키 페이지 본문에서 ${result.replaced}군데를 치환했습니다: ${pageId}\n`);
    }
  });
