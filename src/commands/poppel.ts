import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { BASE_URL, LOGO_URL, pick, randomArticle } from "../poppelNews.ts";
import type { Command } from "./types.ts";

export const poppel: Command = {
  data: new SlashCommandBuilder()
    .setName("poppel")
    .setDescription("Hent ein tilfeldig Poppel frå PoppelNytt"),
  async execute(interaction) {
    await interaction.deferReply();

    const { url, title, sentences } = await randomArticle();

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setAuthor({ name: "PoppelNytt", iconURL: LOGO_URL, url: BASE_URL })
      .setTitle(title)
      .setURL(url)
      .setDescription(`> ${pick(sentences)}`);
    const button = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Les heile saka")
      .setURL(url);

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    });
  },
};
