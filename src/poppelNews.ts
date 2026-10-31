// Scrapes issues from poppel.news. Used by /poppel and as style inspiration for the AI.

export const BASE_URL = "https://www.poppel.news/";
export const LOGO_URL = "https://storage.googleapis.com/static-logout/poppel/favicon.png";

export interface Article {
  url: string;
  title: string;
  sentences: string[];
}

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

// The homepage lists every published issue as a relative link, e.g. ./nytt/poppel-2001-1.html.
// Pages not linked from there are drafts and are ignored.
async function articleUrls() {
  const html = await fetchHtml(BASE_URL);
  const paths = html.matchAll(/href="\.\/((?:nytt|special)\/[^"]+\.html)"/g);
  return [...new Set([...paths].map((m) => new URL(m[1], BASE_URL).href))];
}

function parseArticle(url: string, html: string): Article {
  const title = decodeEntities(html.match(/<title>(.*?)(?: \| PoppelNytt)?<\/title>/)?.[1] ?? "PoppelNytt");
  const text = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => decodeEntities(m[1].replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")))
    .join(" ")
    .replace(/\s+/g, " ");
  // Skip fragments like "SÅ, neste Poppel:" and run-on walls of text
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400);
  return { url, title, sentences };
}

export function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function randomArticle() {
  const url = pick(await articleUrls());
  const article = parseArticle(url, await fetchHtml(url));
  if (article.sentences.length === 0) throw new Error(`No sentences found in ${url}`);
  return article;
}

// A run of consecutive sentences from a random issue, up to maxLength characters
export async function randomExcerpt(maxLength = 1500) {
  const { sentences } = await randomArticle();
  let i = Math.floor(Math.random() * sentences.length);
  let excerpt = "";
  for (; i < sentences.length && excerpt.length + sentences[i].length < maxLength; i++) {
    excerpt += sentences[i] + " ";
  }
  return excerpt.trim() || sentences[0];
}
