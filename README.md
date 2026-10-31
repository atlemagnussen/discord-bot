# PvG bot

A Discord bot written in TypeScript (discord.js) that runs as a container.

## Setup

1. Get the two required values (Developer Portal)
   Open your application at https://discord.com/developers/applications.

Application ID → General Information page → copy Application ID. This is DISCORD_CLIENT_ID.
Bot token → Bot page → Reset Token → copy it. This is DISCORD_TOKEN.
You only see the token once. If you lose it, reset it again. It's a password, so never commit it. .env and secret.yaml are already in .gitignore.
On the same page, under Privileged Gateway Intents, turn **Message Content Intent** on. The bot reads messages that mention it, and it fails to log in ("disallowed intents") without this. Presence and Server Members can stay off.

2. Get your server ID (optional, but recommended while developing)
   In the Discord app, go to User Settings → Advanced → Developer Mode and turn it on.
   Right-click your server's icon → Copy Server ID. This is DISCORD_GUILD_ID.
   With this set, slash commands show up in that server straight away. Without it, they register globally, and that can take up to an hour.

3. Invite the bot to your server
   In the portal, go to OAuth2 → URL Generator.
   Under Scopes, tick bot and applications.commands.
   Under Bot Permissions, tick View Channels, Send Messages, Send Messages in Threads, Read Message History, Embed Links and Add Reactions.
   Copy the generated URL at the bottom, open it in a browser, pick your server and authorise. You need the "Manage Server" permission on that server.
   The bot will now be listed as a member, but it shows as offline until you run it.

4. Choose a channel for the daily poppel wisdom (optional)
   Right-click the channel → Copy Channel ID. This is DAILY_CHANNEL_ID. Leave it empty to turn the daily post off.

## AI (llama.cpp on the GPU)

The bot answers @mentions and posts a daily wisdom using [NB-Llama 3.1 8B](https://huggingface.co/NbAiLab/nb-llama-3.1-8B-Instruct-Q4_K_M-GGUF) from the National Library of Norway, served by the [llama.cpp](https://github.com/ggml-org/llama.cpp) server in the `llama` container of the pod. The bot talks to it over the OpenAI-compatible chat API, so Ollama or any other compatible server works too (set `AI_URL`, and `AI_MODEL` for servers with several models). All AI code is in `src/ai.ts`.

The llama.cpp image is pinned to `server-cuda-b5121` because it is built with CUDA 12.4 and includes code for GTX 10-series (Pascal) cards, so it runs on a GTX 1060 with Debian 13's driver 550. Current llama.cpp and Ollama images need driver 570+ for those cards. With an RTX 30/40 card the pinned image works as well; an RTX 50 card needs a newer image and driver 570+.

Host requirements, once per machine:

- NVIDIA driver 550 or newer. Check with `nvidia-smi`.
- `nvidia-container-toolkit`, plus a CDI spec so podman can hand the GPU to containers:

  ```sh
  sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
  nvidia-ctk cdi list                      # should list nvidia.com/gpu=all
  ```

  Re-run the `generate` command after a driver upgrade or a GPU swap.

On first start the `llama` container downloads the model (about 5 GB) into the `pvg-bot-models` podman volume. `/hei` and `/poppel` work in the meantime; mentions get an error reply until it is done. The model stays in that volume across redeploys. To use another model, change `--hf-repo` and `--hf-file` in `pod.yaml` to any GGUF on Hugging Face.

## Run

With `podman kube play`:

```sh
cp secret.example.yaml secret.yaml       # fill in the values
podman kube play secret.yaml             # creates the "pvg-bot" podman secret
podman build -t localhost/pvg-bot:latest .
podman kube play --replace pod.yaml
podman logs -f pvg-bot-bot
podman logs -f pvg-bot-llama             # model download and GPU loading
```

In the `pvg-bot-llama` log, `found 1 CUDA devices` with your GPU name and `offloaded 33/33 layers to GPU` mean the model runs on the GPU. If the CUDA lines are missing, check the host requirements above.

To deploy a new version, rebuild the image and run `podman kube play --replace pod.yaml` again. To change the secret, first run `podman secret rm pvg-bot`, then play `secret.yaml` again. Stop the bot with `podman kube down pod.yaml`.

With compose:

```sh
cp .env.example .env                     # fill in the values
podman compose up -d --build
podman compose logs -f
```

Locally, for development (restarts on file changes). Mentions and the daily wisdom need the AI server on `localhost:8080`; run one with `podman run -d --device nvidia.com/gpu=all -p 8080:8080 -e LLAMA_CACHE=/models -v pvg-bot-models:/models ghcr.io/ggml-org/llama.cpp:server-cuda-b5121 --hf-repo NbAiLab/nb-llama-3.1-8B-Instruct-Q4_K_M-GGUF --hf-file nb-llama-3.1-8b-instruct-q4_k_m.gguf --n-gpu-layers 99 --ctx-size 4096 --host 0.0.0.0`.

```sh
npm install
npm run dev
```

## Commands

| Command   | What it does                                                  |
| --------- | ------------------------------------------------------------- |
| `/hei`    | Replies with a greeting                                       |
| `/poppel` | Posts a random sentence from poppel.news, linking to the issue |

Besides commands, the bot answers in poppel whenever someone @mentions it, using the last 10 messages in the channel as context. At 07:57 Norwegian time it posts a daily poppel wisdom in `DAILY_CHANNEL_ID`.

To add a command, create a file in `src/commands/` modelled on `hei.ts` and add it to `src/commands/index.ts`. All user-facing text is in poppel (see `AGENTS.md`). Commands are registered with Discord each time the bot starts.
