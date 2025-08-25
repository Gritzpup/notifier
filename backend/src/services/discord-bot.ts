import { Client, GatewayIntentBits, Message, PartialMessage } from 'discord.js';
import { Server } from 'socket.io';

export class DiscordBotService {
  private client: Client | null = null;
  private io: Server;
  private isConnected = false;
  private sendOnlyMode = false; // Disable send-only mode to receive messages

  constructor(io: Server) {
    this.io = io;
  }

  async connect(token: string) {
    if (this.isConnected || !token) return;

    try {
      // In send-only mode, we still connect but only for sending notifications
      if (this.sendOnlyMode) {
        console.log('[Discord Bot] Running in send-only mode (message receiving disabled to avoid conflicts with relayer)');
      }

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages
        ],
        partials: []
      });

      this.client.on('ready', () => {
        console.log(`[Discord Bot] Connected as ${this.client?.user?.tag} ${this.sendOnlyMode ? '(send-only mode)' : ''}`);
        this.isConnected = true;
        
        // Broadcast connection status
        this.io.emit('service-status', {
          platform: 'discord',
          connected: true,
          username: this.client?.user?.username,
          mode: this.sendOnlyMode ? 'send-only' : 'full'
        });
      });

      // Only register message handlers if not in send-only mode
      if (!this.sendOnlyMode) {
        this.client.on('messageCreate', (message: Message) => {
          if (message.author.bot) return;

        const messageData = {
          id: `discord-${message.id}`,
          platform: 'discord',
          platformMessageId: message.id,
          author: message.author.username,
          content: message.content,
          avatarUrl: message.author.displayAvatarURL() || `https://cdn.discordapp.com/embed/avatars/${parseInt(message.author.discriminator || '0') % 5}.png`,
          channelId: message.channelId,
          channelName: message.channel.type === 1 ? 'Direct Message' : 
                       (message.channel as any).name || 'Unknown',
          serverId: message.guildId || undefined,
          serverName: message.guild?.name || undefined,
          isDM: message.channel.type === 1,
          timestamp: message.createdTimestamp
        };

        // Broadcast to all connected clients
        this.io.emit('new-message', messageData);
      });

      this.client.on('messageDelete', (message: Message | PartialMessage) => {
        this.io.emit('message-deleted', {
          platform: 'discord',
          platformMessageId: message.id
        });
      });

      this.client.on('messageUpdate', (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
        if (newMessage.partial) return;
        
        this.io.emit('message-updated', {
          platform: 'discord',
          platformMessageId: newMessage.id,
          newContent: newMessage.content
        });
      });
      } // End of if (!this.sendOnlyMode)

      this.client.on('error', (error) => {
        console.error('[Discord Bot] Error:', error);
        this.io.emit('service-error', {
          platform: 'discord',
          error: error.message
        });
      });

      await this.client.login(token);
    } catch (error) {
      console.error('[Discord Bot] Connection failed:', error);
      this.io.emit('service-error', {
        platform: 'discord',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.isConnected = false;
      
      this.io.emit('service-status', {
        platform: 'discord',
        connected: false
      });
    }
  }

  getStatus() {
    return {
      platform: 'discord',
      connected: this.isConnected,
      username: this.client?.user?.username,
      mode: this.sendOnlyMode ? 'send-only' : 'full'
    };
  }

  // Method to send notifications to Discord
  async sendNotification(channelId: string, message: string) {
    if (!this.client || !this.isConnected) {
      throw new Error('Discord bot not connected');
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }
      
      // Check if channel is text-based and can send messages
      if ('send' in channel && typeof channel.send === 'function') {
        const sentMessage = await channel.send(message);
        return sentMessage;
      } else {
        throw new Error('Channel does not support sending messages');
      }
    } catch (error) {
      console.error('[Discord Bot] Failed to send notification:', error);
      throw error;
    }
  }
}