# PvG bot

A Discord bot written in TypeScript (discord.js) that runs as a container.

## Setup

1. Create an application at https://discord.com/developers/applications.
2. Invite the bot to your server: **OAuth2 → URL Generator**, scopes `bot` + `applications.commands`.
3. Fill in the settings for how you run it (see below).

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

| Command  | What it does          |
| -------- | --------------------- |
| `/hello` | Replies with a greeting |

To add a command, create a file in `src/commands/` modelled on `hello.ts` and add it to `src/commands/index.ts`. Commands are registered with Discord each time the bot starts.
