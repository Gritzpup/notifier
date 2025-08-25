import { Server } from 'socket.io';
import fetch from 'node-fetch';

interface StreamInfo {
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
}

export class TwitchStreamsService {
  private io: Server;
  private clientId: string = '';
  private clientSecret: string = '';
  private accessToken: string = '';
  private streamMonitors: string[] = [];
  private onlineStreams: Map<string, StreamInfo> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(io: Server) {
    this.io = io;
  }

  async connect(clientId: string, clientSecret: string, streamMonitors: string[]) {
    if (this.isRunning || !clientId || !clientSecret || streamMonitors.length === 0) return;

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.streamMonitors = streamMonitors;

    console.log('[Twitch Streams] Getting access token...');
    
    try {
      // Get app access token
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        })
      });

      const tokenData = await tokenResponse.json() as any;
      this.accessToken = tokenData.access_token;

      if (!this.accessToken) {
        throw new Error('Failed to get access token');
      }

      console.log('[Twitch Streams] Starting stream monitoring for:', streamMonitors);
      this.isRunning = true;
      
      // Start polling for stream status
      this.startPolling();
      
      // Broadcast connection status
      this.io.emit('service-status', {
        platform: 'twitch-streams',
        connected: true,
        monitoring: this.streamMonitors
      });
      
    } catch (error) {
      console.error('[Twitch Streams] Connection failed:', error);
      this.io.emit('service-error', {
        platform: 'twitch-streams',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async startPolling() {
    if (!this.isRunning) return;

    try {
      // Build query for all monitored channels
      const logins = this.streamMonitors.map(s => `user_login=${s}`).join('&');
      const response = await fetch(
        `https://api.twitch.tv/helix/streams?${logins}`,
        {
          headers: {
            'Client-ID': this.clientId,
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { data: StreamInfo[] };
      
      // Check for newly online streams
      for (const stream of data.data) {
        if (!this.onlineStreams.has(stream.user_login)) {
          // New stream went online!
          console.log(`[Twitch Streams] ${stream.user_name} is now live!`);
          
          const notificationData = {
            id: `twitch-stream-${stream.user_id}-${Date.now()}`,
            platform: 'twitch',
            platformMessageId: `stream-${stream.user_id}-${Date.now()}`,
            author: 'Stream Alert',
            content: `🔴 ${stream.user_name} just went live: ${stream.title}`,
            avatarUrl: null,
            channelId: stream.user_login,
            channelName: stream.user_name,
            isStreamNotification: true,
            streamInfo: {
              title: stream.title,
              game: stream.game_name,
              viewers: stream.viewer_count,
              thumbnail: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
              url: `https://twitch.tv/${stream.user_login}`
            },
            timestamp: Date.now()
          };
          
          // Broadcast to all connected clients
          this.io.emit('new-message', notificationData);
          
          // Store in online streams map
          this.onlineStreams.set(stream.user_login, stream);
        }
      }
      
      // Check for streams that went offline
      const onlineLogins = new Set(data.data.map(s => s.user_login));
      for (const [login, streamInfo] of this.onlineStreams.entries()) {
        if (!onlineLogins.has(login)) {
          console.log(`[Twitch Streams] ${streamInfo.user_name} is now offline`);
          
          const notificationData = {
            id: `twitch-stream-offline-${streamInfo.user_id}-${Date.now()}`,
            platform: 'twitch',
            platformMessageId: `stream-offline-${streamInfo.user_id}-${Date.now()}`,
            author: 'Stream Alert',
            content: `📴 ${streamInfo.user_name} is now offline`,
            avatarUrl: null,
            channelId: login,
            channelName: streamInfo.user_name,
            isStreamNotification: true,
            timestamp: Date.now()
          };
          
          this.io.emit('new-message', notificationData);
          this.onlineStreams.delete(login);
        }
      }
      
    } catch (error) {
      console.error('[Twitch Streams] Polling error:', error);
      
      // Check if token expired
      if (error instanceof Error && error.message.includes('401')) {
        console.log('[Twitch Streams] Token expired, attempting to refresh...');
        // Reconnect to get new token
        this.disconnect();
        await this.connect(this.clientId, this.clientSecret, this.streamMonitors);
        return;
      }
    }

    // Continue polling every 30 seconds
    if (this.isRunning) {
      this.pollInterval = setTimeout(() => this.startPolling(), 30000);
    }
  }

  disconnect() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    this.onlineStreams.clear();
    
    this.io.emit('service-status', {
      platform: 'twitch-streams',
      connected: false
    });
  }

  getStatus() {
    return {
      platform: 'twitch-streams',
      connected: this.isRunning,
      monitoring: this.streamMonitors,
      onlineStreams: Array.from(this.onlineStreams.keys())
    };
  }
}