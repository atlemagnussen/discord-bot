import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.ts";

export const hei: Command = {
  data: new SlashCommandBuilder()
    .setName("hei")
    .setDescription("Sei hei til boten"),
  async execute(interaction) {
    await interaction.reply(`Hei, ${interaction.user.displayName}! 👋`);
  },
};
