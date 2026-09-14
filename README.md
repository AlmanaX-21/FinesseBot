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

## Bluehost deployment

The production bot runs on the Ubuntu VPS at `129.121.141.212` as the `finessebot` systemd service. Caddy serves the ticket API through Cloudflare at [tickets.almanax21.com](https://tickets.almanax21.com/health) and renews its HTTPS certificate automatically.

| Resource | Server path |
| --- | --- |
| Current application | `/opt/finessebot/current` |
| Runtime credentials | `/etc/finessebot/environment` |
| Role and prefix configuration | `/var/lib/finessebot/config.json` |
| Editable tags | `/var/lib/finessebot/tags/` |
| Message counts | `/var/lib/finessebot/stats.json` |
| Ticket database | `/var/lib/finessebot/tickets.db` |
| Daily backups | `/var/backups/finessebot/` |

Run these commands through an authorized SSH session or the Bluehost terminal:

```bash
systemctl status finessebot
journalctl -u finessebot -n 100 --no-pager
systemctl restart finessebot
systemctl start finessebot-backup.service
systemctl list-timers finessebot-backup.timer
```

The service starts at boot and restarts automatically after the process exits. It runs under a dedicated account. Public inbound access is limited to SSH and HTTP/HTTPS; port 3000 is blocked externally.

Backups run daily around 03:30 UTC and retain 14 days on the VPS. They include a consistent SQLite snapshot, message counts, configuration, tags, and runtime credentials, with access restricted to root. These are server-local backups.

Vercel's portfolio project uses `BOT_API_URL=https://tickets.almanax21.com`. Its `BOT_API_SECRET` must match the server environment. Redeploy the portfolio after changing its environment variables.

No additional ticket staff role is configured. Existing Discord administrators retain access; set `STAFF_ROLE_ID` in the server environment and restart the bot to allow another role access to newly created tickets.

The September 14, 2026 migration preserved the available local message counts and recovered the existing unclaimed ticket from its pinned Discord details. Future deployments must preserve `/var/lib/finessebot` and `/etc/finessebot`.

### Manual deployment workflow

After the one-time SSH setup below, open **Actions → Deploy FinesseBot → Run workflow** and select `master`. The workflow installs dependencies, runs the tests and build, deploys a versioned release, restarts the service, and checks both the local and public health endpoints. A failed local health check restores the previous release automatically.

Install the root-owned deploy command on the VPS:

```bash
install -o root -g root -m 0755 ops/finessebot-deploy /usr/local/sbin/finessebot-deploy
```

Generate a dedicated ED25519 key outside the repository. Add its public key to `/root/.ssh/authorized_keys` with this forced command:

```text
restrict,command="/usr/local/sbin/finessebot-deploy" ssh-ed25519 YOUR_DEPLOY_PUBLIC_KEY
```

Verify the VPS ED25519 host-key fingerprint through the Bluehost terminal before trusting the result of `ssh-keyscan`. Add these secrets to the GitHub `Production` environment:

| Secret | Value |
| --- | --- |
| `BLUEHOST_DEPLOY_KEY` | Dedicated private key |
| `BLUEHOST_KNOWN_HOSTS` | Verified `129.121.141.212 ssh-ed25519 ...` line |

The workflow accepts manual runs from `master` only. It never writes to `/var/lib/finessebot` or `/etc/finessebot`. If `ops/finessebot-deploy` changes later, install the reviewed version on the VPS again before running the workflow.
