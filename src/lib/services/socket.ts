import io from 'socket.io-client';
import { messagesStore } from '$lib/stores/messages';
import { browser } from '$app/environment';

let socket: ReturnType<typeof io> | null = null;

export function initializeSocket() {
  if (!browser || socket) return;
  
  socket = io('http://localhost:2002', {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => {
    console.log('Connected to backend server');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });
  
  socket.on('personal-dm', (message: any) => {
    messagesStore.addMessage({
      platform: 'discord',
      author: message.author,
      content: message.content,
      avatarUrl: message.avatarUrl,
      channelId: message.channelId,
      channelName: message.channelName,
      isDM: true
    });
  });
  
  socket.on('dm-error', (error: any) => {
    console.error('DM polling error:', error);
  });
  
  socket.on('message-deleted', (data: { platform: string; platformMessageId: string }) => {
    console.log('Message deletion event received:', data);
    messagesStore.deleteMessage(data.platform as any, data.platformMessageId);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from backend server');
  });
  
  // Listen for deletion events from services and forward to backend
  window.addEventListener('discord-message-deleted', (event: any) => {
    if (socket) {
      socket.emit('message-deleted', event.detail);
    }
  });
  
  window.addEventListener('telegram-message-deleted', (event: any) => {
    if (socket) {
      socket.emit('message-deleted', event.detail);
    }
  });
  
  window.addEventListener('twitch-message-deleted', (event: any) => {
    if (socket) {
      socket.emit('message-deleted', event.detail);
    }
  });
}

export function startDMPolling(accessToken: string) {
  if (!socket) return;
  socket.emit('start-dm-polling', accessToken);
}

export function stopDMPolling() {
  if (!socket) return;
  socket.emit('stop-dm-polling');
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}