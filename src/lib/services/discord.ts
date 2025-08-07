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
  private isConnecting = false;
  private lastConnectionAttempt = 0;
  private connectionCooldown = 5000; // Start with 5 seconds
  private maxConnectionCooldown = 300000; // Max 5 minutes
  private authenticationFailed = false;
  private authenticatedUserId: string | null = null;
  private voiceStates: Map<string, string | null> = new Map(); // userId -> channelId

  constructor(token: string, channelFilter: string[] = []) {
    this.token = token;
    this.channelFilter = channelFilter;
  }

  connect() {
    if (this.isDestroyed || this.authenticationFailed) {
      console.log('[Discord] Connection blocked:', this.authenticationFailed ? 'Authentication failed' : 'Service destroyed');
      return;
    }
    
    // Check if we're already connecting
    if (this.isConnecting) {
      console.log('[Discord] Already connecting, skipping duplicate attempt');
      return;
    }
    
    // Check connection cooldown
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastConnectionAttempt;
    if (timeSinceLastAttempt < this.connectionCooldown) {
      const waitTime = Math.ceil((this.connectionCooldown - timeSinceLastAttempt) / 1000);
      console.log(`[Discord] Connection cooldown active. Wait ${waitTime}s before reconnecting.`);
      connectionsStore.setError('discord', `Cooldown: ${waitTime}s`);
      return;
    }
    
    this.isConnecting = true;
    this.lastConnectionAttempt = now;
    connectionsStore.setConnecting('discord');
    
    try {
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
      
      this.ws.onopen = () => {
        console.log('[Discord] WebSocket connected');
        this.reconnectAttempts = 0;
        this.connectionCooldown = 5000; // Reset cooldown on successful connection
        this.isConnecting = false;
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
        console.log('[Discord] WebSocket closed:', event.code, event.reason);
        this.cleanup();
        this.isConnecting = false;
        
        // Check for authentication failure (4004)
        if (event.code === 4004) {
          console.error('[Discord] Authentication failed - invalid token');
          this.authenticationFailed = true;
          connectionsStore.setError('discord', 'Invalid token - please check your Discord bot token');
          return;
        }
        
        // Check for other unrecoverable errors
        if (event.code === 4010 || event.code === 4011) {
          console.error('[Discord] Unrecoverable error:', event.reason);
          this.authenticationFailed = true;
          connectionsStore.setError('discord', event.reason || 'Unrecoverable error');
          return;
        }
        
        if (!this.isDestroyed && !this.authenticationFailed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          // Exponential backoff with max limit
          this.connectionCooldown = Math.min(this.connectionCooldown * 2, this.maxConnectionCooldown);
          const delay = this.connectionCooldown;
          console.log(`[Discord] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
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
        this.authenticatedUserId = payload.d.user.id;
        connectionsStore.setConnected('discord');
        console.log('[Discord] Connected as:', payload.d.user.username);
        console.log('[Discord] Bot in', payload.d.guilds?.length || 0, 'guilds');
        
        if (!payload.d.guilds || payload.d.guilds.length === 0) {
          console.log('[Discord] ⚠️ Bot not in any servers! Add bot:', `https://discord.com/api/oauth2/authorize?client_id=${payload.d.user.id}&permissions=274877974528&scope=bot`);
        }
        break;
        
      case 'GUILD_CREATE':
        // Cache guild and channel names
        this.guildNames.set(payload.d.id, payload.d.name);
        console.log(`[Discord] Joined guild: ${payload.d.name}`);
        
        if (payload.d.channels) {
          payload.d.channels.forEach((channel: any) => {
            if (channel.type === 0 || channel.type === 2) {
              this.channelNames.set(channel.id, channel.name);
            }
          });
        }
        break;
        
      case 'GUILD_DELETE':
        const guildName = this.guildNames.get(payload.d.id) || 'Unknown';
        this.guildNames.delete(payload.d.id);
        console.log(`[Discord] Left guild: ${guildName}`);
        break;
        
      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE':
        // Cache channel when it's created or updated
        if ((payload.d.type === 0 || payload.d.type === 2) && payload.d.guild_id) {
          this.channelNames.set(payload.d.id, payload.d.name);
        }
        break;
        
      case 'MESSAGE_CREATE':
        console.log(`[Discord] MESSAGE_CREATE from ${payload.d.author.username} (${payload.d.author.id})`);
        
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
            // Detected user join message
          } else if (allText.includes('left') || allText.includes('goodbye') || allText.includes('has left') || allText.includes('disconnected')) {
            messageType = 'user_leave';
            shouldProcessBotMessage = true;
            // Detected user leave message
          }
          
          // Skip other bot messages
          if (!shouldProcessBotMessage) {
            break;
          }
        }
        
        // Check if this is a relayed message from another platform
        const messageContent = payload.d.content || '';
        const relayPrefixes = ['[Telegram]', '[Twitch]'];
        const isRelayedMessage = relayPrefixes.some(prefix => 
          messageContent.trimStart().startsWith(prefix)
        );
        
        if (isRelayedMessage) {
          console.log('[Discord] Skipping relayed message:', messageContent.substring(0, 50) + '...');
          break;
        }
        
        // Filter by channel if specified
        if (this.channelFilter.length > 0 && !this.channelFilter.includes(payload.d.channel_id)) {
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
            // Channel not in cache, using fallback name
          }
          
          channelName = `${guildName} #${channelNameOnly || 'unknown'}`;
        }
        
        // Parse stickers - Discord sends both stickers and sticker_items
        const stickerData = payload.d.stickers || payload.d.sticker_items;
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
          fields: embed.fields,
          image: embed.image ? {
            url: embed.image.url,
            proxy_url: embed.image.proxy_url,
            width: embed.image.width,
            height: embed.image.height
          } : undefined,
          video: embed.video ? {
            url: embed.video.url,
            proxy_url: embed.video.proxy_url,
            width: embed.video.width,
            height: embed.video.height
          } : undefined,
          provider: embed.provider ? {
            name: embed.provider.name,
            url: embed.provider.url
          } : undefined
        }));
        
        // Parse attachments
        const attachments = payload.d.attachments?.map((attachment: any) => ({
          id: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          url: attachment.url,
          proxy_url: attachment.proxy_url,
          content_type: attachment.content_type,
          width: attachment.width,
          height: attachment.height
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
        
        // Handle reply to message
        let replyTo = undefined;
        if (payload.d.message_reference) {
          console.log('[Discord] Message has reference:', payload.d.message_reference);
          console.log('[Discord] Referenced message data:', payload.d.referenced_message);
        }
        
        if (payload.d.referenced_message) {
          const replyMsg = payload.d.referenced_message;
          const replyAuthor = replyMsg.author?.username || 'Unknown';
          const replyContent = replyMsg.content || '[Embed/Attachment]';
          
          replyTo = {
            author: replyAuthor,
            content: replyContent.length > 100 ? replyContent.substring(0, 100) + '...' : replyContent
          };
          console.log('[Discord] Reply context:', replyTo);
        }
        
        // Add message to store
        console.log(`[Discord] Adding message to store from ${payload.d.author.username}: ${displayContent}`);
        
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
          embeds: embeds,
          attachments: attachments,
          replyTo: replyTo
        });
        break;
        
      case 'RESUMED':
        connectionsStore.setConnected('discord');
        console.log('[Discord] Session resumed');
        break;
        
      case 'GUILD_MEMBER_ADD':
        console.log(`[Discord] Member joined: ${payload.d.user.username} in guild ${payload.d.guild_id}`);
        
        // Get guild name
        const joinGuildName = this.guildNames.get(payload.d.guild_id) || 'Unknown Server';
        
        // Create system message for member join
        messagesStore.addMessage({
          platform: 'discord',
          author: 'System',
          content: `A wild ${payload.d.user.username} appeared!`,
          avatarUrl: payload.d.user.avatar 
            ? `https://cdn.discordapp.com/avatars/${payload.d.user.id}/${payload.d.user.avatar}.png`
            : undefined,
          channelId: payload.d.guild_id,
          channelName: joinGuildName,
          messageType: 'user_join',
          isDM: false,
          isBot: payload.d.user.bot
        });
        break;
        
      case 'GUILD_MEMBER_REMOVE':
        console.log(`[Discord] Member left: ${payload.d.user.username} from guild ${payload.d.guild_id}`);
        
        // Get guild name
        const leaveGuildName = this.guildNames.get(payload.d.guild_id) || 'Unknown Server';
        
        // Create system message for member leave
        messagesStore.addMessage({
          platform: 'discord',
          author: 'System',
          content: `${payload.d.user.username} has left the server`,
          avatarUrl: payload.d.user.avatar 
            ? `https://cdn.discordapp.com/avatars/${payload.d.user.id}/${payload.d.user.avatar}.png`
            : undefined,
          channelId: payload.d.guild_id,
          channelName: leaveGuildName,
          messageType: 'user_leave',
          isDM: false,
          isBot: payload.d.user.bot
        });
        break;
        
      case 'VOICE_STATE_UPDATE':
        const userId = payload.d.user_id;
        const newChannelId = payload.d.channel_id;
        const previousChannelId = this.voiceStates.get(userId) || null;
        const audioGeneralChannelId = '1397623339660607531';
        
        // Update voice state
        if (newChannelId) {
          this.voiceStates.set(userId, newChannelId);
        } else {
          this.voiceStates.delete(userId);
        }
        
        // Check if user joined or left the audio general channel
        if (newChannelId === audioGeneralChannelId && previousChannelId !== audioGeneralChannelId) {
          // User joined audio general
          console.log(`[Discord] User ${payload.d.member?.user?.username || userId} joined audio general`);
          
          messagesStore.addMessage({
            platform: 'discord',
            author: 'System',
            content: `🎤 **${payload.d.member?.user?.username || 'Someone'}** joined audio general`,
            avatarUrl: payload.d.member?.user?.avatar 
              ? `https://cdn.discordapp.com/avatars/${userId}/${payload.d.member.user.avatar}.png`
              : undefined,
            channelId: audioGeneralChannelId,
            channelName: 'audio general',
            messageType: 'system',
            isDM: false
          });
        } else if (previousChannelId === audioGeneralChannelId && newChannelId !== audioGeneralChannelId) {
          // User left audio general
          console.log(`[Discord] User ${payload.d.member?.user?.username || userId} left audio general`);
          
          messagesStore.addMessage({
            platform: 'discord',
            author: 'System',
            content: `👋 **${payload.d.member?.user?.username || 'Someone'}** left audio general`,
            avatarUrl: payload.d.member?.user?.avatar 
              ? `https://cdn.discordapp.com/avatars/${userId}/${payload.d.member.user.avatar}.png`
              : undefined,
            channelId: audioGeneralChannelId,
            channelName: 'audio general',
            messageType: 'system',
            isDM: false
          });
        }
        break;
    }
  }

  private identify() {
    this.send({
      op: 2,
      d: {
        token: this.token,
        intents: 1 | 2 | 128 | 512 | 1024 | 32768, // GUILDS + GUILD_MEMBERS + GUILD_VOICE_STATES + GUILD_MESSAGES + DIRECT_MESSAGES + MESSAGE_CONTENT
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
    this.isConnecting = false;
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