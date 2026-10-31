import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { commands } from "./commands/index.ts";
import { scheduleDailyWisdom } from "./daily.ts";
import { handleMention } from "./mention.ts";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
// Comma-separated, one channel per server that wants the daily wisdom
const dailyChannelIds = (process.env.DAILY_CHANNEL_ID ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
  process.exit(1);
}

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

const rest = new REST().setToken(token!);

// Registering to a single guild is instant, for testing; global registration reaches every server the bot is in
// but can take up to an hour to propagate.
async function registerCommands() {
  const body = commands.map((c) => c.data.toJSON());
  const route = guildId
    ? Routes.applicationGuildCommands(clientId!, guildId)
    : Routes.applicationCommands(clientId!);
  await rest.put(route, { body });
  console.log(`Registered ${body.length} command(s) ${guildId ? `to guild ${guildId}` : "globally"}`);
}

// Commands left over from testing with DISCORD_GUILD_ID would show up twice next to the global ones
async function clearGuildCommands(guildIds: string[]) {
  for (const id of guildIds) await rest.put(Routes.applicationGuildCommands(clientId!, id), { body: [] });
  console.log(`Cleared guild-only commands in ${guildIds.length} guild(s)`);
}

// MessageContent is privileged: it must also be enabled on the Developer Portal's Bot page
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}, in ${c.guilds.cache.size} guild(s)`);
  if (!guildId) {
    clearGuildCommands([...c.guilds.cache.keys()]).catch((err) => console.error("Error clearing guild commands:", err));
  }
  scheduleDailyWisdom(c, dailyChannelIds);
});

client.on(Events.MessageCreate, (message) => {
  handleMention(client as Client<true>, message).catch((err) => console.error("Error handling message:", err));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const reply = { content: "Uff, noko gjekk gale.", flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down`);
    await client.destroy();
    process.exit(0);
  });
}

await registerCommands();
await client.login(token);
