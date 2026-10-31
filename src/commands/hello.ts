import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.ts";

export const hello: Command = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Say hello to the bot"),
  async execute(interaction) {
    await interaction.reply(`Hello, ${interaction.user.displayName}! 👋`);
  },
};
