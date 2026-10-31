# PvG bot

A Discord bot written in TypeScript (discord.js) that runs as a container.

## Setup

1. Get the two required values (Developer Portal)
   Open your application at https://discord.com/developers/applications.

Application ID → General Information page → copy Application ID. This is DISCORD_CLIENT_ID.
Bot token → Bot page → Reset Token → copy it. This is DISCORD_TOKEN.
You only see the token once. If you lose it, reset it again. It's a password, so never commit it. .env and secret.yaml are already in .gitignore.
On the same page you can leave the Privileged Gateway Intents (Presence, Server Members, Message Content) off. The bot only uses the basic Guilds intent (src/index.ts:26).

2. Get your server ID (optional, but recommended while developing)
   In the Discord app, go to User Settings → Advanced → Developer Mode and turn it on.
   Right-click your server's icon → Copy Server ID. This is DISCORD_GUILD_ID.
   With this set, slash commands show up in that server straight away. Without it, they register globally, and that can take up to an hour.

3. Invite the bot to your server
   In the portal, go to OAuth2 → URL Generator.
   Under Scopes, tick bot and applications.commands.
   Under Bot Permissions, tick at least Send Messages. View Channels is also sensible.
   Copy the generated URL at the bottom, open it in a browser, pick your server and authorise. You need the "Manage Server" permission on that server.
   The bot will now be listed as a member, but it shows as offline until you run it.

## Run

With `podman kube play`:

```sh
cp secret.example.yaml secret.yaml       # fill in the values
podman kube play secret.yaml             # creates the "pvg-bot" podman secret
podman build -t localhost/pvg-bot:latest .
podman kube play --replace pod.yaml
podman logs -f pvg-bot-bot
```

To deploy a new version, rebuild the image and run `podman kube play --replace pod.yaml` again. To change the secret, first run `podman secret rm pvg-bot`, then play `secret.yaml` again. Stop the bot with `podman kube down pod.yaml`.

With compose:

```sh
cp .env.example .env                     # fill in the values
podman compose up -d --build
podman compose logs -f
```

Locally, for development (restarts on file changes):

```sh
npm install
npm run dev
```

## Commands

| Command   | What it does                                                  |
| --------- | ------------------------------------------------------------- |
| `/hei`    | Replies with a greeting                                       |
| `/poppel` | Posts a random sentence from poppel.news, linking to the issue |

To add a command, create a file in `src/commands/` modelled on `hei.ts` and add it to `src/commands/index.ts`. All user-facing text is in nynorsk (see `AGENTS.md`). Commands are registered with Discord each time the bot starts.
