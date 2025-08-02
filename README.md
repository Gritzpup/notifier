# Notification Hub

A personal notification aggregator that combines Discord DMs, Telegram messages, and Twitch chat into a single interface. Built as a Progressive Web App for desktop and mobile use.

## Features

- 🔔 Real-time notifications from Discord, Telegram, and Twitch
- 💬 Discord personal DMs via OAuth2 (optional)
- 📱 Installable PWA - works on desktop and mobile
- 🌐 Direct connections to platform APIs
- 🎨 Dark theme with platform-specific color coding
- 💾 Works offline once installed

## Quick Start

1. Clone and setup:
```bash
git clone <your-repo>
cd notifier
npm run install:all  # Installs both frontend and backend
```

2. Copy `.env.example` to `.env` and add your credentials:
```bash
cp .env.example .env
# Add your Discord Client Secret for personal DMs (optional)
```

3. Run everything with one command:
```bash
npm run dev  # Starts both frontend and backend automatically!
```

Both servers will start together and stop together when you press CTRL+C.

## Platform Setup

### Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create "New Application" 
3. Go to "Bot" section → "Add Bot"
4. Enable "MESSAGE CONTENT INTENT" under Privileged Gateway Intents
5. Click "Reset Token" and copy it
6. Add to `.env`: `VITE_DISCORD_TOKEN=your_token_here`
7. The bot needs to share a server with you to receive DMs

### Telegram Bot
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token BotFather gives you
4. Add to `.env`: `VITE_TELEGRAM_TOKEN=your_token_here`
5. Start a chat with your bot

### Twitch Chat
1. Go to [Twitch Chat OAuth Generator](https://twitchapps.com/tmi/)
2. Click "Connect" and authorize
3. Copy the OAuth token (includes "oauth:" prefix)
4. Add to `.env`:
   ```
   VITE_TWITCH_USERNAME=your_username
   VITE_TWITCH_OAUTH=oauth:your_token_here
   VITE_TWITCH_CHANNELS=channel1,channel2
   ```

## Environment Variables

Create a `.env` file with:

```env
# Discord
VITE_DISCORD_TOKEN=

# Telegram  
VITE_TELEGRAM_TOKEN=

# Twitch
VITE_TWITCH_USERNAME=
VITE_TWITCH_OAUTH=
VITE_TWITCH_CHANNELS=
```

## Development

- Built with SvelteKit and Tailwind CSS
- Uses Vite PWA plugin for installability
- Direct WebSocket/HTTP connections to platforms
- No backend server required

## Build & Deploy

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The built app is a static site that can be hosted anywhere.

## License

MIT