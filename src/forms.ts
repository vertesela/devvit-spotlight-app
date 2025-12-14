import { Devvit, WikiPage, WikiPagePermissionLevel } from "@devvit/public-api";
import { submitPostReply, isModerator } from "devvit-helpers";
import { appendWikiLog } from "./wiki.js";
import { sendDiscordAlert } from "./discord.js";
import {
  WHAT_IS_SPOTLIGHT,
  PinnedCommentQuote,
  OP_PinnedComment,
  OP_PinnedComment_WithNote,
  TU_PinnedComment,
  TU_PinnedComment_Public,
  TU_PinnedComment_WithNote,
  Mod_PinnedComment,
  Mod_PinnedComment_WithNote,
  NotifyUser_OP,
  NotifyUser_OP_WithNote,
  NotifyUser_TU_Visible,
  NotifyUser_TU_Visible_WithNote,
  NotifyUser_TU_Anonymous,
  NotifyUser_TU_Anonymous_WithNote,
  NotifyUser_Mod,
  NotifyUser_Mod_WithNote,
  ModmailNotice_Mod,
  DiscordMessage,
  InstallMessage,
  UpdateMessage,
} from "./messages.js";

import { escapeUsername } from "./config.js";

export const pinThatCommentAsOP = Devvit.createForm(
  {
    title: "Pin that comment (as OP)",
    description: "You are the original poster of this thread.",
    fields: [
      {
        name: "modNote",
        label: "Note",
        helpText: "Optional",
        type: "string",
      },
    ],
  },

  async (_event, context) => {
    const { reddit, ui } = context;

    const subreddit = await reddit.getCurrentSubreddit();
    const OP = await reddit.getCurrentUser();
    const commentId = context.commentId!;
    const originalComment = await reddit.getCommentById(commentId);

    const pinNote = _event.values.modNote;
    const commentLink = originalComment.permalink;

    const commentText =
      originalComment.body?.split("\n\n").join("\n\n> ") ?? "";

    const isRecipientMod = await isModerator(
      reddit,
      subreddit.name,
      originalComment.authorName,
    );

    // SETTINGS
    const setSpotlightPostFlair =
      await context.settings.get<boolean>("setFlair");
    const spotlightFlairText = await context.settings.get<string>(
      "spotlightPostFlairText",
    );
    const alertUser = await context.settings.get<boolean>("alertUser");
    const sendModmail = await context.settings.get<boolean>("sendModmail");
    const sendtoDiscord = await context.settings.get<boolean>("sendDiscord");
    const autoLock = await context.settings.get<boolean>("autoLock");
    const autoArchiving = await context.settings.get<boolean>("autoArchive");

    // -----------------------------------------------------
    // BUILD TEXTS
    // -----------------------------------------------------
    const escapedAuthor = escapeUsername(originalComment.authorName);

    const pinnedComment = pinNote
      ? OP_PinnedComment_WithNote(
          escapedAuthor,
          commentLink,
          commentText,
          pinNote,
        )
      : OP_PinnedComment(escapedAuthor, commentLink, commentText);

    const modNotification =
      `**${OP?.username} (OP)** has pinned the ` +
      `[comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n` +
      `[Recent uses](https://reddit.com/r/${subreddit.name}/w/spotlight/logs) | ` +
      `[Config](https://developers.reddit.com/r/${subreddit.name}/apps/spotlight-app) | ` +
      `[Feedback](https://reddit.com/message/compose?to=/r/paskapps&subject=Spotlight)\n\n`;

    let userMessage = pinNote
      ? NotifyUser_OP_WithNote(
          escapedAuthor,
          commentLink,
          OP!.username!,
          pinNote,
        )
      : NotifyUser_OP(escapedAuthor, commentLink, OP!.username!);

    // -----------------------------------------------------
    // CREATE COMMENT
    // -----------------------------------------------------
    const newCom = await reddit.submitComment({
      id: originalComment.postId,
      text: pinnedComment,
    });

    newCom.distinguish(true);
    if (autoLock) newCom.lock();

    // Flair
    if (setSpotlightPostFlair) {
      await reddit.setPostFlair({
        subredditName: subreddit.name,
        postId: originalComment.postId,
        text: spotlightFlairText,
      });
    }

    userMessage += `You can view pinned comment [here](${newCom.permalink}).\n\n`;
    userMessage += `Thanks for contributing!\n\n~ r/${subreddit.name} Mod Team\n\n`;

    ui.showToast("Posted!");

    // -----------------------------------------------------
    // USER MODMAIL NOTIFICATION
    // -----------------------------------------------------
    if (alertUser) {
      const mm = await reddit.modMail.createConversation({
        subredditName: subreddit.name,
        to: originalComment.authorName,
        isAuthorHidden: true,
        subject: `Your comment has been pinned by OP`,
        body: userMessage,
      });

      if (!isRecipientMod) {
        await reddit.modMail.archiveConversation(mm.conversation.id!);
      } else {
        console.log("Recipient is a moderator → skipping auto-archive");
      }
    }

    // -----------------------------------------------------
    // MOD NOTE
    // -----------------------------------------------------
    await reddit.addModNote({
      subreddit: subreddit.name,
      user: originalComment.authorName,
      label: "HELPFUL_USER",
      note: `Comment pinned by ${OP?.username}.`,
      redditId: originalComment.postId,
    });

    // -----------------------------------------------------
    // NOTIFY MODS
    // -----------------------------------------------------
    if (sendModmail) {
      const alert = await reddit.modMail.createModNotification({
        bodyMarkdown: modNotification,
        subredditId: subreddit.id,
        subject: `${OP?.username} has used Spotlight`,
      });

      if (autoArchiving) {
        await reddit.modMail.archiveConversation(alert);
      }
    }

    // -----------------------------------------------------
    // DISCORD ALERT
    // -----------------------------------------------------
    if (sendtoDiscord) {
      const webhook = (await context.settings.get("webhook")) as string;

      await sendDiscordAlert({
        webhook,
        discordRole: await context.settings.get("discordRole"),
        username: OP?.username!,
        role: "OP",
        author: originalComment.authorName,
        commentPermalink: originalComment.permalink,
        pinnedPermalink: newCom.permalink,
        note: pinNote,
        subredditName: subreddit.name,
      });
    }

    // -----------------------------------------------------
    // WIKI LOG ENTRY
    // -----------------------------------------------------
    const CurrentCETDateTime = (): string => {
      const cet = new Date(Date.now() + 60 * 60 * 1000);
      return cet.toISOString().slice(0, 19).replace("T", " ") + " CET";
    };

    const wikiEntry =
      `✅ ${CurrentCETDateTime()} - u/${OP?.username} (OP) pinned ` +
      `[this comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n` +
      `**Content** ([link](${newCom.permalink})):\n\n> ${commentText}\n\n` +
      (pinNote ? `**Note from OP:** ${pinNote}\n\n` : ``) +
      `---\n\n`;

    await appendWikiLog({
      reddit,
      subreddit: subreddit.name,
      page: "spotlight/logs",
      entry: wikiEntry,
    });

    console.log("Logs page updated.");
  },
);

