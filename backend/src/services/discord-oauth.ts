import fetch from 'node-fetch';
import { Socket } from 'socket.io';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class DiscordOAuthService {
  private accessToken: string;
  private socket: Socket;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastMessageIds: Map<string, string> = new Map();
  
  constructor(accessToken: string, socket: Socket) {
    this.accessToken = accessToken;
    this.socket = socket;
  }
  
  async startPolling() {
    // Get initial DM channels
    await this.pollDMs();
    
    // Poll every 5 seconds
    this.pollingInterval = setInterval(() => {
      this.pollDMs();
    }, 5000);
  }
  
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  private async pollDMs() {
    try {
      // Get DM channels
      const channelsResponse = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (!channelsResponse.ok) {
        throw new Error('Failed to fetch DM channels');
      }
      
      const channels = await channelsResponse.json() as any[];
      
      // Fetch messages from each DM channel
      for (const channel of channels) {
        if (channel.type === 1) { // DM channel
          await this.fetchChannelMessages(channel);
        }
      }
    } catch (error) {
      console.error('DM polling error:', error);
      this.socket.emit('dm-error', { error: 'Failed to poll DMs' });
    }
  }
  
  private async fetchChannelMessages(channel: any) {
    try {
      const lastMessageId = this.lastMessageIds.get(channel.id);
      const params = new URLSearchParams({
        limit: '10'
      });
      
      if (lastMessageId) {
        params.append('after', lastMessageId);
      }
      
      const messagesResponse = await fetch(
        `${DISCORD_API_BASE}/channels/${channel.id}/messages?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );
      
      if (!messagesResponse.ok) {
        return;
      }
      
      const messages = await messagesResponse.json() as any[];
      
      // Process new messages
      if (messages.length > 0) {
        // Update last message ID
        this.lastMessageIds.set(channel.id, messages[0].id);
        
        // Send messages to frontend (newest first, so reverse)
        messages.reverse().forEach(message => {
          this.socket.emit('personal-dm', {
            id: message.id,
            author: message.author.username,
            content: message.content,
            timestamp: new Date(message.timestamp),
            channelId: channel.id,
            channelName: `DM with ${channel.recipients[0].username}`,
            avatarUrl: message.author.avatar 
              ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`
              : undefined,
            isPersonalDM: true
          });
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages from channel:', channel.id, error);
    }
  }
}