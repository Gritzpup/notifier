import { messagesStore } from '$lib/stores/messages';
import { TwitchAPI } from './twitch-api';

interface EventSubMessage {
  metadata: {
    message_id: string;
    message_type: string;
    message_timestamp: string;
    subscription_type?: string;
    subscription_version?: string;
  };
  payload?: {
    session?: {
      id: string;
      status: string;
      connected_at: string;
      keepalive_timeout_seconds: number;
      reconnect_url: string | null;
    };
    subscription?: {
      id: string;
      status: string;
      type: string;
      version: string;
      condition: any;
      transport: any;
      created_at: string;
    };
    event?: {
      user_id: string;
      user_login: string;
      user_name: string;
      broadcaster_user_id: string;
      broadcaster_user_login: string;
      broadcaster_user_name: string;
      type: string;
      started_at: string;
    };
  };
}

export class TwitchEventSubService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectUrl: string | null = null;
  private keepaliveTimer: number | null = null;
  private streamMonitors: string[];
  private isConnected = false;
  private subscriptions = new Map<string, string>(); // username -> subscription id
  private notifiedStreams = new Set<string>(); // Track streams we've already notified about
  
  constructor(streamMonitors: string[]) {
    this.streamMonitors = streamMonitors;
    console.log('[TwitchEventSub] Initialized with stream monitors:', streamMonitors);
  }
  
  async connect() {
    if (this.streamMonitors.length === 0) {
      console.log('[TwitchEventSub] No stream monitors configured, skipping connection');
      return;
    }
    
    console.log('[TwitchEventSub] Connecting to EventSub WebSocket...');
    
    try {
      await this.connectWebSocket();
    } catch (error) {
      console.error('[TwitchEventSub] Failed to connect:', error);
    }
  }
  
  private async connectWebSocket(url?: string) {
    const wsUrl = url || 'wss://eventsub.wss.twitch.tv/ws';
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('[TwitchEventSub] WebSocket connected');
    };
    
    this.ws.onmessage = async (event) => {
      try {
        const message: EventSubMessage = JSON.parse(event.data);
        await this.handleMessage(message);
      } catch (error) {
        console.error('[TwitchEventSub] Failed to parse message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[TwitchEventSub] WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('[TwitchEventSub] WebSocket closed');
      this.handleDisconnect();
    };
  }
  
  private async handleMessage(message: EventSubMessage) {
    const { metadata, payload } = message;
    
    console.log(`[TwitchEventSub] Received ${metadata.message_type} message`);
    
    switch (metadata.message_type) {
      case 'session_welcome':
        await this.handleWelcome(payload!.session!);
        break;
        
      case 'session_keepalive':
        this.resetKeepaliveTimer();
        break;
        
      case 'notification':
        if (metadata.subscription_type === 'stream.online') {
          await this.handleStreamOnline(payload!.event!);
        }
        break;
        
      case 'session_reconnect':
        this.reconnectUrl = payload!.session!.reconnect_url;
        console.log('[TwitchEventSub] Received reconnect URL:', this.reconnectUrl);
        await this.reconnect();
        break;
        
      case 'revocation':
        console.warn('[TwitchEventSub] Subscription revoked:', payload!.subscription);
        break;
    }
  }
  
  private async handleWelcome(session: any) {
    this.sessionId = session.id;
    this.isConnected = true;
    
    console.log('[TwitchEventSub] Session established:', this.sessionId);
    console.log('[TwitchEventSub] Keepalive timeout:', session.keepalive_timeout_seconds, 'seconds');
    
    // Set up keepalive timer
    this.resetKeepaliveTimer(session.keepalive_timeout_seconds);
    
    // Subscribe to stream.online events for each monitor
    await this.subscribeToStreamEvents();
  }
  
  private resetKeepaliveTimer(timeoutSeconds: number = 10) {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
    }
    
    // Add 5 seconds buffer to the timeout
    const timeout = (timeoutSeconds + 5) * 1000;
    
    this.keepaliveTimer = window.setTimeout(() => {
      console.warn('[TwitchEventSub] Keepalive timeout reached, reconnecting...');
      this.reconnect();
    }, timeout);
  }
  
  private async subscribeToStreamEvents() {
    console.log('[TwitchEventSub] Subscribing to stream events for monitors...');
    
    // Get user IDs for the stream monitors
    const userIds = await this.getUserIds(this.streamMonitors);
    
    for (const [username, userId] of userIds.entries()) {
      try {
        await this.createSubscription(username, userId);
      } catch (error) {
        console.error(`[TwitchEventSub] Failed to subscribe to ${username}:`, error);
      }
    }
  }
  
  private async getUserIds(usernames: string[]): Promise<Map<string, string>> {
    const userIds = new Map<string, string>();
    
    try {
      // Get access token
      const tokenResponse = await TwitchAPI.getAccessToken();
      if (!tokenResponse) {
        throw new Error('Failed to get access token');
      }
      
      // Batch request for user IDs
      const params = usernames.map(u => `login=${u}`).join('&');
      const response = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
          'Client-Id': import.meta.env.VITE_TWITCH_CLIENT_ID
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get user IDs: ${response.status}`);
      }
      
      const data = await response.json();
      
      for (const user of data.data) {
        userIds.set(user.login, user.id);
        console.log(`[TwitchEventSub] Found user ID for ${user.login}: ${user.id}`);
      }
      
      // Check for any usernames that weren't found
      for (const username of usernames) {
        if (!userIds.has(username)) {
          console.warn(`[TwitchEventSub] User not found: ${username}`);
        }
      }
      
    } catch (error) {
      console.error('[TwitchEventSub] Failed to get user IDs:', error);
    }
    
    return userIds;
  }
  
  private async createSubscription(username: string, userId: string) {
    if (!this.sessionId) {
      throw new Error('No session ID available');
    }
    
    // Skip if already subscribed
    if (this.subscriptions.has(username)) {
      console.log(`[TwitchEventSub] Already subscribed to ${username}`);
      return;
    }
    
    const tokenResponse = await TwitchAPI.getAccessToken();
    if (!tokenResponse) {
      throw new Error('Failed to get access token');
    }
    
    const body = {
      type: 'stream.online',
      version: '1',
      condition: {
        broadcaster_user_id: userId
      },
      transport: {
        method: 'websocket',
        session_id: this.sessionId
      }
    };
    
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResponse.access_token}`,
        'Client-Id': import.meta.env.VITE_TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create subscription: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    this.subscriptions.set(username, data.data[0].id);
    
    console.log(`[TwitchEventSub] Subscribed to stream.online events for ${username}`);
  }
  
  private async handleStreamOnline(event: any) {
    const { broadcaster_user_login, broadcaster_user_name, started_at } = event;
    
    // Check if we've already notified about this stream
    const streamKey = `${broadcaster_user_login}-${started_at}`;
    if (this.notifiedStreams.has(streamKey)) {
      console.log(`[TwitchEventSub] Already notified about ${broadcaster_user_login} stream`);
      return;
    }
    
    this.notifiedStreams.add(streamKey);
    
    console.log(`[TwitchEventSub] Stream went online: ${broadcaster_user_name} (${broadcaster_user_login})`);
    
    // Get stream details
    try {
      const streamInfo = await this.getStreamInfo(broadcaster_user_login);
      
      if (streamInfo) {
        // Add notification to message store
        messagesStore.addMessage({
          platform: 'twitch',
          author: broadcaster_user_name,
          content: `🔴 **${broadcaster_user_name} is now LIVE!**\n\n**${streamInfo.title}**\nPlaying: ${streamInfo.game_name}`,
          channelName: 'Stream Notifications',
          channelId: 'stream-notifications',
          isDM: false,
          avatarUrl: streamInfo.profile_image_url,
          attachments: [{
            id: `stream-${broadcaster_user_login}`,
            filename: 'stream-thumbnail.jpg',
            size: 0,
            url: streamInfo.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
            proxy_url: streamInfo.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
            content_type: 'image/jpeg',
            width: 640,
            height: 360
          }],
          embeds: [{
            type: 'rich',
            title: `Watch ${broadcaster_user_name} on Twitch`,
            url: `https://twitch.tv/${broadcaster_user_login}`,
            color: 0x9146ff, // Twitch purple
            fields: [
              {
                name: 'Viewers',
                value: streamInfo.viewer_count.toLocaleString(),
                inline: true
              },
              {
                name: 'Started',
                value: new Date(started_at).toLocaleTimeString(),
                inline: true
              }
            ]
          }],
          isStreamNotification: true
        });
        
        // Clean up old notifications after 24 hours
        setTimeout(() => {
          this.notifiedStreams.delete(streamKey);
        }, 24 * 60 * 60 * 1000);
      }
    } catch (error) {
      console.error('[TwitchEventSub] Failed to get stream info:', error);
      
      // Still send a basic notification
      messagesStore.addMessage({
        platform: 'twitch',
        author: broadcaster_user_name,
        content: `🔴 **${broadcaster_user_name} is now LIVE!**\n\nhttps://twitch.tv/${broadcaster_user_login}`,
        channelName: 'Stream Notifications',
        channelId: 'stream-notifications',
        isDM: false,
        isStreamNotification: true
      });
    }
  }
  
  private async getStreamInfo(username: string) {
    try {
      const tokenResponse = await TwitchAPI.getAccessToken();
      if (!tokenResponse) {
        throw new Error('Failed to get access token');
      }
      
      // Get stream info
      const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
          'Client-Id': import.meta.env.VITE_TWITCH_CLIENT_ID
        }
      });
      
      if (!streamResponse.ok) {
        throw new Error(`Failed to get stream info: ${streamResponse.status}`);
      }
      
      const streamData = await streamResponse.json();
      
      if (streamData.data.length === 0) {
        return null;
      }
      
      const stream = streamData.data[0];
      
      // Get user info for profile picture
      const userResponse = await fetch(`https://api.twitch.tv/helix/users?id=${stream.user_id}`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
          'Client-Id': import.meta.env.VITE_TWITCH_CLIENT_ID
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        stream.profile_image_url = userData.data[0].profile_image_url;
      }
      
      return stream;
    } catch (error) {
      console.error('[TwitchEventSub] Failed to get stream info:', error);
      return null;
    }
  }
  
  private async reconnect() {
    console.log('[TwitchEventSub] Reconnecting...');
    
    if (this.reconnectUrl) {
      // Connect to the new URL
      await this.connectWebSocket(this.reconnectUrl);
      this.reconnectUrl = null;
    } else {
      // Full reconnect
      this.disconnect();
      await this.connect();
    }
  }
  
  private handleDisconnect() {
    this.isConnected = false;
    
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    
    // Clear subscriptions (they're tied to the session)
    this.subscriptions.clear();
    this.sessionId = null;
    
    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, 5000);
  }
  
  disconnect() {
    console.log('[TwitchEventSub] Disconnecting...');
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    
    this.isConnected = false;
    this.subscriptions.clear();
    this.sessionId = null;
    this.reconnectUrl = null;
  }
}