export const pinThatCommentAsTrustedUser = Devvit.createForm(
  {
    title: "Pin that comment (as a trusted user)",
    description: "You are a trusted user in this subreddit.",
    fields: [
      {
        name: "modNote",
        label: "Note",
        helpText: "Optional",
        type: "string",
      },
      {
        name: "usernameVisibility",
        label: "Let others see that I pinned this",
        helpText:
          "If unchecked, your username will not appear in the pinned message (only mods can see full details).",
        type: "boolean",
      },
    ],
  },

  async (_event, context) => {
    const { reddit, ui } = context;

    const subreddit = await reddit.getCurrentSubreddit();
    const commentId = context.commentId!;
    const appUser = await reddit.getCurrentUser();
    const originalComment = await reddit.getCommentById(commentId);

    const commentLink = originalComment.permalink;
    const rawAuthor = originalComment.authorName;
    const escapedAuthor = escapeUsername(rawAuthor);

    const commentText =
      originalComment.body?.split("\n\n").join("\n\n> ") ?? "";

    const pinNote = _event.values.modNote;
    const usernameVisibility = _event.values.usernameVisibility;

    const isSelfPin = rawAuthor === appUser?.username;
    const isRecipientMod = await isModerator(reddit, subreddit.name, rawAuthor);

    // Settings
    const alertUser = await context.settings.get("alertUser");
    const sendModmail = await context.settings.get("sendModmail");
    const sendtoDiscord = await context.settings.get("sendDiscord");
    const autoLock = await context.settings.get("autoLock");
    const autoArchiving = await context.settings.get("autoArchive");

    const webhook = (await context.settings.get("webhook")) as string;
    const discordRole = (await context.settings.get("discordRole")) as string;

    const setSpotlightPostFlair =
      await context.settings.get<boolean>("setFlair");
    const spotlightFlairText = await context.settings.get<string>(
      "spotlightPostFlairText",
    );

    // Auto-flair post
    if (setSpotlightPostFlair) {
      await reddit.setPostFlair({
        subredditName: subreddit.name,
        postId: originalComment.postId,
        text: spotlightFlairText,
      });
    }

    // -----------------------------------------------------
    // BUILD USER MESSAGE (4 cases)
    // -----------------------------------------------------
    let messageText = "";
    if (usernameVisibility) {
      messageText = pinNote
        ? NotifyUser_TU_Visible_WithNote(
            escapedAuthor,
            commentLink,
            appUser!.username,
            pinNote,
          )
        : NotifyUser_TU_Visible(escapedAuthor, commentLink, appUser!.username);
    } else {
      messageText = pinNote
        ? NotifyUser_TU_Anonymous_WithNote(escapedAuthor, commentLink, pinNote)
        : NotifyUser_TU_Anonymous(escapedAuthor, commentLink);
    }

    // -----------------------------------------------------
    // BUILD PINNED COMMENT (4 cases)
    // -----------------------------------------------------
    let pinnedComment = "";

    if (usernameVisibility) {
      if (isSelfPin) {
        pinnedComment += `u/${appUser?.username} has pinned their own [comment](https://reddit.com${commentLink}):\n\n`;
      } else {
        pinnedComment += `u/${appUser?.username} has pinned a [comment](https://reddit.com${commentLink}) by u/${escapedAuthor}:\n\n`;
      }
    } else {
      pinnedComment += `Pinned [comment](https://reddit.com${commentLink}) from u/${escapedAuthor}:\n\n`;
    }

    pinnedComment += `> ${commentText}\n\n`;

    if (pinNote) pinnedComment += `**Note:** ${pinNote}\n\n`;

    pinnedComment += `^([What is Spotlight?](https://developers.reddit.com/apps/spotlight-app))\n\n`;

    // -----------------------------------------------------
    // POST THE PINNED COMMENT
    // -----------------------------------------------------
    const newCom = await reddit.submitComment({
      id: originalComment.postId,
      text: pinnedComment,
    });

    newCom.distinguish(true);
    if (autoLock) newCom.lock();

    // Finish user message
    messageText += `You can view pinned comment [here](${newCom.permalink}).\n\n`;
    messageText += `Thanks for contributing!\n\n~ r/${subreddit.name} Mod Team\n\n`;

    ui.showToast("Posted!");

    // -----------------------------------------------------
    // ADD MOD NOTE
    // -----------------------------------------------------
    await reddit.addModNote({
      subreddit: subreddit.name,
      user: rawAuthor,
      label: "HELPFUL_USER",
      note: `Comment pinned by ${appUser?.username}.`,
      redditId: originalComment.postId,
    });

    // -----------------------------------------------------
    // SEND USER MESSAGE
    // -----------------------------------------------------
    if (alertUser) {
      const mm = await reddit.modMail.createConversation({
        subredditName: subreddit.name,
        to: rawAuthor,
        isAuthorHidden: true,
        subject: `Your comment has been pinned`,
        body: messageText,
      });

      if (!isRecipientMod) {
        await reddit.modMail.archiveConversation(mm.conversation.id!);
      } else {
        console.log("Skipping auto-archive → recipient is a moderator");
      }
    }

    // -----------------------------------------------------
    // SEND MODMAIL NOTIFICATION
    // -----------------------------------------------------
    if (sendModmail) {
      const notifText =
        `**${appUser?.username} (trusted user)** has pinned ` +
        `[a comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n` +
        `[Recent uses](https://reddit.com/r/${subreddit.name}/w/spotlight/logs) | ` +
        `[Config](https://developers.reddit.com/r/${subreddit.name}/apps/spotlight-app) | ` +
        `[Feedback](https://reddit.com/message/compose?to=/r/paskapps&subject=Spotlight)\n\n`;

      const notif = await reddit.modMail.createModNotification({
        bodyMarkdown: notifText,
        subject: `${appUser?.username} has used Spotlight`,
        subredditId: subreddit.id,
      });

      if (autoArchiving) {
        await reddit.modMail.archiveConversation(notif);
      }
    }

    // -----------------------------------------------------
    // DISCORD ALERT
    // -----------------------------------------------------
    if (sendtoDiscord) {
      await sendDiscordAlert({
        webhook,
        discordRole,
        username: appUser?.username!,
        role: "trusted user",
        author: escapedAuthor,
        commentPermalink: originalComment.permalink,
        pinnedPermalink: newCom.permalink,
        note: pinNote,
        subredditName: subreddit.name,
      });
    }

    // -----------------------------------------------------
    // WIKI LOG
    // -----------------------------------------------------
    const CurrentCETDateTime = (): string => {
      const cet = new Date(Date.now() + 60 * 60 * 1000);
      return cet.toISOString().slice(0, 19).replace("T", " ") + " CET";
    };

    let wikiEntry = `✅ ${CurrentCETDateTime()} - u/${appUser?.username} (trusted user) pinned `;
    wikiEntry += `[this comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n`;
    wikiEntry += `**Content** ([link](${newCom.permalink})):\n\n> ${commentText}\n\n`;
    if (pinNote) wikiEntry += `**Note:** ${pinNote}\n\n`;
    wikiEntry += `---\n\n`;

    await appendWikiLog({
      reddit,
      subreddit: subreddit.name,
      page: "spotlight/logs",
      entry: wikiEntry,
    });

    console.log("Logs updated.");
  },
);

