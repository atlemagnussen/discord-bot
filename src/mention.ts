import type { Client, Message } from "discord.js";
import { AiNotReadyError, reply } from "./ai.ts";

const CONTEXT_MESSAGES = 10;
// Older messages belong to another conversation
const CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

const NOT_READY_REPLY = "Eg held enno på å vakne, hjernen min kjem rennande inn frå internett. Prøv igjen om eit minutt eller to!";
const ERROR_REPLY = "Uff, hjernen min er full i fiskeslim akkurat no. Prøv igjen om litt!";

// Turns <@123> and <@&123> mentions into readable @names so the model sees who is talked about
function cleanContent(message: Message) {
  return message.content
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const member = message.mentions.members?.get(id);
      return `@${member?.displayName ?? message.mentions.users.get(id)?.displayName ?? "nokon"}`;
    })
    .replace(/<@&(\d+)>/g, (_, id) => {
      // The bot's own role means the bot, whatever the role is called
      const me = message.guild?.members.me;
      if (me && id === me.roles.botRole?.id) return `@${me.displayName}`;
      return `@${message.mentions.roles.get(id)?.name ?? "nokon"}`;
    })
    .trim();
}

// Discord's autocomplete offers both the bot user and its role, which has the same name; people pick either
function mentionsBot(client: Client<true>, message: Message) {
  if (message.mentions.users.has(client.user.id)) return true;
  const botRole = message.guild?.members.me?.roles.botRole;
  return !!botRole && message.mentions.roles.has(botRole.id);
}

function asLine(m: Message) {
  return `${m.member?.displayName ?? m.author.displayName}: ${cleanContent(m)}`;
}

// What people wrote in the channel before this message, oldest first, as "Name: text" lines.
// The bot's own messages stay out: the model copies whatever it sees itself say, so one odd answer would repeat.
async function earlierLines(message: Message) {
  // Without Read Message History in the channel this fails; answer the message alone then
  const earlier = await message.channel.messages
    .fetch({ limit: CONTEXT_MESSAGES, before: message.id })
    .catch(() => new Map<string, Message>());
  return [...earlier.values()]
    .filter((m) => m.content && message.createdTimestamp - m.createdTimestamp <= CONTEXT_MAX_AGE_MS)
    .filter((m) => !m.author.bot)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(asLine);
}

export async function handleMention(client: Client<true>, message: Message) {
  if (message.author.bot || !mentionsBot(client, message)) return;
  if (!message.channel.isSendable()) return;

  // Discord shows "is typing" for about 10 seconds; keep it alive while the model thinks
  const channel = message.channel;
  await channel.sendTyping();
  const typing = setInterval(() => channel.sendTyping().catch(() => {}), 8000);

  try {
    const botName = message.guild?.members.me?.displayName ?? client.user.displayName;
    const answer = await reply(botName, asLine(message), await earlierLines(message));
    // The model may write "@everyone"; never let generated text ping anyone
    await message.reply({ content: answer.slice(0, 2000), allowedMentions: { parse: [], repliedUser: false } });
  } catch (err) {
    if (err instanceof AiNotReadyError) {
      console.log("Mention while the AI server is still starting");
      await message.reply(NOT_READY_REPLY);
      return;
    }
    console.error("Error answering mention:", err);
    await message.reply(ERROR_REPLY);
  } finally {
    clearInterval(typing);
  }
}
