# Tag Commands

Each Markdown file in this directory creates one bot tag. The filename becomes the tag name, and the file contents become the response.

## Add a tag

Create a file named `question.md`:

```markdown
Here is the answer to the question.
```

With the default `!` prefix, send this in a server channel:

```text
!question
```

The bot posts the contents of `question.md` in that channel. Files are read when invoked, so additions, edits, and deletions work without restarting the bot.

## Include attention pings

Add user or role mentions after the tag name:

```text
!question @User @Role
```

The bot sends the saved answer first, followed by a separate `Attention` message containing up to ten unique permitted mentions.

- User mentions are supported.
- Mentionable roles are supported.
- Non-mentionable roles require the sender and bot to have Mention Everyone permission.
- `@everyone` and `@here` are always blocked.
- Mentions written inside a tag file do not notify anyone.

Other text may follow the tag name and is ignored:

```text
!question please check this @User
```

## List tags

Send `!tag-list` to receive an alphabetized list through DMs. If Discord blocks the DM, the bot posts a notice in the source channel.

## File rules

- Use lowercase letters, numbers, and hyphens in filenames.
- End every tag file with `.md`.
- Keep the name at 64 characters or fewer before `.md`.
- Put tag files directly in this directory; subdirectories are ignored.
- Give every tag a non-empty response.
- Keep each response at 8,000 characters or fewer.
- Do not use `tag-list.md`; that name is reserved.
- Add as many valid tag files as needed.

Valid filenames:

```text
help.md
server-rules.md
commission-prices.md
```

Invalid filenames:

```text
Server Rules.md
question_answer.md
tag-list.md
```

`README.md` is ignored because tag filenames must be lowercase.

## Configuration

The shared prefix is `tagPrefix` in the root `config.json` file:

```json
{
  "tagPrefix": "!"
}
```

The prefix must contain one to five characters without spaces. Restart the bot after changing it.

The `TAGS_PATH` environment variable can point the bot to another tag directory. It defaults to `./tags`.

## Troubleshooting

- No response: check the filename, lowercase spelling, `.md` extension, and file contents.
- Tags never respond: enable Message Content Intent for the bot in the Discord Developer Portal.
- Tag list does not arrive: allow direct messages from server members.
- A role does not ping: make the role mentionable or grant the required Mention Everyone permission.
- Repeated commands do nothing: each member has a five-second tag cooldown.