export const pinThatCommentAsMod = Devvit.createForm(
  {
    title: "Pin that comment",
    description: "You are a moderator, so this action will be logged as such.",
    fields: [
      {
        name: "modNote",
        label: "Note",
        helpText: "Optional",
        type: "string",
      },
    ],
  },

  async (_event, context) => {
    const { reddit, ui } = context;

    const subreddit = await reddit.getCurrentSubreddit();
    const commentId = context.commentId!;
    const modUser = await reddit.getCurrentUser();
    const originalComment = await reddit.getCommentById(commentId);

    const commentLink = originalComment.permalink;
    const rawAuthor = originalComment.authorName;
    const escapedAuthor = escapeUsername(rawAuthor);

    const commentText =
      originalComment.body?.split("\n\n").join("\n\n> ") ?? "";

    const pinNote = _event.values.modNote;

    // Settings
    const setSpotlightPostFlair =
      await context.settings.get<boolean>("setFlair");
    const spotlightFlairText = await context.settings.get<string>(
      "spotlightPostFlairText",
    );

    const isRecipientMod = await isModerator(reddit, subreddit.name, rawAuthor);

    const alertUser = await context.settings.get("alertUser");
    const sendModmail = await context.settings.get("sendModmail");
    const sendtoDiscord = await context.settings.get("sendDiscord");
    const autoLock = await context.settings.get("autoLock");
    const autoArchiving = await context.settings.get("autoArchive");

    const webhook = (await context.settings.get("webhook")) as string;
    const discordRole = (await context.settings.get("discordRole")) as string;

    // -----------------------------------------------------
    // USER NOTIFICATION MESSAGE
    // -----------------------------------------------------
    let messageText = pinNote
      ? NotifyUser_Mod_WithNote(escapedAuthor, commentLink, pinNote)
      : NotifyUser_Mod(escapedAuthor, commentLink);

    // -----------------------------------------------------
    // PINNED COMMENT BODY
    // -----------------------------------------------------
    const pinnedComment = pinNote
      ? Mod_PinnedComment_WithNote(
          commentLink,
          escapedAuthor,
          commentText,
          pinNote,
        )
      : Mod_PinnedComment(commentLink, escapedAuthor, commentText);

    // -----------------------------------------------------
    // CREATE PINNED COMMENT
    // -----------------------------------------------------
    const newCom = await reddit.submitComment({
      id: originalComment.postId,
      text: pinnedComment,
    });

    newCom.distinguish(true);
    if (autoLock) newCom.lock();

    // Auto flair post
    if (setSpotlightPostFlair) {
      await reddit.setPostFlair({
        subredditName: subreddit.name,
        postId: originalComment.postId,
        text: spotlightFlairText,
      });
    }

    // Finish user message
    messageText += `You can view pinned comment [here](${newCom.permalink}).\n\n`;
    messageText += `Thanks for contributing!\n\n~ r/${subreddit.name} Mod Team\n\n`;

    ui.showToast("Posted!");

    // -----------------------------------------------------
    // SEND USER MESSAGE (modmail)
    // -----------------------------------------------------
    if (alertUser) {
      const mm = await reddit.modMail.createConversation({
        subredditName: subreddit.name,
        to: rawAuthor,
        isAuthorHidden: true,
        subject: "Your comment has been pinned by moderators",
        body: messageText,
      });

      if (!isRecipientMod) {
        await reddit.modMail.archiveConversation(mm.conversation.id!);
      }
    }

    // -----------------------------------------------------
    // ADD MOD NOTE
    // -----------------------------------------------------
    await reddit.addModNote({
      subreddit: subreddit.name,
      user: rawAuthor,
      label: "HELPFUL_USER",
      note: `Comment pinned by ${modUser?.username} (mod).`,
      redditId: originalComment.postId,
    });

    // -----------------------------------------------------
    // SEND MODMAIL NOTIFICATION
    // -----------------------------------------------------
    if (sendModmail) {
      const modNotice =
        `**${modUser?.username} (mod)** has pinned the ` +
        `[comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n` +
        `[Recent uses](https://reddit.com/r/${subreddit.name}/w/spotlight/logs) | ` +
        `[Config](https://developers.reddit.com/r/${subreddit.name}/apps/spotlight-app) | ` +
        `[Feedback](https://reddit.com/message/compose?to=/r/paskapps&subject=Spotlight)\n\n`;

      const notif = await reddit.modMail.createModNotification({
        bodyMarkdown: modNotice,
        subject: `${modUser?.username} has used Spotlight`,
        subredditId: subreddit.id,
      });

      if (autoArchiving) {
        await reddit.modMail.archiveConversation(notif);
      }
    }

    // -----------------------------------------------------
    // DISCORD ALERT
    // -----------------------------------------------------
    if (sendtoDiscord) {
      await sendDiscordAlert({
        webhook,
        discordRole,
        username: modUser?.username!,
        role: "moderator",
        author: escapedAuthor,
        commentPermalink: originalComment.permalink,
        pinnedPermalink: newCom.permalink,
        note: pinNote ?? null,
        subredditName: subreddit.name,
      });
    }

    // -----------------------------------------------------
    // WIKI LOG ENTRY
    // -----------------------------------------------------
    const CurrentCETDateTime = (): string => {
      const cet = new Date(Date.now() + 60 * 60 * 1000);
      return cet.toISOString().slice(0, 19).replace("T", " ") + " CET";
    };

    let wikiEntry = "";
    wikiEntry += `✅ ${CurrentCETDateTime()} - u/${modUser?.username} (mod) pinned `;
    wikiEntry += `[this comment](https://reddit.com${commentLink}) by u/${escapedAuthor}.\n\n`;
    wikiEntry += `**Content** ([link](${newCom.permalink})):\n\n> ${commentText}\n\n`;
    if (pinNote) wikiEntry += `**Note:** ${pinNote}\n\n`;
    wikiEntry += `---\n\n`;

    await appendWikiLog({
      reddit,
      subreddit: subreddit.name,
      page: "spotlight/logs",
      entry: wikiEntry,
    });

    console.log("Wiki logs updated.");
  },
);
