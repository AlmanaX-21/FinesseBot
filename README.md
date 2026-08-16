# FinesseBot - Discord Role Assignment Bot

A soft-coded, modular Discord bot that automatically tracks member activity and assigns roles based on:
1. **Message Count** — Number of messages sent in the server.
2. **Server Tenure** — Number of days spent in the server.
3. **Combined Criteria** — Requiring both message threshold and tenure threshold.

---

## Features

- **Soft-Coded Configuration**: Add or edit role requirements in `config.json` without modifying any code.
- **Dual Matching**: Matches roles by Discord Role Snowflake ID or by Role Name.
- **Live Tracking & Periodic Sync**: Instantly evaluates roles on new messages and runs periodic background sweeps for server tenure.
- **Built-in Slash Commands**:
  - `/finesse role-add <role> [message_count] [days_in_server]`: Adds or updates a role threshold rule in `config.json` and syncs members.
  - `/finesse role-remove <role>`: Removes a role rule from `config.json`.
  - `/finesse list`: Lists all configured automated role rules.
  - `/check [target]`: Displays message count, days in server, unlocked roles, and missing requirements for upcoming roles.
  - `/syncroles`: Admin command (`Manage Roles` permission) to audit and synchronize all server members.
- **Crash-Resilient Persistence**: Lightweight, atomic local store (`data/stats.json`) preserving member stats across restarts.
- **Kinetic Hosting Ready**: Zero native compilation dependencies, fully compatible with standard Node.js containers.

---

## Configuration Guide (`config.json`)

All role rules are defined in [config.json](file:///c:/Users/Kanishq/OneDrive/Documents/PersonalProjects/FinesseBot/config.json).

```json
{
  "checkIntervalMinutes": 60,
  "roles": [
    {
      "name": "Chat Enthusiast",
      "roleId": null,
      "messageCount": 100,
      "timeInServerDays": null
    },
    {
      "name": "Month Veteran",
      "roleId": null,
      "messageCount": null,
      "timeInServerDays": 30
    },
    {
      "name": "Dedicated Member",
      "roleId": "123456789012345678",
      "messageCount": 500,
      "timeInServerDays": 180
    }
  ]
}
```

### Configuration Fields

| Field | Type | Description |
|---|---|---|
| `checkIntervalMinutes` | `number` | How often (in minutes) to perform a full server scan for tenure-based roles. |
| `name` | `string` | The exact Discord role name (used if `roleId` is null or not found). |
| `roleId` | `string \| null` | (Optional) The Discord Role ID. Preferred for stability against role renames. |
| `messageCount` | `number \| null` | Minimum message count required. Set `null` to ignore. |
| `timeInServerDays` | `number \| null` | Minimum days in the server required. Set `null` to ignore. |

### How to Add or Modify Role Requirements

1. **Add a message-only role**:
   Set `messageCount` to your desired number and `timeInServerDays` to `null`.
2. **Add a time-only role**:
   Set `timeInServerDays` to your desired number of days and `messageCount` to `null`.
3. **Add a combined requirement**:
   Set both `messageCount` and `timeInServerDays`. Members must fulfill **both** criteria.
4. **Save and restart or reload**: The bot reads `config.json` on startup.

---

## Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and navigate to the **Bot** tab.
3. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** (Required for reading join dates and role assignment)
   - **Message Content Intent** (Required if tracking message events)
4. Click **Reset Token** and copy the bot token.
5. Go to **OAuth2 > URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`
   - Copy the generated URL and invite the bot to your server.
6. **Role Hierarchy Note**: In your Discord Server Settings > Roles, make sure the bot's role is positioned **above** the roles it is configured to assign.

---

## Local Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file based on `.env.example`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=your_server_id_here
```

### 3. Build & Run
```bash
# Build TypeScript
npm run build

# Start bot
npm start

# Or run development mode with auto-reload
npm run dev
```

### 4. Run Tests
```bash
npm test
```

---

## Deploying to Kinetic Hosting

Kinetic Hosting provides standard Node.js server environments via a Pterodactyl-based panel.

### Step 1: Prepare the Files
1. Build the project locally or let Kinetic build it:
   ```bash
   npm run build
   ```
2. Archive the following files into a `.zip` archive (exclude `node_modules`):
   - `dist/`
   - `src/`
   - `config.json`
   - `package.json`
   - `package-lock.json`
   - `tsconfig.json`

### Step 2: Upload to Kinetic Hosting Panel
1. Log in to your **Kinetic Hosting Game/Bot Panel**.
2. Navigate to your Discord Bot Server.
3. Open the **Files** manager tab.
4. Upload the `.zip` archive and click **Unarchive**.

### Step 3: Configure Environment Variables
In the panel:
- Open **Startup** settings or create a `.env` file in the root directory:
  ```env
  DISCORD_TOKEN=your_bot_token_here
  CLIENT_ID=your_application_client_id_here
  GUILD_ID=your_guild_id_here
  CONFIG_PATH=./config.json
  DATA_PATH=./data/stats.json
  ```

### Step 4: Configure Startup Command & Node.js Version
1. In the **Startup** tab:
   - Ensure the Node.js version is set to **Node.js 18**, **20**, or **22**.
   - Set the Main / Start command to:
     ```bash
     npm run build && npm start
     ```
     *(Or simply `npm start` if `dist/` is already uploaded).*
2. Go to the **Console** tab and start the server.
3. The panel will automatically run `npm install` on first boot and launch `dist/index.js`.
