// Talks to a local Ollama server. Everything AI-specific lives here, so swapping engine means rewriting this file.
import { randomExcerpt } from "./poppelNews.ts";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "hf.co/NbAiLab/nb-llama-3.1-8B-Instruct-Q4_K_M-GGUF";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// The prompt itself is written in nynorsk: small models stick to the language they are spoken to in.
function systemPrompt(excerpt: string) {
  return `Du er Poppel-boten på Discord-serveren til PvG. Du snakkar berre poppel: nynorsk i same stil som PoppelNytt. \
Det er absurde, overdrivne småhistorier og påstandar frå bygda, med rare personar, rar mat, pant, Ståle, \
Raske Rassgeirs Luta Lut og 57 kroner. Skriv alltid på nynorsk, same kva språk folk skriv til deg på. \
Svar kort, 1 til 4 setningar, morosamt og rart, og ver snill med folka på serveren.

Her er eit utdrag frå PoppelNytt. Bruk det som inspirasjon for stilen, ikkje kopier det:
"""
${excerpt}
"""`;
}

// Small models sometimes loop or ramble into nothing; one retry with a fresh excerpt usually fixes it
export async function chat(messages: ChatMessage[]) {
  try {
    return await chatOnce(messages);
  } catch (err) {
    console.warn("AI answer failed, retrying:", err instanceof Error ? err.message : err);
    return chatOnce(messages);
  }
}

async function chatOnce(messages: ChatMessage[]) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: "system", content: systemPrompt(await randomExcerpt()) }, ...messages],
      options: { num_ctx: 4096, num_predict: 200, temperature: 0.9, repeat_penalty: 1.15 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { message: { content: string }; done_reason?: string };
  return tidy(data.message.content, data.done_reason === "length");
}

// Small models imitate the "Name: text" format of the conversation, sometimes writing the next turns themselves,
// and like to wrap answers in quotes
function tidy(answer: string, cutOff: boolean) {
  let text = answer.trim();
  const nextTurn = text.search(/\n\s*[\p{L}-]{1,20}:/u);
  if (nextTurn > 0) {
    text = text.slice(0, nextTurn);
    cutOff = false;
  }
  text = text
    .replace(/^[\p{L}-]{1,20}:\s+/u, "")
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();
  // Hitting num_predict stops mid-sentence; end on the last complete one instead
  if (cutOff) {
    const lastEnd = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
    if (lastEnd > 0) text = text.slice(0, lastEnd + 1);
  }
  if (!text) throw new Error(`Model gave no usable answer: ${JSON.stringify(answer)}`);
  return text;
}

// Waits for Ollama to come up, then downloads the model if it isn't there yet (about 5 GB the first time)
export async function ensureModel() {
  for (;;) {
    try {
      const show = await fetch(`${OLLAMA_URL}/api/show`, { method: "POST", body: JSON.stringify({ model: MODEL }) });
      if (show.ok) {
        console.log(`AI model ${MODEL} is ready`);
        return;
      }
      break;
    } catch {
      console.log(`Waiting for Ollama at ${OLLAMA_URL}...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`Downloading AI model ${MODEL}...`);
  const res = await fetch(`${OLLAMA_URL}/api/pull`, { method: "POST", body: JSON.stringify({ model: MODEL }) });
  if (!res.ok || !res.body) throw new Error(`Ollama pull failed: ${res.status} ${await res.text()}`);

  // The pull streams one JSON object per line; log progress every 10%
  let buffer = "";
  let lastLogged = -1;
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const status = JSON.parse(line) as { status?: string; error?: string; total?: number; completed?: number };
      if (status.error) throw new Error(`Ollama pull failed: ${status.error}`);
      if (status.total && status.completed) {
        const percent = Math.floor((status.completed / status.total) * 10) * 10;
        if (percent > lastLogged) console.log(`Downloading AI model: ${percent}%`);
        lastLogged = Math.max(lastLogged, percent);
      }
    }
  }
  console.log(`AI model ${MODEL} is ready`);
}
