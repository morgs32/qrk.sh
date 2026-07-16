---
name: slack-me
description: Send the current user a Slack DM from Codex. Use when the user says "slack me", "Slack this to me", "DM me", "send me this in Slack", "message me the status", or otherwise asks Codex to deliver a summary, result, reminder text, link, or status update to the user's own Slack account.
---

# Slack Me

## Overview

Use this skill to deliver a concise Slack message to the authenticated user's own Slack account.
This is a write workflow, so also use the Slack plugin's outbound-message rules when composing the final text.

## Required env

Immediate webhook sends need `SLACK_ME_WEBHOOK_URL` in the **repository root** `.env.local`:

```bash
# <repo-root>/.env.local
SLACK_ME_WEBHOOK_URL=https://hooks.slack.com/services/...
```

That file is gitignored (`**/.env*`). It must already exist locally with a real Slack incoming webhook URL — do not invent one, and never commit the URL into this skill or any other tracked file.

Load the value before posting (example):

```bash
set -a && source .env.local && set +a
curl -sS -X POST -H 'Content-Type: application/json' \
  --data "$(jq -n --arg text "$MESSAGE" '{text:$text}')" \
  "$SLACK_ME_WEBHOOK_URL"
```

If `.env.local` is missing or `SLACK_ME_WEBHOOK_URL` is empty, stop and tell the user to add it at the repo root; do not fall back to a hardcoded webhook.

## Workflow

1. Determine whether the user asked for an immediate send or a draft.
   - If the user says send, slack me, DM me, message me, or similar direct wording, send the message.
   - If the user says draft, prepare, or review first, create a draft instead.
2. Compose the message for Slack.
   - Keep it short and self-contained.
   - Preserve important file paths, links, command names, dates, owners, and error text.
   - Do not add broad mentions or channel references.
   - For immediate webhook sends, append this italic fine print on the same line as the message: `_-- Sent via /slack-me_`.
3. For immediate sends, post the message through the incoming webhook from `SLACK_ME_WEBHOOK_URL`.
   - Use `curl` with `Content-Type: application/json` and a JSON body containing `text`.
   - Do not call `slack_send_message` unless the webhook request fails.
   - Incoming webhooks cannot create drafts, schedule future sends, choose arbitrary DM recipients, or return a per-message Slack permalink.
4. For drafts, resolve the current Slack user.
   - Call `slack_read_user_profile` with no `user_id`.
   - Use the returned Slack user ID as the destination for `slack_send_message_draft`.
5. If the connector send path is needed and rejects the user ID as a channel, find or create the self-DM conversation.
   - Call `slack_list_user_conversations` with `types: "im"` and the current user ID when available.
   - Use an existing `D...` conversation ID if one is returned for the current user.
   - If no DM exists and the user asked for an immediate send, call `slack_create_conversation` with the current user ID.
6. Send or draft.
   - Use the incoming webhook for immediate delivery.
   - Use `slack_send_message_draft` only when the user asked for a draft or review-first flow.
7. Report the Slack result back in chat.
   - For webhook sends, report whether the webhook returned success.
   - For connector fallback sends or drafts, include the message link or draft channel link.

## Failure Handling

- If `SLACK_ME_WEBHOOK_URL` is missing from root `.env.local`, say so and ask the user to add it; do not send.
- If Slack is disconnected or the current user cannot be resolved, say that Slack access is unavailable and ask the user to reconnect the Slack plugin.
- If the webhook request fails, report the HTTP response and fall back to the Slack connector send path when available.
- If a draft already exists, stop and tell the user Slack cannot overwrite the existing attached draft.
- If the message depends on missing task context, ask for that content instead of sending a vague placeholder.
- If the user asks to Slack them a future reminder, prefer the Slack reminder tool when available; otherwise ask whether they want a scheduled Slack message.
