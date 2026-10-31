import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { commands } from "./commands/index.ts";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
  process.exit(1);
}

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

// Registering to a single guild is instant; global registration can take up to an hour to propagate.
async function registerCommands() {
  const rest = new REST().setToken(token!);
  const body = commands.map((c) => c.data.toJSON());
  const route = guildId
    ? Routes.applicationGuildCommands(clientId!, guildId)
    : Routes.applicationCommands(clientId!);
  await rest.put(route, { body });
  console.log(`Registered ${body.length} command(s) ${guildId ? `to guild ${guildId}` : "globally"}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const reply = { content: "Something went wrong.", flags: MessageFlags.Ephemeral } as const;
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
