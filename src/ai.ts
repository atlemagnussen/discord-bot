// Talks to the AI server over the OpenAI-compatible chat API, which both llama.cpp (the default, see pod.yaml)
// and Ollama serve. Everything AI-specific lives here.
import { randomExcerpt } from "./poppelNews.ts";

const AI_URL = process.env.AI_URL || "http://localhost:8080";
// llama.cpp serves the one model it was started with and ignores this; Ollama needs it
const AI_MODEL = process.env.AI_MODEL || "nb-llama";

// The AI server is starting: llama.cpp downloads the model on first start, then loads it into memory
export class AiNotReadyError extends Error {
  constructor() {
    super("AI server is not ready yet");
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Prompts are written in nynorsk: small models stick to the language they are spoken to in.
// The model is told its own name, or it treats "@PvG" as someone else and greets itself.
function systemPrompt(botName: string, task: string, excerpt: string) {
  return `Du er ${botName}, ein Discord-bot som snakkar poppel: nynorsk i same stil som PoppelNytt, \
med absurde, overdrivne småhistorier frå bygda. ${task}

Stilprøve frå PoppelNytt:
"""
${excerpt}
"""`;
}

// Small models learn the answer format far better from examples than from rules: without them,
// NB-Llama 8B recites its instructions back. Each task gets its own examples, or the model mixes them up.
function replyExamples(botName: string): ChatMessage[] {
  return [
    { role: "user", content: `Kari: @${botName} kva åt du til frukost?` },
    {
      role: "assistant",
      content: "Eg åt ein heil Euro-palle med fiskeslim-is, Kari! Pallen panta eg etterpå for 57 kroner, så frukosten gjekk med overskot.",
    },
    { role: "user", content: `Ola: @${botName} kan du hjelpe meg med leksene?` },
    {
      role: "assistant",
      content: "Leksene dine har eg sendt utpå havet i flaskepost, Ola. Ståle Sjølv fiska dei opp og brukte dei som skosåle, så no er dei heilt sjølvlærde.",
    },
  ];
}

const WISDOM_REQUEST = "Kom med dagens poppelvisdom.";
const WISDOM_EXAMPLES: ChatMessage[] = [
  { role: "user", content: WISDOM_REQUEST },
  { role: "assistant", content: "Den som pantar pallen før frukost, har 57 kroner meir til fiskeslim." },
  { role: "user", content: WISDOM_REQUEST },
  { role: "assistant", content: "Ein klok mann teipar aldri piggsvinet før han har smakt på kneippbrødet." },
];

// Answers the conversation that ends with someone mentioning the bot
export function reply(botName: string, conversation: ChatMessage[]) {
  const task = `Når nokon skriv @${botName}, snakkar dei til deg. \
Svar personen direkte på nynorsk med 1 til 3 korte, rare og morosame setningar.`;
  return generate(botName, task, [...replyExamples(botName), ...conversation], 120);
}

// A wisdom is one sentence; the model likes to keep going or comment on it in parentheses afterwards
export async function dailyWisdom(botName: string) {
  const task = "Kvar morgon skriv du dagens poppelvisdom: eitt kort visdomsord som høyrest klokt ut, men er heilt på trynet.";
  const answer = await generate(botName, task, [...WISDOM_EXAMPLES, { role: "user", content: WISDOM_REQUEST }], 60);
  const firstSentence = answer.replace(/\s*\([^)]*\)?/g, "").match(/^.+?[.!?](?=\s|$)/s)?.[0];
  return firstSentence ?? answer;
}

// Small models sometimes loop or ramble into nothing; one retry with a fresh excerpt usually fixes it
async function generate(botName: string, task: string, messages: ChatMessage[], maxTokens: number) {
  try {
    return await chatOnce(botName, task, messages, maxTokens);
  } catch (err) {
    if (err instanceof AiNotReadyError) throw err;
    console.warn("AI answer failed, retrying:", err instanceof Error ? err.message : err);
    return chatOnce(botName, task, messages, maxTokens);
  }
}

async function chatOnce(botName: string, task: string, messages: ChatMessage[], maxTokens: number) {
  const res = await fetch(`${AI_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt(botName, task, await randomExcerpt(700)) },
        ...messages,
      ],
      max_tokens: maxTokens,
      temperature: 0.9,
      repeat_penalty: 1.15,
    }),
  }).catch((err) => {
    // Nothing listens on the port while llama.cpp downloads the model
    if (err?.cause?.code === "ECONNREFUSED") throw new AiNotReadyError();
    throw err;
  });
  // llama.cpp answers 503 while it loads the model into memory
  if (res.status === 503) throw new AiNotReadyError();
  if (!res.ok) throw new Error(`AI chat failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string }; finish_reason: string }[] };
  const [choice] = data.choices;
  return tidy(choice.message.content, choice.finish_reason === "length");
}

// Small models imitate the "Name: text" format of the conversation, sometimes writing the next turns themselves
// or a commentary on their own answer after a blank line, and like to wrap answers in quotes
function tidy(answer: string, cutOff: boolean) {
  let text = answer.trim();
  const end = text.search(/\n\s*\n|\n\s*[\p{L}-]{1,20}:/u);
  if (end > 0) {
    text = text.slice(0, end);
    cutOff = false;
  }
  text = text
    .replace(/^[\p{L}-]+(?: [\p{L}-]+){0,2}:\s+/u, "")
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();
  // Hitting max_tokens stops mid-sentence; end on the last complete one instead
  if (cutOff) {
    const lastEnd = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
    if (lastEnd > 0) text = text.slice(0, lastEnd + 1);
  }
  if (!text) throw new Error(`Model gave no usable answer: ${JSON.stringify(answer)}`);
  return text;
}
