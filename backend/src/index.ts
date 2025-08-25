import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { DiscordOAuthService } from './services/discord-oauth.js';
import { DiscordBotService } from './services/discord-bot.js';
import { TelegramBotService } from './services/telegram-bot.js';
import { TwitchChatService } from './services/twitch-chat.js';
import { TwitchEventSubService } from './services/twitch-eventsub.js';
import { TwitchStreamsService } from './services/twitch-streams.js';

dotenv.config({ path: '../.env' });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow all origins in development (you can restrict this in production)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.VITE_BACKEND_PORT || 7392;

// Initialize bot services
const discordBot = new DiscordBotService(io);
const telegramBot = new TelegramBotService(io);
const twitchChat = new TwitchChatService(io);
const twitchEventSub = new TwitchEventSubService(io);
const twitchStreams = new TwitchStreamsService(io);

// Auto-connect services if tokens are available
const discordToken = process.env.VITE_DISCORD_TOKEN || process.env.VITE_DISCORD_BOT_TOKEN;
if (discordToken) {
  console.log('[Backend] Auto-connecting Discord bot...');
  discordBot.connect(discordToken);
}

const telegramToken = process.env.VITE_TELEGRAM_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
if (telegramToken) {
  console.log('[Backend] Auto-connecting Telegram bot...');
  const groupFilter = process.env.VITE_TELEGRAM_GROUP_FILTER?.split(',').map(g => g.trim()) || [];
  const excludeGroups = process.env.VITE_TELEGRAM_EXCLUDE_GROUPS?.split(',').map(g => g.trim()) || [];
  telegramBot.connect(telegramToken, groupFilter, excludeGroups);
}

// Auto-connect Twitch services if configured
const twitchChannel = process.env.VITE_TWITCH_CHANNEL || process.env.VITE_TWITCH_CHANNEL_NAME;
if (twitchChannel) {
  console.log('[Backend] Auto-connecting Twitch chat...');
  twitchChat.connect(twitchChannel);
}

const twitchClientId = process.env.VITE_TWITCH_CLIENT_ID;
const twitchClientSecret = process.env.VITE_TWITCH_CLIENT_SECRET;
const streamMonitors = process.env.VITE_TWITCH_STREAM_MONITORS?.split(',').map(s => s.trim()) || [];
if (twitchClientId && twitchClientSecret && streamMonitors.length > 0) {
  console.log('[Backend] Auto-connecting Twitch Stream Monitor...');
  // Use the simpler streams API instead of EventSub (doesn't require user auth)
  twitchStreams.connect(twitchClientId, twitchClientSecret, streamMonitors);
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins in development
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());

// Routes
app.use('/auth', authRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: PORT,
    discord: discordBot.getStatus(),
    telegram: telegramBot.getStatus(),
    twitch: twitchChat.getStatus(),
    twitchEventSub: twitchEventSub.getStatus(),
    twitchStreams: twitchStreams.getStatus()
  });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current service status to new client
  socket.emit('service-status', discordBot.getStatus());
  socket.emit('service-status', telegramBot.getStatus());
  socket.emit('service-status', twitchChat.getStatus());
  socket.emit('service-status', twitchStreams.getStatus());
  
  socket.on('start-dm-polling', async (accessToken: string) => {
    const oauthService = new DiscordOAuthService(accessToken, socket);
    await oauthService.startPolling();
  });
  
  socket.on('stop-dm-polling', () => {
    // Stop polling for this socket
  });
  
  socket.on('message-deleted', (data: { platform: string; platformMessageId: string }) => {
    console.log('Message deletion event received:', data);
    // Broadcast to all connected clients
    io.emit('message-deleted', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
server.listen(portNumber, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${portNumber}`);
});

