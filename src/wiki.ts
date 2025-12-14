import { WikiPage, WikiPagePermissionLevel } from "@devvit/public-api";

export async function appendWikiLog({ reddit, subreddit, page, entry }) {
  let wikiPage: WikiPage | undefined;
  try {
    wikiPage = await reddit.getWikiPage(subreddit, page);
  } catch {}

  const newContent = `${wikiPage?.content ?? ""}\n\n${entry}`;

  await reddit.updateWikiPage({
    subredditName: subreddit,
    page,
    content: newContent,
    reason: "Logs updated",
  });

  if (!wikiPage) {
    await reddit.updateWikiPageSettings({
      subredditName: subreddit,
      page,
      listed: true,
      permLevel: WikiPagePermissionLevel.MODS_ONLY,
    });
  }

  console.log("Wiki updated");
}
