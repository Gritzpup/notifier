import { Server } from 'socket.io';
import fetch from 'node-fetch';
import WebSocket from 'ws';

interface StreamOnlineEvent {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  type: string;
  started_at: string;
}

export class TwitchEventSubService {
  private io: Server;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private clientId: string = '';
  private clientSecret: string = '';
  private accessToken: string = '';
  private streamMonitors: string[] = [];
  private sessionId: string = '';

  constructor(io: Server) {
    this.io = io;
  }

  async connect(clientId: string, clientSecret: string, streamMonitors: string[]) {
    if (this.isConnected || !clientId || !clientSecret || streamMonitors.length === 0) return;

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.streamMonitors = streamMonitors;

    console.log('[Twitch EventSub] Getting access token...');
    
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
      
      // For now, just log that EventSub needs user auth
      console.log('[Twitch EventSub] Note: Stream notifications require user authentication.');
      console.log('[Twitch EventSub] Monitoring these channels:', streamMonitors);
      
      // Skip WebSocket connection for now since it requires user auth
      this.isConnected = false;
      this.io.emit('service-status', {
        platform: 'twitch-eventsub',
        connected: false,
        note: 'Requires user authentication for stream notifications'
      });
      return;

      console.log('[Twitch EventSub] Connecting to WebSocket...');
      
      // Connect to EventSub WebSocket
      this.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

      this.ws.onopen = () => {
        console.log('[Twitch EventSub] WebSocket connected');
      };

      this.ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        if (message.metadata.message_type === 'session_welcome') {
          this.sessionId = message.payload.session.id;
          console.log('[Twitch EventSub] Session established:', this.sessionId);
          
          // Subscribe to stream.online events for monitored channels
          for (const channel of this.streamMonitors) {
            await this.subscribeToStreamOnline(channel);
          }
          
          this.isConnected = true;
          
          // Broadcast connection status
          this.io.emit('service-status', {
            platform: 'twitch-eventsub',
            connected: true,
            monitoring: this.streamMonitors
          });
        }
        
        if (message.metadata.message_type === 'notification') {
          const event = message.payload.event as StreamOnlineEvent;
          
          if (message.metadata.subscription_type === 'stream.online') {
            console.log(`[Twitch EventSub] Stream started: ${event.broadcaster_user_name}`);
            
            // Send notification to all clients
            const notificationData = {
              id: `twitch-stream-${event.id}`,
              platform: 'twitch',
              type: 'stream-start',
              author: 'Twitch EventSub',
              content: `🔴 ${event.broadcaster_user_name} just went live!`,
              channelName: event.broadcaster_user_name,
              timestamp: new Date(event.started_at).getTime()
            };
            
            this.io.emit('new-message', notificationData);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Twitch EventSub] WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('[Twitch EventSub] WebSocket disconnected');
        this.isConnected = false;
        
        this.io.emit('service-status', {
          platform: 'twitch-eventsub',
          connected: false
        });
      };
    } catch (error) {
      console.error('[Twitch EventSub] Connection failed:', error);
      this.io.emit('service-error', {
        platform: 'twitch-eventsub',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async subscribeToStreamOnline(channel: string) {
    try {
      // Get broadcaster ID
      const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, {
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const userData = await userResponse.json() as any;
      if (!userData.data || userData.data.length === 0) {
        console.error(`[Twitch EventSub] User not found: ${channel}`);
        return;
      }

      const broadcasterId = userData.data[0].id;

      // Subscribe to stream.online event
      const subscribeResponse = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'stream.online',
          version: '1',
          condition: {
            broadcaster_user_id: broadcasterId
          },
          transport: {
            method: 'websocket',
            session_id: this.sessionId
          }
        })
      });

      if (subscribeResponse.ok) {
        console.log(`[Twitch EventSub] Subscribed to stream.online for ${channel}`);
      } else {
        const error = await subscribeResponse.json();
        console.error(`[Twitch EventSub] Failed to subscribe for ${channel}:`, error);
      }
    } catch (error) {
      console.error(`[Twitch EventSub] Error subscribing for ${channel}:`, error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      
      this.io.emit('service-status', {
        platform: 'twitch-eventsub',
        connected: false
      });
    }
  }

  getStatus() {
    return {
      platform: 'twitch-eventsub',
      connected: this.isConnected,
      monitoring: this.streamMonitors
    };
  }
}