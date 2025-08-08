import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';
import { broadcastService } from './broadcast';
import { leaderElection } from './leader-election';
import { getTelegramChannelName } from '$lib/config/channelMappings';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string; // For groups/channels
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    date: number;
    text?: string;
    entities?: Array<{
      type: string;
      offset: number;
      length: number;
      url?: string;
      user?: any;
      language?: string;
      custom_emoji_id?: string;
    }>;
    caption_entities?: Array<{
      type: string;
      offset: number;
      length: number;
      url?: string;
      user?: any;
      language?: string;
      custom_emoji_id?: string;
    }>;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size?: number;
      width: number;
      height: number;
    }>;
    caption?: string;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    animation?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      duration: number;
      thumbnail?: {
        file_id: string;
        file_unique_id: string;
        width: number;
        height: number;
      };
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    sticker?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      is_animated?: boolean;
      is_video?: boolean;
      thumbnail?: {
        file_id: string;
        file_unique_id: string;
        width: number;
        height: number;
      };
      emoji?: string;
      set_name?: string;
      file_size?: number;
    };
    message_thread_id?: number; // For forum topics
    reply_to_message?: any; // Already handled in the code
  };
}

interface TelegramResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

export class TelegramService {
  private token: string;
  private groupFilter: string[];
  private offset = 0;
  private isPolling = false;
  private isDestroyed = false;
  private pollingTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private userPhotoCache = new Map<number, string | null>(); // Cache user photos
  private isLeaderTab = false;

  constructor(token: string, groupFilter: string[] = []) {
    this.token = token;
    this.groupFilter = groupFilter;
    
    // Listen for messages broadcast from other tabs
    broadcastService.on('telegram-message', (messageData) => {
      // Add message to store if we're not the leader (leader already added it)
      if (!this.isLeaderTab) {
        messagesStore.addMessage(messageData);
      }
    });
    
    // Listen for connection status updates from leader
    broadcastService.on('telegram-status', (status) => {
      if (!this.isLeaderTab) {
        if (status.connected) {
          connectionsStore.setConnected('telegram');
        } else if (status.error) {
          connectionsStore.setError('telegram', status.error);
        } else {
          connectionsStore.setConnecting('telegram');
        }
      }
    });
  }

  async connect() {
    if (this.isDestroyed) return;
    
    // Start leader election
    leaderElection.start((isLeader) => {
      this.isLeaderTab = isLeader;
      
      if (isLeader && !this.isPolling && !this.isDestroyed) {
        console.log('[Telegram] This tab is now the leader, starting polling');
        this.startPolling();
      } else if (!isLeader && this.isPolling) {
        console.log('[Telegram] This tab lost leadership, stopping polling');
        this.stopPolling();
      }
    });
    
    // If we're already the leader, start polling
    if (leaderElection.getIsLeader()) {
      this.isLeaderTab = true;
      this.startPolling();
    } else {
      // Not the leader, just show as connected if another tab is polling
      connectionsStore.setConnecting('telegram');
      // The leader tab will broadcast the actual status
    }
  }
  
