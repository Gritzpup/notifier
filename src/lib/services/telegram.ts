import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';
import { broadcastService } from './broadcast';
import { leaderElection } from './leader-election';
import { getTelegramChannelName } from '$lib/config/channelMappings';

interface TelegramUpdate {
  update_id: number;
  edited_message?: {
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
      title?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    date: number;
    edit_date?: number;
    text?: string;
  };
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
  public readonly sessionId = crypto.randomUUID();
  public conflictCount = 0;
  public lastPollTime = 0;
  private statusBroadcastInterval: number | null = null;

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
      console.log('[Telegram] Received broadcast status:', status, 'isLeader:', this.isLeaderTab);
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
    
    // Handle status requests from non-leader tabs
    broadcastService.on('telegram-status-request', () => {
      console.log('[Telegram] Received status request, isLeader:', this.isLeaderTab, 'isPolling:', this.isPolling);
      if (this.isLeaderTab && this.isPolling) {
        console.log('[Telegram] Responding to status request with connected status');
        broadcastService.send('telegram-status', { connected: true });
      }
    });
    
    // Listen for deletion events from other tabs
    broadcastService.on('telegram-deletion', (data) => {
      if (!this.isLeaderTab) {
        // Emit the deletion event for this tab's socket
        const event = new CustomEvent('telegram-message-deleted', {
          detail: data
        });
        window.dispatchEvent(event);
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
      // Not the leader, show as connecting and request status from leader
      connectionsStore.setConnecting('telegram');
      console.log('[Telegram] Non-leader tab requesting status from leader');
      
      // Track if we receive a response
      let receivedResponse = false;
      const statusHandler = (status: any) => {
        console.log('[Telegram] Received status response from leader');
        receivedResponse = true;
      };
      
      // Listen for status response
      broadcastService.on('telegram-status', statusHandler);
      
      // Request status after a short delay to ensure leader is set up
      setTimeout(() => {
        broadcastService.send('telegram-status-request', {});
      }, 1000);
      
      // Request again after 3 seconds in case the first was missed
      setTimeout(() => {
        if (!receivedResponse) {
          broadcastService.send('telegram-status-request', {});
        }
      }, 3000);
      
      // If no response after 6 seconds, leader might be unresponsive
      setTimeout(() => {
        if (!receivedResponse && !this.isLeaderTab) {
          console.warn('[Telegram] No response from leader after 6s, leader may be in different browser context');
          // Show a warning status instead of connecting
          connectionsStore.setError('telegram', 'Leader tab not responding - check other browser windows');
        }
        // Clean up the temporary handler
        broadcastService.off('telegram-status', statusHandler);
      }, 6000);
    }
  }
  
  private async startPolling() {
    if (this.isPolling || this.isDestroyed) return;
    
    console.log(`[Telegram] Starting polling - Session: ${this.sessionId.slice(0, 8)}`);
    connectionsStore.setConnecting('telegram');
    broadcastService.send('telegram-status', { connected: false });
    this.isPolling = true;
    this.conflictCount = 0;
    
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
      
      // Broadcast status periodically for new tabs
      if (this.statusBroadcastInterval) {
        clearInterval(this.statusBroadcastInterval);
      }
      this.statusBroadcastInterval = window.setInterval(() => {
        if (this.isLeaderTab && this.isPolling) {
          console.log('[Telegram] Broadcasting connected status');
          broadcastService.send('telegram-status', { connected: true });
        }
      }, 5000); // Every 5 seconds
      
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
    
    if (this.statusBroadcastInterval) {
      clearInterval(this.statusBroadcastInterval);
      this.statusBroadcastInterval = null;
    }
  }

  private async poll() {
    if (this.isDestroyed || !this.isPolling || !this.isLeaderTab) return;
    
    try {
      this.lastPollTime = Date.now();
      console.log(`[Telegram] Starting poll - Session: ${this.sessionId.slice(0, 8)}, Offset: ${this.offset}`);
      
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`,
        { signal: AbortSignal.timeout(35000) } // 35 second timeout (30s long poll + 5s buffer)
      );
      
      if (!response.ok) {
        if (response.status === 409) {
          this.conflictCount++;
          const errorBody = await response.text();
          console.error(`[Telegram] 409 Conflict #${this.conflictCount} - Session: ${this.sessionId.slice(0, 8)}`);
          console.error('[Telegram] Conflict details:', errorBody);
          throw new Error(`Conflict (409) - Another instance is polling. Count: ${this.conflictCount}`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: TelegramResponse = await response.json();
      
      if (data.ok && data.result) {
        for (const update of data.result) {
          this.handleUpdate(update);
          this.offset = update.update_id + 1;
        }
      }
      
      // Reset conflict count on successful poll
      this.conflictCount = 0;
      
      // Continue polling only if we're still the leader
      if (this.isPolling && !this.isDestroyed && this.isLeaderTab) {
        this.poll();
      }
    } catch (error) {
      console.error('[Telegram] Polling error:', error);
      
      if (!this.isDestroyed && this.isLeaderTab) {
        let delay: number;
        
        // Special handling for 409 conflicts
        if (error instanceof Error && error.message.includes('Conflict (409)')) {
          // Use longer delays for conflicts to allow other instance to timeout
          if (this.conflictCount <= 3) {
            delay = 45000; // 45 seconds for first 3 attempts
          } else if (this.conflictCount <= 6) {
            delay = 60000; // 60 seconds for next 3 attempts
          } else {
            // After 6 attempts, force takeover by resetting offset
            console.log('[Telegram] Force takeover after multiple conflicts, resetting offset');
            this.offset = 0;
            delay = 5000;
            this.conflictCount = 0;
          }
          console.log(`[Telegram] Waiting ${delay/1000}s before retry due to conflict`);
        } else {
          // Regular exponential backoff for other errors
          delay = Math.min(Math.pow(2, Math.min(this.reconnectAttempts, 5)) * 1000, 30000);
          this.reconnectAttempts++;
        }
        
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
    // Handle edited messages (check for deletions)
    if (update.edited_message) {
      // Check if the message was deleted (text is empty or undefined)
      if (!update.edited_message.text || update.edited_message.text === '') {
        console.log('[Telegram] Message deletion detected:', update.edited_message.message_id);
        
        // Emit deletion event
        const event = new CustomEvent('telegram-message-deleted', {
          detail: {
            platform: 'telegram',
            platformMessageId: update.edited_message.message_id.toString()
          }
        });
        window.dispatchEvent(event);
        
        // Broadcast deletion to other tabs
        broadcastService.send('telegram-deletion', {
          platform: 'telegram',
          platformMessageId: update.edited_message.message_id.toString()
        });
      }
      return;
    }
    
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
          replyTo: replyTo,
          platformMessageId: update.message.message_id.toString()
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
    
    if (this.statusBroadcastInterval) {
      clearInterval(this.statusBroadcastInterval);
      this.statusBroadcastInterval = null;
    }
    
    // Stop leader election
    leaderElection.stop();
    
    // Clean up broadcast listeners
    broadcastService.off('telegram-message');
    broadcastService.off('telegram-status');
    broadcastService.off('telegram-status-request');
    broadcastService.off('telegram-deletion');
    
    connectionsStore.disconnect('telegram');
  }
}