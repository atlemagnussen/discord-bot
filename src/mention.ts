import type { Client, Message } from "discord.js";
import { chat, type ChatMessage } from "./ai.ts";

const CONTEXT_MESSAGES = 10;

// Turns <@123> mentions into readable @names so the model sees who is talked about
function cleanContent(message: Message) {
  return message.content
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const member = message.mentions.members?.get(id);
      return `@${member?.displayName ?? message.mentions.users.get(id)?.displayName ?? "nokon"}`;
    })
    .trim();
}

// The recent conversation in the channel, oldest first. The bot's own messages become "assistant" turns.
async function conversation(message: Message, botId: string): Promise<ChatMessage[]> {
  // Without Read Message History in the channel this fails; answer the message alone then
  const earlier = await message.channel.messages
    .fetch({ limit: CONTEXT_MESSAGES, before: message.id })
    .catch(() => new Map<string, Message>());
  return [...earlier.values(), message]
    .filter((m) => m.content)
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
    const answer = await chat(await conversation(message, client.user.id));
    // The model may write "@everyone"; never let generated text ping anyone
    await message.reply({ content: answer.slice(0, 2000), allowedMentions: { parse: [], repliedUser: false } });
  } catch (err) {
    console.error("Error answering mention:", err);
    await message.reply("Uff, hjernen min er full i fiskeslim akkurat no. Prøv igjen om litt!");
  } finally {
    clearInterval(typing);
  }
}
