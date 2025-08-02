import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';

interface DiscordGatewayPayload {
  op: number;
  d: any;
  s?: number;
  t?: string;
}

export class DiscordService {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private token: string;
  private channelFilter: string[];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isDestroyed = false;
  private guildNames: Map<string, string> = new Map();
  private channelNames: Map<string, string> = new Map();

  constructor(token: string, channelFilter: string[] = []) {
    this.token = token;
    this.channelFilter = channelFilter;
  }

  connect() {
    if (this.isDestroyed) return;
    
    connectionsStore.setConnecting('discord');
    
    try {
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
      
      this.ws.onopen = () => {
        console.log('Discord WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        const payload: DiscordGatewayPayload = JSON.parse(event.data);
        this.handleMessage(payload);
      };

      this.ws.onerror = (error) => {
        console.error('Discord WebSocket error:', error);
        connectionsStore.setError('discord', 'Connection error');
      };

      this.ws.onclose = (event) => {
        console.log('Discord WebSocket closed:', event.code, event.reason);
        this.cleanup();
        
        if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectAttempts * 2000, 10000);
          setTimeout(() => this.connect(), delay);
        } else {
          connectionsStore.disconnect('discord');
        }
      };
    } catch (error) {
      console.error('Failed to create Discord WebSocket:', error);
      connectionsStore.setError('discord', 'Failed to connect');
    }
  }

  private handleMessage(payload: DiscordGatewayPayload) {
    if (payload.s) {
      this.sequence = payload.s;
    }

    switch (payload.op) {
      case 10: // Hello
        this.startHeartbeat(payload.d.heartbeat_interval);
        this.identify();
        break;
        
      case 0: // Dispatch
        this.handleDispatch(payload);
        break;
        
      case 1: // Heartbeat request
        this.sendHeartbeat();
        break;
        
      case 7: // Reconnect
        this.reconnect();
        break;
        
      case 9: // Invalid session
        if (payload.d) {
          setTimeout(() => this.identify(), 2000);
        } else {
          this.sessionId = null;
          this.sequence = null;
          this.identify();
        }
        break;
        
      case 11: // Heartbeat ACK
        // Heartbeat acknowledged
        break;
    }
  }

  private handleDispatch(payload: DiscordGatewayPayload) {
    switch (payload.t) {
      case 'READY':
        this.sessionId = payload.d.session_id;
        connectionsStore.setConnected('discord');
        console.log('Discord connected as:', payload.d.user.username);
        console.log('Discord guilds:', payload.d.guilds?.length || 0);
        console.log('Discord bot ID:', payload.d.user.id);
        
        if (!payload.d.guilds || payload.d.guilds.length === 0) {
          console.log('⚠️ Discord bot is not in any servers!');
          console.log('To add the bot to your server:');
          console.log('1. Click this link:', `https://discord.com/api/oauth2/authorize?client_id=${payload.d.user.id}&permissions=274877974528&scope=bot`);
          console.log('2. Select your server from the dropdown');
          console.log('3. Click "Continue" then "Authorize"');
          console.log('4. Refresh this page after adding the bot');
        } else {
          console.log('Discord bot invite URL:', `https://discord.com/api/oauth2/authorize?client_id=${payload.d.user.id}&permissions=274877974528&scope=bot`);
        }
        break;
        
      case 'GUILD_CREATE':
        // Cache guild and channel names
        this.guildNames.set(payload.d.id, payload.d.name);
        console.log(`Discord bot joined guild: ${payload.d.name} (${payload.d.id})`);
        console.log(`Guild has ${payload.d.channels?.length || 0} channels`);
        
        // Debug channel structure
        if (payload.d.channels && payload.d.channels.length > 0) {
          console.log('First channel example:', JSON.stringify(payload.d.channels[0], null, 2));
          
          payload.d.channels.forEach((channel: any) => {
            // Only cache text channels (type 0) and voice channels (type 2)
            if (channel.type === 0 || channel.type === 2) {
              this.channelNames.set(channel.id, channel.name);
              console.log(`Cached channel: ${channel.name} (${channel.id})`);
            }
          });
        }
        
        console.log(`Total guilds: ${this.guildNames.size}`);
        console.log(`Total cached channels: ${this.channelNames.size}`);
        break;
        
      case 'GUILD_DELETE':
        const guildName = this.guildNames.get(payload.d.id) || 'Unknown';
        this.guildNames.delete(payload.d.id);
        console.log(`Discord bot left guild: ${guildName} (${payload.d.id})`);
        console.log(`Total guilds: ${this.guildNames.size}`);
        break;
        
      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE':
        // Cache channel when it's created or updated
        if ((payload.d.type === 0 || payload.d.type === 2) && payload.d.guild_id) {
          this.channelNames.set(payload.d.id, payload.d.name);
          console.log(`Cached channel from ${payload.t}: ${payload.d.name} (${payload.d.id})`);
        }
        break;
        
      case 'MESSAGE_CREATE':
        console.log('Discord MESSAGE_CREATE event received');
        console.log('Message from:', payload.d.author.username, 'in channel:', payload.d.channel_id);
        console.log('Guild ID:', payload.d.guild_id || 'DM');
        
        // Skip bot messages
        if (payload.d.author.bot || payload.d.author.id === payload.d.application_id) {
          console.log('Skipping bot message');
          break;
        }
        
        // Filter by channel if specified
        if (this.channelFilter.length > 0 && !this.channelFilter.includes(payload.d.channel_id)) {
          console.log('Message filtered out - channel not in filter list');
          break;
        }
        
        // Get channel name for display
        let channelName = 'Direct Message';
        if (payload.d.guild_id) {
          const guildName = this.guildNames.get(payload.d.guild_id) || 'Unknown Server';
          let channelNameOnly = this.channelNames.get(payload.d.channel_id);
          
          // If channel not cached, try to get it from the message event
          if (!channelNameOnly && payload.d.channel_id) {
            // Discord sometimes includes channel info in messages
            // For now, we'll use the channel ID as a fallback
            channelNameOnly = `channel-${payload.d.channel_id.slice(-6)}`;
            console.log(`Channel ${payload.d.channel_id} not in cache, using fallback name`);
          }
          
          channelName = `${guildName} #${channelNameOnly || 'unknown'}`;
        }
        
        console.log('Adding message to store:', payload.d.content);
        
        messagesStore.addMessage({
          platform: 'discord',
          author: payload.d.author.username,
          content: payload.d.content,
          avatarUrl: payload.d.author.avatar 
            ? `https://cdn.discordapp.com/avatars/${payload.d.author.id}/${payload.d.author.avatar}.png`
            : undefined,
          channelId: payload.d.channel_id,
          channelName: channelName,
          isDM: !payload.d.guild_id
        });
        break;
        
      case 'RESUMED':
        connectionsStore.setConnected('discord');
        console.log('Discord session resumed');
        break;
    }
  }

  private identify() {
    this.send({
      op: 2,
      d: {
        token: this.token,
        intents: 1 | 512 | 1024 | 32768, // GUILDS + GUILD_MESSAGES + DIRECT_MESSAGES + MESSAGE_CONTENT
        properties: {
          browser: 'Notification Hub',
          device: 'Notification Hub',
          os: navigator.platform
        }
      }
    });
  }

  private resume() {
    if (!this.sessionId || this.sequence === null) {
      this.identify();
      return;
    }

    this.send({
      op: 6,
      d: {
        token: this.token,
        session_id: this.sessionId,
        seq: this.sequence
      }
    });
  }

  private startHeartbeat(interval: number) {
    this.stopHeartbeat();
    this.sendHeartbeat();
    
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat() {
    this.send({
      op: 1,
      d: this.sequence
    });
  }

  private send(data: DiscordGatewayPayload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private reconnect() {
    this.cleanup();
    this.connect();
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect() {
    this.isDestroyed = true;
    this.cleanup();
    connectionsStore.disconnect('discord');
  }
}