// Talks to the AI server over the OpenAI-compatible chat API, which both llama.cpp (the default, see pod.yaml)
// and Ollama serve. Everything AI-specific lives here.
import { pick, randomExcerpt } from "./poppelNews.ts";

const AI_URL = process.env.AI_URL || "http://localhost:8080";
// llama.cpp serves the one model it was started with and ignores this; Ollama needs it
const AI_MODEL = process.env.AI_MODEL || "nb-llama";

export const NOT_READY_REPLY = "Eg held enno på å vakne, hjernen min kjem rennande inn frå internett. Prøv igjen om eit minutt eller to!";
export const ERROR_REPLY = "Uff, hjernen min er full i fiskeslim akkurat no. Prøv igjen om litt!";

// The AI server is starting: llama.cpp downloads the model on first start, then loads it into memory
export class AiNotReadyError extends Error {
  constructor() {
    super("AI server is not ready yet");
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Places from poppel.news, so the bot's stories happen in the same bygd. Each request gets a few at random:
// given all of them, the model crams every one into each answer.
const PLACES = [
  "Poppelvågen, vågen der Poppel skjer, med den årlege veitkakking-konkurransen",
  "Ura, steinura ved Poppelvågen",
  "Olden, dit folk tek feil buss og drikk seg fulle",
  "Oldengrotta i Olden, der det kanskje er gull",
  "Kjeldn', grenda med dei villaste festane",
  "Kjeldenvatnet, nedanfor den bratte bakken i Kjeldn'",
  "Skarabakken, der bussen til Fosnavåg alltid står fast",
  "Lia, der gammelbjørnen held til",
  "Urheim, der det meste endar",
  "Konnøl-pøbben, der det alltid er rabalder",
  "Per's Kro, med halvliter pils",
  "ØL-utsalet",
  "VIVO-butikken, som berre sel kubein, finlandshetter og kvikklunsj",
  "Tomte Fryseri, som frys fisken for deg",
  "Gratu Hotell i Sibir",
];
const PLACES_PER_PROMPT = 4;

// Prompts are written in nynorsk: small models stick to the language they are spoken to in.
// The model is told its own name, or it treats "@PvG" as someone else and greets itself.
function systemPrompt({ botName, task, background }: Prompt, excerpt: string) {
  const prompt = `Du er ${botName}, ein Discord-bot som snakkar poppel: nynorsk i same stil som PoppelNytt, \
med absurde, overdrivne småhistorier frå bygda. ${task}

Nokre stader i bygda: ${sample(PLACES, PLACES_PER_PROMPT).join("; ")}.

Stilprøve frå PoppelNytt:
"""
${excerpt}
"""`;
  if (!background) return prompt;
  return `${prompt}

Dette er skrive i kanalen like før, berre som bakgrunn:
"""
${background}
"""`;
}

interface Prompt {
  botName: string;
  task: string;
  background?: string;
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

// Given real poppel.news stories as examples, the model copied them word for word. Topics in every example and
// every request make it write about the topic instead. It still borrows catchy phrases from the examples,
// so each request gets two random ones from this pool. With one example it wrote less of a story.
const storyRequest = (topic: string) => `Skriv ein ny Poppel om ${topic}.`;
const STORY_EXAMPLES: [topic: string, story: string][] = [
  [
    "ei ny rundkøyring i bygda",
    "Kommunen opna i går ei splitter ny rundkøyring midt i bygda, med blomsterbed og ein svær stein av typen granitt. \
Problemet var berre at ingen hadde fortalt bygdefolket kvar ein skal køyre ut, så Arnfinn frå Poppelvågen har no køyrt rundt i tre døgn. \
Han lever av kneippbrød og fiskeslim som kona kastar inn vindauget kvar gong han passerer. \
Ordføraren seier rundkøyringa er ein stor suksess, sidan Arnfinn åleine står for 80 prosent av trafikken i kommunen.",
  ],
  [
    "dugnad på bedehuset",
    "Laurdag var det dugnad på bedehuset, og frammøtet var rekordstort med heile fire mann og ei geit. \
Geita vart sett til å klippe plenen, men åt i staden opp gardinene, ei salmebok og halve kakelotteriet. \
Formann Ståle Sjølv tok saka i eigne hender og måla heile bedehuset med fiskeslim, sidan det var den einaste målinga som var att i kjellaren. \
Geita er no vald inn i styret.",
  ],
  [
    "den nye bilen til lensmannen",
    "Lensmannen fekk i går levert ein ny politibil, og han er så fin at lensmannen ikkje tør å køyre han. \
I staden skubbar han bilen framfor seg på patrulje, med blålyset på og sirena i munnen. \
Tjuvane på Konnøl-pøbben har fått med seg dette og spring no berre litt fortare enn ein gamal mann med ein bil. \
«Det er god trening», seier lensmannen, som har gått ned 14 kilo og teke null tjuvar sidan nyttår.",
  ],
  [
    "vinteren",
    "Vinteren har kome til bygda med eit brak, og snøen ligg så høgt at postbodet berre leverer brev gjennom pipa. \
Bestemor Gudrun i Lia har ikkje sett gardstunet sidan oktober, men klarer seg fint på syltetøy og radioteater. \
Brøytebilen sette seg fast allereie første dag, og sjåføren har busett seg i førarhuset med kaffikjele og ein katt han fann i ei snøfonn. \
Kommunen har no sendt eit klagebrev til sola.",
  ],
  [
    "ein ny kafé",
    "Bygda har fått sin første kafé med caffe latte, og bøndene står i kø frå klokka fem kvar morgon. \
Ingen veit heilt kva ein latte er, så dei fleste ber om kaffi med ekstra mjølk og får ei bøtte rett frå fjøset. \
Eigaren, ein mann frå Oslo med skjegg av typen hipster, har allereie skifta namn på kafeen tre gonger. \
No heiter han «Bøtta», og det er bøndene svært nøgde med.",
  ],
];
// For /nyhende without a topic
const STORY_TOPICS = [
  "ein traktor som vann bingo",
  "17. mai-toget",
  "ei ku på rømmen",
  "den nye bensinstasjonen",
  "pølsefesten på samfunnshuset",
  "bygdas sterkaste mann",
  "fiskekonkurransen i fjorden",
  "ein elg i hagen til lensmannen",
  "russebussen",
  "ein storm som bles bort kyrkjespiret",
  "søppelhentinga",
  "ei hemmeleg vaffeloppskrift",
  "julebordet i grendalaget",
  "den nye sjefen på sagbruket",
  "veitkakking-konkurransen i Poppelvågen",
  "gullgraving i Oldengrotta",
  "bussen til Fosnavåg",
  "nyttårsfeiringa i Kjeldn'",
  "eit tilbod på VIVO-butikken",
];

const BACKGROUND_MAX_LENGTH = 1500;

// Answers one message that mentions the bot, as "Name: text". Earlier channel messages go into the system prompt
// as background: given as chat turns, the model continues the chat log instead of answering.
export async function reply(botName: string, message: string, earlier: string[]) {
  const task = `Når nokon skriv @${botName}, snakkar dei til deg. \
Svar personen direkte på nynorsk med 1 til 3 korte, rare og morosame setningar.`;
  const background = earlier.join("\n").slice(-BACKGROUND_MAX_LENGTH);
  const answer = await generate({ botName, task, background }, [...replyExamples(botName), { role: "user", content: message }], 120);
  // It sometimes addresses itself, copying the "@PvG" from the message
  return answer.replaceAll(`@${botName}`, "").replace(/ {2,}/g, " ").trim();
}

// A wisdom is one sentence; the model likes to keep going or comment on it in parentheses afterwards
export async function dailyWisdom(botName: string) {
  const task = "Kvar morgon skriv du dagens poppelvisdom: eitt kort visdomsord som høyrest klokt ut, men er heilt på trynet.";
  const answer = await generate({ botName, task }, [...WISDOM_EXAMPLES, { role: "user", content: WISDOM_REQUEST }], 60);
  const firstSentence = answer.replace(/\s*\([^)]*\)?/g, "").match(/^.+?[.!?](?=\s|$)/s)?.[0];
  return firstSentence ?? answer;
}

// Sentences that repeat the examples are dropped afterwards; with too few left, it tries again with other examples
const STORY_ATTEMPTS = 3;
const STORY_MIN_SENTENCES = 3;

// A whole PoppelNytt story about a topic, a random one if none is given
export async function newsStory(botName: string, topic = pick(STORY_TOPICS)) {
  const task = "No skriv du ei ny sak til PoppelNytt: ei absurd, overdriven småhistorie frå bygda, \
fortalt som om ho var heilt vanlege nyhende. Saka er eitt avsnitt på 4 til 8 setningar.";
  let best = "";
  for (let attempt = 1; attempt <= STORY_ATTEMPTS; attempt++) {
    const examples = sample(STORY_EXAMPLES, 2);
    const messages: ChatMessage[] = examples.flatMap(([exampleTopic, example]) => [
      { role: "user" as const, content: storyRequest(exampleTopic) },
      { role: "assistant" as const, content: example },
    ]);
    messages.push({ role: "user", content: storyRequest(topic) });
    const story = await generate({ botName, task }, messages, 350);

    const copied = new Set(examples.flatMap(([, example]) => wordRuns(example)));
    const sentences = story.match(/[^.!?]+(?:[.!?]+[»"]?|$)/g) ?? [story];
    const own = sentences.map((s) => s.trim()).filter((s) => !wordRuns(s).some((run) => copied.has(run)));
    if (own.length >= STORY_MIN_SENTENCES) return own.join(" ");
    console.warn(`Story copied ${sentences.length - own.length} of ${sentences.length} sentences from its examples (attempt ${attempt})`);
    if (own.join(" ").length > best.length) best = own.join(" ");
  }
  if (!best) throw new Error("Every story attempt copied its examples");
  return best;
}

function sample<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

// Every run of five consecutive words, to spot text copied from somewhere else
function wordRuns(text: string, runLength = 5) {
  const words = text.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
  return words.slice(runLength - 1).map((_, i) => words.slice(i, i + runLength).join(" "));
}

// Small models sometimes loop or ramble into nothing; one retry with a fresh excerpt usually fixes it
async function generate(prompt: Prompt, messages: ChatMessage[], maxTokens: number) {
  try {
    return await chatOnce(prompt, messages, maxTokens);
  } catch (err) {
    if (err instanceof AiNotReadyError) throw err;
    console.warn("AI answer failed, retrying:", err instanceof Error ? err.message : err);
    return chatOnce(prompt, messages, maxTokens);
  }
}

async function chatOnce(prompt: Prompt, messages: ChatMessage[], maxTokens: number) {
  const res = await fetch(`${AI_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt(prompt, await randomExcerpt(700)) },
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
    .replace(/[!?]{4,}/g, "?!")
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
