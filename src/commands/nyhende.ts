import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { AiNotReadyError, ERROR_REPLY, NOT_READY_REPLY, newsStory } from "../ai.ts";
import { BASE_URL, LOGO_URL } from "../poppelNews.ts";
import type { Command } from "./types.ts";

export const nyhende: Command = {
  data: new SlashCommandBuilder()
    .setName("nyhende")
    .setDescription("Boten skriv ei splitter ny sak til PoppelNytt")
    .addStringOption((option) =>
      option.setName("tema").setDescription("Kva skal saka handle om?").setMaxLength(100),
    ),
  async execute(interaction) {
    // A whole story takes the GPU 15-25 seconds; deferring gives us 15 minutes
    await interaction.deferReply();

    const topic = interaction.options.getString("tema") ?? undefined;
    const botName = interaction.guild?.members.me?.displayName ?? interaction.client.user.displayName;
    try {
      const story = await newsStory(botName, topic);
      const embed = new EmbedBuilder()
        .setColor(0xf5c518)
        .setAuthor({ name: "PoppelNytt", iconURL: LOGO_URL, url: BASE_URL })
        .setTitle(topic ? `Siste nytt om ${topic}` : "Siste nytt frå bygda")
        .setDescription(story.slice(0, 4000))
        .setFooter({ text: `Skrive av ${botName}, bestilt av ${interaction.user.displayName}` });
      // The model may write "@everyone"; never let generated text ping anyone
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (err) {
      if (err instanceof AiNotReadyError) {
        await interaction.editReply(NOT_READY_REPLY);
        return;
      }
      console.error("Error writing news story:", err);
      await interaction.editReply(ERROR_REPLY);
    }
  },
};
