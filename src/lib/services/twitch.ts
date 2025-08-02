import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';

interface TwitchCredentials {
  username: string;
  oauth: string;
  channels: string[];
}

export class TwitchService {
  private ws: WebSocket | null = null;
  private credentials: TwitchCredentials;
  private pingInterval: number | null = null;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private joinedChannels = new Set<string>();

  constructor(credentials: TwitchCredentials) {
    this.credentials = credentials;
  }

  connect() {
    if (this.isDestroyed) return;
    
    console.log('[Twitch] Starting connection...');
    console.log('[Twitch] Credentials:', {
      username: this.credentials.username,
      hasOAuth: !!this.credentials.oauth,
      channels: this.credentials.channels
    });
    
    connectionsStore.setConnecting('twitch');
    
    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      console.log('[Twitch] WebSocket created, waiting for connection...');
      
      this.ws.onopen = () => {
        console.log('[Twitch] WebSocket opened, authenticating...');
        this.reconnectAttempts = 0;
        this.authenticate();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        console.log('[Twitch] Raw message:', event.data);
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Twitch] WebSocket error:', error);
        connectionsStore.setError('twitch', 'Connection error');
      };

      this.ws.onclose = (event) => {
        console.log(`[Twitch] WebSocket closed - Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
        this.cleanup();
        
        if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectAttempts * 2000, 10000);
          console.log(`[Twitch] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        } else {
          console.log('[Twitch] Max reconnection attempts reached or service destroyed');
          connectionsStore.disconnect('twitch');
        }
      };
    } catch (error) {
      console.error('[Twitch] Failed to create WebSocket:', error);
      connectionsStore.setError('twitch', 'Failed to connect');
    }
  }

  private authenticate() {
    // Ensure oauth token has the correct format
    const oauth = this.credentials.oauth.startsWith('oauth:') 
      ? this.credentials.oauth 
      : `oauth:${this.credentials.oauth}`;
    
    console.log('[Twitch] Authenticating as:', this.credentials.username);
    console.log('[Twitch] OAuth token format:', oauth.substring(0, 10) + '...');
    console.log('[Twitch] Channels to join:', this.credentials.channels);
    
    this.send(`PASS ${oauth}`);
    this.send(`NICK ${this.credentials.username}`);
    
    // Request capabilities
    this.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
    
    // Join channels after a short delay
    setTimeout(() => {
      this.credentials.channels.forEach(channel => {
        const channelName = channel.startsWith('#') ? channel : `#${channel}`;
        console.log(`[Twitch] Joining channel: ${channelName}`);
        this.send(`JOIN ${channelName}`);
      });
    }, 1000);
  }

  private handleMessage(rawMessage: string) {
    const messages = rawMessage.split('\r\n').filter(msg => msg.length > 0);
    
    for (const message of messages) {
      // Handle PING
      if (message === 'PING :tmi.twitch.tv') {
        this.send('PONG :tmi.twitch.tv');
        continue;
      }
      
      // Parse IRC message
      const parsed = this.parseIRCMessage(message);
      
      switch (parsed.command) {
        case '001': // Welcome message
          console.log('[Twitch] IRC authenticated successfully');
          connectionsStore.setConnected('twitch');
          break;
          
        case 'JOIN':
          if (parsed.nick === this.credentials.username) {
            this.joinedChannels.add(parsed.channel);
            console.log(`[Twitch] Successfully joined channel: ${parsed.channel}`);
          }
          break;
          
        case 'PART':
          if (parsed.nick === this.credentials.username) {
            this.joinedChannels.delete(parsed.channel);
            console.log(`[Twitch] Left channel: ${parsed.channel}`);
          }
          break;
          
        case 'PRIVMSG':
          console.log(`[Twitch] Chat message from ${parsed.nick} in ${parsed.channel}: ${parsed.message}`);
          if (parsed.nick && parsed.channel && parsed.message) {
            messagesStore.addMessage({
              platform: 'twitch',
              author: parsed.nick,
              content: parsed.message,
              channelId: parsed.channel,
              channelName: parsed.channel,
              isDM: false
            });
          }
          break;
          
        case 'NOTICE':
          console.log('[Twitch] Notice:', parsed.message);
          if (parsed.message?.includes('Login authentication failed')) {
            console.error('[Twitch] Authentication failed! Check your OAuth token');
            connectionsStore.setError('twitch', 'Authentication failed');
          }
          break;
          
        default:
          console.log(`[Twitch] Unhandled command: ${parsed.command}`);
      }
    }
  }

  private parseIRCMessage(message: string) {
    const result: any = {
      tags: {},
      nick: null,
      command: null,
      channel: null,
      message: null
    };
    
    let idx = 0;
    
    // Parse tags
    if (message[idx] === '@') {
      const endIdx = message.indexOf(' ');
      const rawTags = message.slice(1, endIdx);
      
      rawTags.split(';').forEach(tag => {
        const [key, value] = tag.split('=');
        result.tags[key] = value || true;
      });
      
      idx = endIdx + 1;
    }
    
    // Skip prefix if present
    if (message[idx] === ':') {
      idx++;
      const endIdx = message.indexOf(' ', idx);
      const prefix = message.slice(idx, endIdx);
      
      // Extract nick from prefix
      const nickMatch = prefix.match(/^(\w+)!/);
      if (nickMatch) {
        result.nick = nickMatch[1];
      }
      
      idx = endIdx + 1;
    }
    
    // Parse command
    const commandEndIdx = message.indexOf(' ', idx);
    if (commandEndIdx !== -1) {
      result.command = message.slice(idx, commandEndIdx);
      idx = commandEndIdx + 1;
    } else {
      result.command = message.slice(idx);
      return result;
    }
    
    // Parse channel and message
    if (result.command === 'PRIVMSG' || result.command === 'JOIN' || result.command === 'PART') {
      const channelEndIdx = message.indexOf(' ', idx);
      
      if (channelEndIdx !== -1) {
        result.channel = message.slice(idx, channelEndIdx);
        
        // Parse message (skip the : prefix)
        if (message[channelEndIdx + 1] === ':') {
          result.message = message.slice(channelEndIdx + 2);
        } else {
          result.message = message.slice(channelEndIdx + 1);
        }
      } else {
        result.channel = message.slice(idx);
      }
    } else if (message[idx] === ':') {
      result.message = message.slice(idx + 1);
    } else {
      result.message = message.slice(idx);
    }
    
    return result;
  }

  private startPing() {
    this.stopPing();
    
    // Send PING every 4 minutes to keep connection alive
    this.pingInterval = window.setInterval(() => {
      this.send('PING :tmi.twitch.tv');
    }, 240000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private send(command: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Twitch] Sending:', command.includes('PASS') ? 'PASS oauth:***' : command);
      this.ws.send(command + '\r\n');
    } else {
      console.warn('[Twitch] Cannot send command, WebSocket not open. State:', this.ws?.readyState);
    }
  }

  joinChannel(channel: string) {
    const channelName = channel.startsWith('#') ? channel : `#${channel}`;
    if (!this.joinedChannels.has(channelName)) {
      this.send(`JOIN ${channelName}`);
    }
  }

  leaveChannel(channel: string) {
    const channelName = channel.startsWith('#') ? channel : `#${channel}`;
    if (this.joinedChannels.has(channelName)) {
      this.send(`PART ${channelName}`);
    }
  }

  private cleanup() {
    this.stopPing();
    this.joinedChannels.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect() {
    this.isDestroyed = true;
    this.cleanup();
    connectionsStore.disconnect('twitch');
  }
}