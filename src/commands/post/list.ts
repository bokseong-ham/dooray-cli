/**
 * `post list` — 프로젝트의 업무 목록을 조회한다.
 *
 * 제목·태그·등록자·담당자·참조자·상위 업무·등록/수정 기간으로 거르고 정렬을 고를 수 있다.
 * 기간과 정렬은 서버에 보내기 전에 검증한다. 서버가 모르는 정렬 값을 오류 없이 무시하기 때문이다 (ADR-064).
 */

import { Command, Option } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient, type GetPostsParams } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { lookupTagIds } from "../../resolvers/tag.js";
import { resolveMember } from "../../resolvers/member.js";
import { ensureMe } from "../../resolvers/me.js";
import { resolvePostRef } from "../../resolvers/postRef.js";
import { wrapLookupError } from "../../resolvers/post-users.js";
import { resolveDateFilter } from "./date-filter.js";
import { formatPostList } from "../../formatters/post.js";
import type { OutputOptions } from "../../formatters/table.js";
import type { Post } from "../../api/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";

/** 서버가 받는 정렬 값. 목록 밖의 값은 서버가 오류 없이 무시하고 기본 정렬로 돌려준다(실측). */
export const POST_LIST_ORDERS = [
  "-createdAt",
  "createdAt",
  "-postUpdatedAt",
  "postUpdatedAt",
  "-postDueAt",
  "postDueAt",
] as const;

const collect = (v: string, prev: string[]) => [...prev, v];

/**
 * `--from`·`--to`·`--cc` 값을 organizationMemberId 로 바꾼다.
 * `me` 는 API 키 주인이고, 그 밖의 값은 `resolveMember` 가 id·이메일·프로젝트 멤버 이름 순으로 푼다.
 * 같은 사람을 두 번 주면 한 번만 보낸다.
 */
async function resolveFilterMembers(
  client: DoorayApiClient,
  projectId: string,
  option: string,
  inputs: string[],
): Promise<string[]> {
  const ids = await Promise.all(
    inputs.map(async (input) => {
      try {
        if (input === "me") return (await ensureMe(client)).id;
        return await resolveMember(client, projectId, input);
      } catch (err) {
        throw wrapLookupError(`--${option} 멤버 '${input}' 조회 실패`, err);
      }
    }),
  );
  return [...new Set(ids)];
}

export const postListCommand = new Command("list")
  .description("업무 목록 조회")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--subject <keyword>", "제목 키워드 필터링")
  .option("--all", "전체 페이지네이션 (모든 결과 조회)")
  .option("--page <number>", "페이지 번호", "0")
  .option("--size <number>", "페이지 크기", "20")
  .option(
    "--tag <name>",
    "태그로 필터링 (여러 번 주면 그 태그를 모두 가진 업무만)",
    (v, prev: string[]) => [...prev, v],
    [] as string[],
  )
  .option("--from <member>", "등록자로 필터링 (반복 가능, me·id·이메일·이름)", collect, [] as string[])
  .option("--to <member>", "담당자로 필터링 (반복 가능, me·id·이메일·이름)", collect, [] as string[])
  .option("--cc <member>", "참조자로 필터링 (반복 가능, me·id·이메일·이름)", collect, [] as string[])
  .option("--parent <ref>", "상위 업무의 하위 업무만 (project/번호 또는 postId)")
  .option("--created <range>", "등록 기간 (A~B, A~, ~B, prev-7d. A·B 는 YYYY-MM-DD 또는 ISO8601)")
  .option("--updated <range>", "수정 기간 (--created 와 같은 형식)")
  .addOption(
    new Option("--order <field>", "정렬")
      .choices(POST_LIST_ORDERS)
      .default("-createdAt"),
  )
  .action(async (project, opts) => {
    const globalOpts = postListCommand.optsWithGlobals() as OutputOptions;

    // 기간은 설정·프로젝트 조회보다 먼저 검증한다. 잘못된 값으로 API 를 한 번도 부르지 않게 한다.
    const createdAt = opts.created != null ? resolveDateFilter(opts.created, "created") : undefined;
    const updatedAt = opts.updated != null ? resolveDateFilter(opts.updated, "updated") : undefined;

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("업무 목록 조회 중...");
    // 멤버·상위 업무·태그 해석도 실패할 수 있다. 어느 단계에서 끝나든 스피너를 내린다.
    let posts: Post[];
    try {
      const projectId = await resolveProject(client, project);

      const params: GetPostsParams = {
        order: opts.order,
      };
      if (opts.subject) params.subjects = opts.subject;
      if (createdAt) params.createdAt = createdAt;
      if (updatedAt) params.updatedAt = updatedAt;

      // 멤버 필터도 태그처럼 주지 않았으면 키 자체를 넣지 않는다.
      const memberFilters = [
        ["from", "fromMemberIds"],
        ["to", "toMemberIds"],
        ["cc", "ccMemberIds"],
      ] as const;
      for (const [option, key] of memberFilters) {
        const inputs: string[] = (opts[option] ?? []).filter((s: string) => s.length > 0);
        if (inputs.length > 0) {
          params[key] = await resolveFilterMembers(client, projectId, option, inputs);
        }
      }

      if (opts.parent) params.parentPostId = await resolvePostRef(client, opts.parent);

      // 태그를 주지 않았으면 `tagIds` 키 자체를 넣지 않는다. 빈 배열을 넣으면 의도가 흐려진다.
      const tagNames: string[] = (opts.tag ?? []).filter((s: string) => s.length > 0);
      if (tagNames.length > 0) {
        params.tagIds = await lookupTagIds(client, projectId, tagNames);
      }

      if (opts.all) {
        posts = [];
        let page = 0;
        const size = 100;
        while (true) {
          const res = await client.getPosts(projectId, { ...params, page, size });
          posts.push(...res.result);
          if (posts.length >= res.totalCount) break;
          page++;
        }
      } else {
        const res = await client.getPosts(projectId, {
          ...params,
          page: Number(opts.page),
          size: Number(opts.size),
        });
        posts = res.result;
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true, "업무 목록 조회 완료");
    formatPostList(posts, globalOpts);
  });
