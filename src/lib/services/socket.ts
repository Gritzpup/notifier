import io from 'socket.io-client';
import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';
import { browser } from '$app/environment';

let socket: ReturnType<typeof io> | null = null;

export function initializeSocket() {
  if (!browser || socket) return;
  
  // Use the same host as the frontend but on backend port
  const backendUrl = `http://${window.location.hostname}:7392`;
  
  socket = io(backendUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => {
    console.log('Connected to backend server');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });
  
  // Handle new messages from backend services
  socket.on('new-message', (message: any) => {
    console.log('New message from backend:', message);
    messagesStore.addMessage(message);
  });
  
  // Handle service status updates
  socket.on('service-status', (status: any) => {
    console.log('Service status update:', status);
    
    if (status.connected) {
      connectionsStore.setConnected(status.platform);
      window.dispatchEvent(new CustomEvent(`${status.platform}-connected`, { detail: status }));
    } else {
      connectionsStore.setDisconnected(status.platform);
      window.dispatchEvent(new CustomEvent(`${status.platform}-disconnected`, { detail: status }));
    }
  });
  
  // Handle service errors
  socket.on('service-error', (error: any) => {
    console.error(`Service error from ${error.platform}:`, error.error);
    window.dispatchEvent(new CustomEvent(`${error.platform}-error`, { detail: error }));
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
  
  socket.on('message-updated', (data: { platform: string; platformMessageId: string; newContent: string }) => {
    console.log('Message update event received:', data);
    messagesStore.updateMessage(data.platform as any, data.platformMessageId, data.newContent);
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