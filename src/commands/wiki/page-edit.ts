import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveWiki } from "../../resolvers/wiki.js";
import {
  openInEditor,
  serializeWikiFrontmatter,
  parseWikiFrontmatter,
} from "../../editor/index.js";
import { readBodyInput, BODY_MIME_TYPES, resolveBodyMimeType } from "../../utils/body-input.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

export const wikiPageEditCommand = new Command("edit")
  .description("위키 페이지 수정 (플래그 없으면 $EDITOR)")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<page-id>", "페이지 ID")
  .option("--title <title>", "페이지 제목 (지정 시 $EDITOR 생략)")
  .option("--body <text>", "본문 텍스트 (- 입력 시 stdin에서 읽기)")
  .option("--body-file <path>", "본문 파일 경로 (- 입력 시 stdin에서 읽기)")
  .addOption(
    new Option("--mime-type <type>", "본문 형식 (미지정 시 기존 페이지의 형식 유지)")
      .choices(BODY_MIME_TYPES),
  )
  .action(async (project, pageId, opts) => {
    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const hasTitle = opts.title != null;
    const hasBody = opts.body != null || opts.bodyFile != null;
    const nonInteractive = hasTitle || hasBody;

    // resolveWiki 먼저 호출 — $EDITOR flow와 순서 통일 (page-create와 비대칭은 의도적)
    startSpinner("위키 정보 조회 중...");
    const wikiId = await resolveWiki(client, project);

    if (!nonInteractive) {
      // 기존 $EDITOR flow
      const res = await client.getWikiPage(wikiId, pageId);
      const page = res.result;
      stopSpinner(true, "위키 페이지 조회 완료");

      const original = serializeWikiFrontmatter(page);
      const edited = await openInEditor(original);

      if (original === edited) {
        process.stdout.write("변경사항 없음\n");
        return;
      }

      const parsed = parseWikiFrontmatter(edited);

      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: parsed.title,
        body: {
          mimeType: resolveBodyMimeType(page.body?.mimeType, opts.mimeType),
          content: parsed.body,
        },
      });
      stopSpinner(true, "위키 페이지 수정 완료");
      process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
      return;
    }

    // 비대화형 분기
    stopSpinner(true, "위키 정보 조회 완료");

    // 기존 mimeType 보존용 조회. $EDITOR flow 와 달리 원본을 들고 있지 않아
    // 본문을 바꿀 때만 한 번 더 조회한다 (제목만 수정하거나 --mime-type 으로
    // 형식을 직접 지정하면 조회 불요).
    let bodyMimeType = resolveBodyMimeType(undefined, opts.mimeType);
    if (hasBody && opts.mimeType == null) {
      startSpinner("위키 페이지 조회 중...");
      const res = await client.getWikiPage(wikiId, pageId);
      bodyMimeType = resolveBodyMimeType(res.result.body?.mimeType);
      stopSpinner(true, "위키 페이지 조회 완료");
    }

    if (hasTitle && hasBody) {
      const bodyContent = await readBodyInput(opts);
      startSpinner("위키 페이지 수정 중...");
      await client.updateWikiPage(wikiId, pageId, {
        subject: opts.title,
        body: { mimeType: bodyMimeType, content: bodyContent },
      });
    } else if (hasTitle) {
      startSpinner("위키 페이지 제목 수정 중...");
      await client.updateWikiPageTitle(wikiId, pageId, { subject: opts.title });
    } else {
      // hasBody only
      const bodyContent = await readBodyInput(opts);
      startSpinner("위키 페이지 본문 수정 중...");
      await client.updateWikiPageContent(wikiId, pageId, {
        body: { mimeType: bodyMimeType, content: bodyContent },
      });
    }

    stopSpinner(true, "위키 페이지 수정 완료");
    process.stdout.write(`위키 페이지가 수정되었습니다: ${pageId}\n`);
  });
