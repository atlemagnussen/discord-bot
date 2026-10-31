import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "./types.ts";

const BASE_URL = "https://www.poppel.news/";
const LOGO_URL = "https://storage.googleapis.com/static-logout/poppel/favicon.png";

async function fetchHtml(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.text();
}

function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// The homepage lists every published issue as a relative link, e.g. ./nytt/poppel-2001-1.html
async function articleUrls() {
  const html = await fetchHtml(BASE_URL);
  const paths = html.matchAll(/href="\.\/((?:nytt|special)\/[^"]+\.html)"/g);
  return [...new Set([...paths].map((m) => new URL(m[1], BASE_URL).href))];
}

function parseArticle(html: string) {
  const title = decodeEntities(html.match(/<title>(.*?)(?: \| PoppelNytt)?<\/title>/)?.[1] ?? "PoppelNytt");
  const text = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => decodeEntities(m[1].replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")))
    .join(" ")
    .replace(/\s+/g, " ");
  // Skip fragments like "SÅ, neste Poppel:" and run-on walls of text
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400);
  return { title, sentences };
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export const poppel: Command = {
  data: new SlashCommandBuilder()
    .setName("poppel")
    .setDescription("Hent ein tilfeldig Poppel frå PoppelNytt"),
  async execute(interaction) {
    await interaction.deferReply();

    const url = pick(await articleUrls());
    const { title, sentences } = parseArticle(await fetchHtml(url));
    if (sentences.length === 0) throw new Error(`No sentences found in ${url}`);

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
