import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { DiscordOAuthService } from './services/discord-oauth.js';

dotenv.config({ path: '../.env' });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
  }
});

const PORT = process.env.VITE_BACKEND_PORT || 2002;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/auth', authRouter);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('start-dm-polling', async (accessToken: string) => {
    const oauthService = new DiscordOAuthService(accessToken, socket);
    await oauthService.startPolling();
  });
  
  socket.on('stop-dm-polling', () => {
    // Stop polling for this socket
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});