# FinesseBot

A Discord bot for activity roles, commission tickets, and editable response tags.

## Features

- Assigns roles from message-count and server-tenure rules.
- Receives commission requests from the portfolio ticket API.
- Lets clients claim and staff close private commission channels.
- Serves Discord Markdown responses from editable tag files.

## Filesystem tags

The `tagPrefix` value in `config.json` controls the shared prefix. It accepts one to five non-whitespace characters and defaults to `!`.

To add `!question`, create `tags/question.md` and put the response in that file. Changes, additions, and deletions take effect on the next invocation without restarting the bot.

Tag filenames must:

- Use lowercase letters, numbers, and hyphens.
- End in `.md`.
- Be no longer than 64 characters before the extension.
- Stay directly inside the tags directory.

The first message token selects the tag, so `!question more context` still sends `question.md`. Matching is case-insensitive. Unknown tags stay silent, and each member can invoke one recognized tag every five seconds.

Responses support Discord Markdown and can contain up to 8,000 characters. Longer responses are split into Discord-sized messages. Mentions stored inside tag files do not notify anyone.

If the invocation includes user or role mentions, up to ten unique permitted mentions are sent in a separate final message under `Attention`. User mentions are allowed. Role mentions are allowed when the role is mentionable or the sender has the Mention Everyone permission in that channel. `@everyone` and `@here` are always blocked. The attention message does not count toward the tag file's 8,000-character limit.

Members can use `!tag-list` to receive an alphabetized list through DMs. If their DMs are closed, the bot posts a short notice in the source channel. The name `tag-list` is reserved.

Set `TAGS_PATH` to use a directory other than `./tags`. Prefix changes require a bot restart.

## Discord setup

Enable Server Members Intent and Message Content Intent in the Discord Developer Portal. The bot also needs Mention Everyone permission to repeat non-mentionable role pings from authorized members. Copy `.env.example` to `.env`, fill in the required values, then run:

```powershell
npm install
npm run build
npm start
```
