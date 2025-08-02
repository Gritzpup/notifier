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
        console.log('Is bot:', payload.d.author.bot);
        console.log('Message content:', payload.d.content);
        console.log('Embeds:', payload.d.embeds?.length || 0);
        console.log('Stickers:', payload.d.sticker_items?.length || 0);
        if (payload.d.sticker_items?.length > 0) {
          console.log('Full sticker payload:', JSON.stringify({
            sticker_items: payload.d.sticker_items,
            type: payload.d.type
          }, null, 2));
        }
        
        // Check if this is a bot message with arrival/departure information
        let messageType: 'text' | 'user_join' | 'user_leave' | 'system' = 'text';
        let shouldProcessBotMessage = false;
        
        if (payload.d.author.bot) {
          // Check for common arrival/departure patterns in embeds or content
          const content = payload.d.content?.toLowerCase() || '';
          const embedDescriptions = payload.d.embeds?.map((e: any) => e.description?.toLowerCase() || '').join(' ') || '';
          const allText = content + ' ' + embedDescriptions;
          
          if (allText.includes('joined') || allText.includes('welcome') || allText.includes('is here') || allText.includes('has arrived')) {
            messageType = 'user_join';
            shouldProcessBotMessage = true;
            console.log('Detected user join message');
          } else if (allText.includes('left') || allText.includes('goodbye') || allText.includes('has left') || allText.includes('disconnected')) {
            messageType = 'user_leave';
            shouldProcessBotMessage = true;
            console.log('Detected user leave message');
          }
          
          // Skip other bot messages
          if (!shouldProcessBotMessage) {
            console.log('Skipping non-arrival/departure bot message');
            break;
          }
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
        
        // Parse stickers - Discord sends both stickers and sticker_items
        const stickerData = payload.d.stickers || payload.d.sticker_items;
        if (stickerData && stickerData.length > 0) {
          console.log('Raw sticker data:', JSON.stringify(stickerData, null, 2));
        }
        const stickers = stickerData?.map((sticker: any) => ({
          id: sticker.id,
          name: sticker.name,
          format_type: sticker.format_type,
          type: sticker.type, // 1 = Standard (Discord), 2 = Guild
          guild_id: sticker.guild_id,
          pack_id: sticker.pack_id, // For standard Discord stickers
          asset: sticker.asset, // Alternative asset ID
          description: sticker.description,
          tags: sticker.tags,
          available: sticker.available
        }));
        
        // Parse custom emojis from content
        const customEmojis: any[] = [];
        const emojiRegex = /<(a?):(\w+):(\d+)>/g;
        let match;
        while ((match = emojiRegex.exec(payload.d.content)) !== null) {
          customEmojis.push({
            id: match[3],
            name: match[2],
            animated: match[1] === 'a'
          });
        }
        
        // Parse embeds
        const embeds = payload.d.embeds?.map((embed: any) => ({
          title: embed.title,
          description: embed.description,
          color: embed.color,
          author: embed.author ? {
            name: embed.author.name,
            icon_url: embed.author.icon_url
          } : undefined,
          fields: embed.fields
        }));
        
        // Build display content
        let displayContent = payload.d.content || '';
        if (messageType === 'user_join' || messageType === 'user_leave') {
          // For bot messages, also include embed descriptions
          if (embeds && embeds.length > 0) {
            const embedText = embeds.map((e: any) => e.description || e.title || '').filter(Boolean).join(' - ');
            if (embedText) {
              displayContent = displayContent ? `${displayContent} - ${embedText}` : embedText;
            }
          }
        }
        
        console.log('Adding message to store:', displayContent);
        console.log('Message type:', messageType);
        console.log('Stickers:', stickers?.length || 0);
        console.log('Custom emojis:', customEmojis.length);
        
        messagesStore.addMessage({
          platform: 'discord',
          author: payload.d.author.username,
          content: displayContent,
          avatarUrl: payload.d.author.avatar 
            ? `https://cdn.discordapp.com/avatars/${payload.d.author.id}/${payload.d.author.avatar}.png`
            : undefined,
          channelId: payload.d.channel_id,
          channelName: channelName,
          isDM: !payload.d.guild_id,
          messageType: messageType,
          isBot: payload.d.author.bot,
          stickers: stickers,
          customEmojis: customEmojis.length > 0 ? customEmojis : undefined,
          embeds: embeds
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