export async function sendDiscordAlert({
  webhook,
  discordRole,
  username,
  role, // "OP" | "trusted user" | "mod"
  author,
  commentPermalink,
  pinnedPermalink,
  note,
  subredditName,
}: {
  webhook: string;
  discordRole?: string | null;
  username: string;
  role: string;
  author: string;
  commentPermalink: string;
  pinnedPermalink: string;
  note?: string | null;
  subredditName: string;
}) {
  try {
    if (!webhook) {
      console.log("No webhook → skipping Discord");
      return;
    }

    const isDiscordWebhook = webhook.startsWith(
      "https://discord.com/api/webhooks/",
    );
    if (!isDiscordWebhook) {
      console.log("Provided webhook is NOT a Discord webhook → skipping");
      return;
    }

    console.log("Sending to Discord…");

    let message =
      `**${username} (${role})** has used Spotlight to pin ` +
      `[this comment](https://reddit.com${commentPermalink}) ` +
      `by u/${author}.`;

    if (note) message += ` **Note:** ${note}`;
    if (discordRole) message += `\n\n<@&${discordRole}>`;

    const payload = {
      content: message,
      embeds: [
        {
          title: "Pinned comment",
          url: `https://reddit.com${pinnedPermalink}`,
          fields: [
            {
              name: "Recent uses",
              value: `[Link](https://reddit.com/r/${subredditName}/w/spotlight/logs)`,
              inline: true,
            },
            {
              name: "Config",
              value: `[Link](https://developers.reddit.com/r/${subredditName}/apps/spotlight-app)`,
              inline: true,
            },
            {
              name: "Feedback",
              value: `[Link](https://reddit.com/message/compose?to=/r/paskapps&subject=Spotlight)`,
              inline: true,
            },
          ],
        },
      ],
    };

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("Discord alert sent!");
  } catch (err) {
    console.error("Discord error:", err);
  }
}
