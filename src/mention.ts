import type { Client, Message } from "discord.js";
import { AiNotReadyError, reply, type ChatMessage } from "./ai.ts";

const CONTEXT_MESSAGES = 10;
// Older messages belong to another conversation, and old bad answers would teach the model to repeat them
const CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

const NOT_READY_REPLY = "Eg held enno på å vakne, hjernen min kjem rennande inn frå internett. Prøv igjen om eit minutt eller to!";
const ERROR_REPLY = "Uff, hjernen min er full i fiskeslim akkurat no. Prøv igjen om litt!";

// Turns <@123> mentions into readable @names so the model sees who is talked about
function cleanContent(message: Message) {
  return message.content
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const member = message.mentions.members?.get(id);
      return `@${member?.displayName ?? message.mentions.users.get(id)?.displayName ?? "nokon"}`;
    })
    .trim();
}

// Of the bot's own messages, only its AI answers are conversation; the model copies whatever it sees itself say,
// so fixed replies and daily wisdom posts (which are not replies) stay out
function isAiAnswer(m: Message) {
  return m.reference !== null && m.content !== NOT_READY_REPLY && m.content !== ERROR_REPLY;
}

// The recent conversation in the channel, oldest first. The bot's own answers become "assistant" turns.
async function conversation(message: Message, botId: string): Promise<ChatMessage[]> {
  // Without Read Message History in the channel this fails; answer the message alone then
  const earlier = await message.channel.messages
    .fetch({ limit: CONTEXT_MESSAGES, before: message.id })
    .catch(() => new Map<string, Message>());
  return [...earlier.values(), message]
    .filter((m) => m.content && message.createdTimestamp - m.createdTimestamp <= CONTEXT_MAX_AGE_MS)
    .filter((m) => m.author.id !== botId || isAiAnswer(m))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((m) =>
      m.author.id === botId
        ? { role: "assistant", content: m.content }
        : { role: "user", content: `${m.member?.displayName ?? m.author.displayName}: ${cleanContent(m)}` },
    );
}

export async function handleMention(client: Client<true>, message: Message) {
  if (message.author.bot || !message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })) return;
  if (!message.channel.isSendable()) return;

  // Discord shows "is typing" for about 10 seconds; keep it alive while the model thinks
  const channel = message.channel;
  await channel.sendTyping();
  const typing = setInterval(() => channel.sendTyping().catch(() => {}), 8000);

  try {
    const botName = message.guild?.members.me?.displayName ?? client.user.displayName;
    const answer = await reply(botName, await conversation(message, client.user.id));
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
