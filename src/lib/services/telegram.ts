import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';

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

  constructor(token: string, groupFilter: string[] = []) {
    this.token = token;
    this.groupFilter = groupFilter;
  }

  async connect() {
    if (this.isDestroyed || this.isPolling) return;
    
    connectionsStore.setConnecting('telegram');
    this.isPolling = true;
    
    try {
      // Get bot info first
      const meResponse = await fetch(`https://api.telegram.org/bot${this.token}/getMe`);
      if (!meResponse.ok) {
        throw new Error('Invalid bot token');
      }
      
      const meData = await meResponse.json();
      console.log('Telegram connected as:', meData.result.username);
      connectionsStore.setConnected('telegram');
      this.reconnectAttempts = 0;
      
      // Start polling
      this.poll();
    } catch (error) {
      console.error('Failed to connect to Telegram:', error);
      connectionsStore.setError('telegram', 'Failed to connect');
      this.isPolling = false;
      
      if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectAttempts * 2000, 10000);
        this.pollingTimeout = window.setTimeout(() => this.connect(), delay);
      }
    }
  }

  private async poll() {
    if (this.isDestroyed || !this.isPolling) return;
    
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
      
      // Continue polling
      if (this.isPolling && !this.isDestroyed) {
        this.poll();
      }
    } catch (error) {
      console.error('Telegram polling error:', error);
      
      if (!this.isDestroyed) {
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
        channelName = chat.title || `Group ${chat.id}`;
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
      
      // Handle document messages
      if (update.message.document) {
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
      
      // Only add message if there's content or attachments
      if (content || attachments.length > 0) {
        messagesStore.addMessage({
          platform: 'telegram',
          author: authorName,
          content: content,
          avatarUrl: avatarUrl || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          channelId: chat.id.toString(),
          channelName: channelName,
          isDM: isDM
        });
        
        console.log(`Telegram message from ${authorName} in ${channelName}`);
        if (attachments.length > 0) {
          console.log(`  with ${attachments.length} attachment(s)`);
        }
      }
    }
  }

  disconnect() {
    this.isDestroyed = true;
    this.isPolling = false;
    
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
    
    connectionsStore.disconnect('telegram');
  }
}