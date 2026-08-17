import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

dotenv.config();
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes
} from 'discord.js';
import { loadConfig } from './config.js';
import { MemberStore } from './database.js';
import { syncMemberRoles, syncGuildRoles } from './assigner.js';
import { commands } from './commands/index.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token) {
  throw new Error('DISCORD_TOKEN environment variable is required');
}

const config = loadConfig();
const store = new MemberStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

async function registerSlashCommands(appId: string): Promise<void> {
  try {
    const rest = new REST({ version: '10' }).setToken(token!);
    const body = commands.map(c => c.data.toJSON());

    if (guildId && guildId.trim().length > 0) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
      console.log(`Registered guild slash commands (${guildId})`);
    } else {
      await rest.put(Routes.applicationCommands(appId), { body });
      console.log('Registered global slash commands');
    }
  } catch (error) {
    console.error('[Slash Command Error]:', error);
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await registerSlashCommands(readyClient.user.id);

  const minutes = Math.min(10, Math.max(5, config.checkIntervalMinutes || 5));
  const intervalMs = minutes * 60 * 1000;
  console.log(`Periodic role sweep scheduled every ${minutes} minutes`);

  setInterval(async () => {
    try {
      for (const [, guild] of readyClient.guilds.cache) {
        await syncGuildRoles(guild, config.roles, store);
      }
    } catch (err) {
      console.error('[Periodic Sweep Error]:', err);
    }
  }, intervalMs);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) {
    return;
  }

  const count = store.increment(message.guild.id, message.author.id);
  await syncMemberRoles(member, config.roles, count).catch(err => {
    console.warn('[Message Sync Error]:', err);
  });
});

client.on(Events.GuildMemberAdd, async member => {
  if (member.user.bot) {
    return;
  }
  const stats = store.getStats(member.guild.id, member.id);
  await syncMemberRoles(member, config.roles, stats.messageCount).catch(err => {
    console.warn('[Join Sync Error]:', err);
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.find(c => c.data.name === interaction.commandName);
  if (!command) {
    return;
  }

  try {
    await command.execute(interaction, config, store);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred.';
    console.error(`[Command Error] /${interaction.commandName}:`, error);

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: `❌ **Error:** ${errorMsg}` });
      } else {
        await interaction.reply({ content: `❌ **Error:** ${errorMsg}`, ephemeral: true });
      }
    } catch (replyErr) {
      console.error('[Command Error] Could not send error reply:', replyErr);
    }
  }
});

function handleShutdown(): void {
  store.saveSync();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

client.login(token);
