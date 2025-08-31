import { Server } from 'socket.io';
import WebSocket from 'ws';

export class TwitchChatService {
  private io: Server;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private channel: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
  }

  async connect(channel: string) {
    if (this.isConnected || !channel) return;

    this.channel = channel.toLowerCase().replace('#', '');
    console.log(`[Twitch Chat] Connecting to channel: ${this.channel}`);

    try {
      // Connect to Twitch IRC WebSocket
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.ws.onopen = () => {
        console.log('[Twitch Chat] WebSocket connected');
        
        // Authenticate as anonymous user
        this.ws?.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        this.ws?.send('PASS SCHMOOPIIE');
        this.ws?.send('NICK justinfan' + Math.floor(Math.random() * 100000));
        this.ws?.send(`JOIN #${this.channel}`);
        
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Broadcast connection status
        this.io.emit('service-status', {
          platform: 'twitch',
          connected: true,
          channel: this.channel
        });
      };

      this.ws.onmessage = (event) => {
        const messages = event.data.split('\r\n');
        
        for (const message of messages) {
          if (message.startsWith('PING')) {
            this.ws?.send('PONG :tmi.twitch.tv');
            continue;
          }
          
          // Parse PRIVMSG (chat messages)
          const match = message.match(/@(.+) :([^!]+)!.+ PRIVMSG #\w+ :(.+)/);
          if (match) {
            const [, tags, username, content] = match;
            const tagDict: any = {};
            
            // Parse tags
            tags.split(';').forEach(tag => {
              const [key, value] = tag.split('=');
              tagDict[key] = value;
            });
            
            // Skip messages from known relay bots
            const relayBots = ['twitchrelayer', 'relaybot', 'bridgebot'];
            const isRelayBot = relayBots.some(bot => 
              username.toLowerCase().includes(bot) || 
              (tagDict['display-name'] && tagDict['display-name'].toLowerCase().includes(bot))
            );
            
            // Skip relayed messages (ones that look like they're from other platforms)
            const isRelayedMessage = content.includes('↩️ Replying to') || 
                                   content.includes('[Telegram]') || 
                                   content.includes('[Discord]') ||
                                   content.match(/^\[.+?\]\s+.+?:/);
            
            if (isRelayBot || isRelayedMessage) {
              // console.log(`[Twitch Chat] Skipping relayed message from ${username}: "${content.substring(0, 50)}..."`);
              return;
            }
            
            // Use the actual username (not display name) for avatar URL
            const actualUsername = username.toLowerCase();
            const displayName = tagDict['display-name'] || username;
            
            const messageData = {
              id: `twitch-${tagDict['id'] || Date.now()}`,
              platform: 'twitch',
              platformMessageId: tagDict['id'] || String(Date.now()),
              author: displayName,
              content: content,
              avatarUrl: `https://unavatar.io/twitch/${actualUsername}`,
              channelId: this.channel,
              channelName: this.channel,
              color: tagDict['color'] || null,
              timestamp: parseInt(tagDict['tmi-sent-ts']) || Date.now()
            };
            
            console.log(`[Twitch Chat] Avatar URL for ${actualUsername}: ${messageData.avatarUrl}`);
            
            // Broadcast to all connected clients
            console.log(`[Twitch Chat] Broadcasting message from ${messageData.author}: "${messageData.content.substring(0, 50)}..."`);
            this.io.emit('new-message', messageData);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Twitch Chat] WebSocket error:', error);
        this.io.emit('service-error', {
          platform: 'twitch',
          error: 'WebSocket error'
        });
      };

      this.ws.onclose = () => {
        console.log('[Twitch Chat] WebSocket disconnected');
        this.isConnected = false;
        
        this.io.emit('service-status', {
          platform: 'twitch',
          connected: false
        });
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[Twitch Chat] Reconnecting... (attempt ${this.reconnectAttempts})`);
          this.reconnectTimeout = setTimeout(() => {
            this.connect(this.channel);
          }, 5000 * this.reconnectAttempts);
        }
      };
    } catch (error) {
      console.error('[Twitch Chat] Connection failed:', error);
      this.io.emit('service-error', {
        platform: 'twitch',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      
      this.io.emit('service-status', {
        platform: 'twitch',
        connected: false
      });
    }
  }

  getStatus() {
    return {
      platform: 'twitch',
      connected: this.isConnected,
      channel: this.channel
    };
  }
}