  private async startPolling() {
    if (this.isPolling || this.isDestroyed) return;
    
    connectionsStore.setConnecting('telegram');
    broadcastService.send('telegram-status', { connected: false });
    this.isPolling = true;
    
    try {
      // Get bot info first
      const meResponse = await fetch(`https://api.telegram.org/bot${this.token}/getMe`);
      if (!meResponse.ok) {
        throw new Error('Invalid bot token');
      }
      
      const meData = await meResponse.json();
      console.log('[Telegram] Connected as:', meData.result.username);
      connectionsStore.setConnected('telegram');
      broadcastService.send('telegram-status', { connected: true });
      this.reconnectAttempts = 0;
      
      // Start polling
      this.poll();
    } catch (error) {
      console.error('[Telegram] Failed to connect:', error);
      const errorMsg = 'Failed to connect';
      connectionsStore.setError('telegram', errorMsg);
      broadcastService.send('telegram-status', { error: errorMsg });
      this.isPolling = false;
      
      if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectAttempts * 2000, 10000);
        this.pollingTimeout = window.setTimeout(() => this.startPolling(), delay);
      }
    }
  }
  
  private stopPolling() {
    this.isPolling = false;
    
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
  }

  private async poll() {
    if (this.isDestroyed || !this.isPolling || !this.isLeaderTab) return;
    
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`,
        { signal: AbortSignal.timeout(35000) } // 35 second timeout (30s long poll + 5s buffer)
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: TelegramResponse = await response.json();
      
      if (data.ok && data.result) {
        for (const update of data.result) {
          this.handleUpdate(update);
          this.offset = update.update_id + 1;
        }
      }
      
      // Continue polling only if we're still the leader
      if (this.isPolling && !this.isDestroyed && this.isLeaderTab) {
        this.poll();
      }
    } catch (error) {
      console.error('[Telegram] Polling error:', error);
      
      if (!this.isDestroyed && this.isLeaderTab) {
        // Retry with exponential backoff
        const delay = Math.min(Math.pow(2, Math.min(this.reconnectAttempts, 5)) * 1000, 30000);
        this.pollingTimeout = window.setTimeout(() => this.poll(), delay);
      }
    }
  }

  private async getUserPhoto(userId: number): Promise<string | null> {
    // Check cache first
    if (this.userPhotoCache.has(userId)) {
      return this.userPhotoCache.get(userId) || null;
    }
    
    try {
      // Get user profile photos
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getUserProfilePhotos?user_id=${userId}&limit=1`
      );
      
      if (!response.ok) {
        console.error('Failed to fetch user photos:', response.status);
        this.userPhotoCache.set(userId, null);
        return null;
      }
      
      const data = await response.json();
      
      if (data.ok && data.result.photos && data.result.photos.length > 0) {
        // Get the smallest photo size (usually the first one)
        const photo = data.result.photos[0][0]; // First photo, smallest size
        
        // Get file path
        const fileResponse = await fetch(
          `https://api.telegram.org/bot${this.token}/getFile?file_id=${photo.file_id}`
        );
        
        if (!fileResponse.ok) {
          console.error('Failed to fetch file path:', fileResponse.status);
          this.userPhotoCache.set(userId, null);
          return null;
        }
        
        const fileData = await fileResponse.json();
        
        if (fileData.ok && fileData.result.file_path) {
          const photoUrl = `https://api.telegram.org/file/bot${this.token}/${fileData.result.file_path}`;
          this.userPhotoCache.set(userId, photoUrl);
          return photoUrl;
        }
      }
      
      // No photo found
      this.userPhotoCache.set(userId, null);
      return null;
    } catch (error) {
      console.error('Error fetching user photo:', error);
      this.userPhotoCache.set(userId, null);
      return null;
    }
  }

  private async getFileUrl(fileId: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getFile?file_id=${fileId}`
      );
      
      if (!response.ok) {
        console.error('Failed to fetch file info:', response.status);
        return null;
      }
      
      const data = await response.json();
      
      if (data.ok && data.result.file_path) {
        return `https://api.telegram.org/file/bot${this.token}/${data.result.file_path}`;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching file URL:', error);
      return null;
    }
  }

  private async getCustomEmojis(customEmojiIds: string[]): Promise<Map<string, any>> {
    const emojiMap = new Map<string, any>();
    
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getCustomEmojiStickers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_emoji_ids: customEmojiIds })
        }
      );
      
      if (!response.ok) {
        console.error('Failed to fetch custom emoji stickers:', response.status);
        return emojiMap;
      }
      
      const data = await response.json();
      
      if (data.ok && data.result) {
        for (const sticker of data.result) {
          emojiMap.set(sticker.custom_emoji_id, sticker);
        }
      }
    } catch (error) {
      console.error('Error fetching custom emojis:', error);
    }
    
    return emojiMap;
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (update.message) {
      const chat = update.message.chat;
      const from = update.message.from;
      
      // Skip if we have a filter and this chat is not in the filter
      if (this.groupFilter.length > 0 && !this.groupFilter.includes(chat.id.toString())) {
        return;
      }
      
      const authorName = from.username || 
        `${from.first_name}${from.last_name ? ' ' + from.last_name : ''}`;
      
      let channelName = '';
      let isDM = false;
      
      if (chat.type === 'private') {
        channelName = authorName;
        isDM = true;
      } else if (chat.type === 'group' || chat.type === 'supergroup') {
        // Check if this is a topic message
        if (update.message.message_thread_id) {
          // It's a topic message, use our mapping
          const topicName = getTelegramChannelName(update.message.message_thread_id.toString());
          channelName = `${chat.title} #${topicName}`;
        } else {
          // It's the general chat or a regular group
          const generalName = getTelegramChannelName(null);
          channelName = `${chat.title} #${generalName}`;
        }
        isDM = false;
      } else {
        // Skip other types like channels unless we add support later
        return;
      }
      
      // Fetch user avatar
      const avatarUrl = await this.getUserPhoto(from.id);
      
      // Prepare content and attachments
      let content = update.message.text || '';
      const attachments: any[] = [];
      const customEmojis: any[] = [];
      
      // Process custom emojis if present
      if (update.message.entities && content) {
        const customEmojiEntities = update.message.entities.filter(e => e.type === 'custom_emoji' && e.custom_emoji_id);
        
        if (customEmojiEntities.length > 0) {
          // Get custom emoji IDs
          const customEmojiIds = customEmojiEntities.map(e => e.custom_emoji_id!);
          
          // Fetch custom emoji stickers
          const customEmojiMap = await this.getCustomEmojis(customEmojiIds);
          
          // Process each custom emoji
          for (const entity of customEmojiEntities) {
            const sticker = customEmojiMap.get(entity.custom_emoji_id!);
            if (sticker) {
              // Get the emoji URL
              const emojiUrl = await this.getFileUrl(sticker.file_id);
              if (emojiUrl) {
                customEmojis.push({
                  id: sticker.file_id,
                  name: sticker.emoji || 'custom_emoji',
                  url: emojiUrl,
                  offset: entity.offset,
                  length: entity.length,
                  width: sticker.width,
                  height: sticker.height,
                  animated: sticker.is_animated || false
                });
              }
            }
          }
        }
      }
      
      // Handle photo messages
      if (update.message.photo && update.message.photo.length > 0) {
        // Get the largest photo
        const largestPhoto = update.message.photo[update.message.photo.length - 1];
        const photoUrl = await this.getFileUrl(largestPhoto.file_id);
        
        if (photoUrl) {
          attachments.push({
            id: largestPhoto.file_id,
            filename: 'photo.jpg',
            size: largestPhoto.file_size || 0,
            url: photoUrl,
            proxy_url: photoUrl,
            content_type: 'image/jpeg',
            width: largestPhoto.width,
            height: largestPhoto.height
          });
        }
        
        // Add caption as content if available
        if (update.message.caption) {
          content = update.message.caption;
        }
      }
      
      // Handle document messages (skip if it's also an animation to avoid duplicates)
      if (update.message.document && !update.message.animation) {
        const doc = update.message.document;
        const docUrl = await this.getFileUrl(doc.file_id);
        
        if (docUrl) {
          attachments.push({
            id: doc.file_id,
            filename: doc.file_name || 'document',
            size: doc.file_size || 0,
            url: docUrl,
            proxy_url: docUrl,
            content_type: doc.mime_type
          });
        }
        
        // Add caption as content if available
        if (update.message.caption) {
          content = update.message.caption;
        }
      }
      
      // Handle animation messages (GIFs)
      if (update.message.animation) {
        const animation = update.message.animation;
        const animationUrl = await this.getFileUrl(animation.file_id);
        
        if (animationUrl) {
          attachments.push({
            id: animation.file_id,
            filename: animation.file_name || 'animation.mp4',
            size: animation.file_size || 0,
            url: animationUrl,
            proxy_url: animationUrl,
            content_type: animation.mime_type || 'video/mp4',
            width: animation.width,
            height: animation.height
          });
        }
        
        // Add caption as content if available
        if (update.message.caption) {
          content = update.message.caption;
        }
      }
      
      // Handle sticker messages
      if (update.message.sticker) {
        const sticker = update.message.sticker;
        const stickerUrl = await this.getFileUrl(sticker.file_id);
        
        if (stickerUrl) {
          // Add sticker as an attachment
          attachments.push({
            id: sticker.file_id,
            filename: `sticker_${sticker.emoji || 'unknown'}.webp`,
            size: sticker.file_size || 0,
            url: stickerUrl,
            proxy_url: stickerUrl,
            content_type: sticker.is_video ? 'video/webm' : 'image/webp',
            width: sticker.width,
            height: sticker.height
          });
        }
      }
      
      // Check if this is a relayed message from another platform
      const relayPrefixes = ['[Discord]', '[Twitch]'];
      const isRelayedMessage = content && relayPrefixes.some(prefix => 
        content.trimStart().startsWith(prefix)
      );
      
      if (isRelayedMessage) {
        console.log('[Telegram] Skipping relayed message:', content.substring(0, 50) + '...');
        return;
      }
      
      // Handle reply to message
      let replyTo = undefined;
      if (update.message.reply_to_message) {
        const replyMsg = update.message.reply_to_message;
        const replyAuthor = replyMsg.from?.username || 
          `${replyMsg.from?.first_name}${replyMsg.from?.last_name ? ' ' + replyMsg.from.last_name : ''}`;
        const replyContent = replyMsg.text || replyMsg.caption || '[Media]';
        
        replyTo = {
          author: replyAuthor,
          content: replyContent.length > 100 ? replyContent.substring(0, 100) + '...' : replyContent
        };
      }
      
      // Only add message if there's content or attachments
      if (content || attachments.length > 0) {
        const messageData = {
          platform: 'telegram',
          author: authorName,
          content: content,
          avatarUrl: avatarUrl || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          telegramCustomEmojis: customEmojis.length > 0 ? customEmojis : undefined,
          channelId: chat.id.toString(),
          channelName: channelName,
          isDM: isDM,
          replyTo: replyTo
        };
        
        // Add to local store
        messagesStore.addMessage(messageData);
        
        // Broadcast to other tabs
        broadcastService.send('telegram-message', messageData);
        
        console.log(`[Telegram] Message from ${authorName} in ${channelName}`);
        if (attachments.length > 0) {
          console.log(`  with ${attachments.length} attachment(s)`);
        }
      }
    }
  }

  disconnect() {
    this.isDestroyed = true;
    this.isPolling = false;
    this.isLeaderTab = false;
    
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
    
    // Stop leader election
    leaderElection.stop();
    
    // Clean up broadcast listeners
    broadcastService.off('telegram-message');
    broadcastService.off('telegram-status');
    
    connectionsStore.disconnect('telegram');
  }
}