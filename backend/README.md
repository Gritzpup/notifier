# Backend Server for Discord OAuth2

This backend server handles Discord OAuth2 authentication to fetch your personal DMs.

## Setup

1. **Get Discord OAuth2 credentials:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications/1401002202268696697/oauth2)
   - Copy your **Client Secret**
   - Add it to `.env`: `VITE_DISCORD_CLIENT_SECRET=your_secret_here`

2. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Run the backend server:**
   ```bash
   npm run dev
   ```

## How it works

1. Click "Connect Discord DMs" in the frontend
2. You'll be redirected to Discord to authorize
3. Discord redirects back with an access token
4. The backend polls your DMs every 5 seconds
5. New messages are sent to the frontend via Socket.io

## Architecture

- **Frontend (port 5173)**: SvelteKit app with bot connections
- **Backend (port 3001)**: Express server for OAuth2 and DM polling
- **Communication**: Socket.io for real-time updates

## Endpoints

- `GET /auth/discord` - Start OAuth2 flow
- `GET /auth/discord/callback` - OAuth2 callback