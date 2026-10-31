import type { Client } from "discord.js";
import { chat } from "./ai.ts";

const TIME_ZONE = "Europe/Oslo";
const POST_AT = "07:57";

const osloClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// The model tends to add a heading and an explanation around the wisdom; keep only the wisdom itself
function extractWisdom(answer: string) {
  const quoted = answer.match(/"([^"\n]{15,})"/)?.[1];
  if (quoted) return quoted.trim();
  const lines = answer.split("\n").map((l) => l.replace(/\*\*/g, "").trim());
  return lines.find((l) => l && !l.endsWith(":")) ?? answer;
}

export async function postWisdom(client: Client<true>, channelId: string) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error(`Channel ${channelId} not found or not sendable`);

  const answer = await chat([
    {
      role: "user",
      content:
        "Kom med dagens poppelvisdom: eitt kort visdomsord som høyrest klokt ut, men er heilt på trynet. " +
        "Skriv berre sjølve visdomsordet, utan innleiing.",
    },
  ]);
  const wisdom = extractWisdom(answer);
  await channel.send({
    content: `🌅 **Dagens poppelvisdom**\n> ${wisdom.replace(/\n/g, "\n> ")}`.slice(0, 2000),
    allowedMentions: { parse: [] },
  });
  console.log(`Posted daily wisdom to ${channelId}`);
}

// Checks the Oslo wall clock every 20 seconds, which handles daylight saving without any date maths
export function scheduleDailyWisdom(client: Client<true>, channelId: string | undefined) {
  if (!channelId) {
    console.log("DAILY_CHANNEL_ID not set, daily wisdom disabled");
    return;
  }
  console.log(`Daily wisdom scheduled for ${POST_AT} ${TIME_ZONE} in channel ${channelId}`);

  let lastPosted = "";
  setInterval(() => {
    const [date, time] = osloClock.format(new Date()).split(" ");
    if (time !== POST_AT || lastPosted === date) return;
    lastPosted = date;
    postWisdom(client, channelId).catch((err) => console.error("Error posting daily wisdom:", err));
  }, 20_000);
}
