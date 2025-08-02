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
        `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30&allowed_updates=["message"]`,
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

  private handleUpdate(update: TelegramUpdate) {
    if (update.message && update.message.text) {
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
      
      messagesStore.addMessage({
        platform: 'telegram',
        author: authorName,
        content: update.message.text,
        channelId: chat.id.toString(),
        channelName: channelName,
        isDM: isDM
      });
      
      console.log(`Telegram message from ${authorName} in ${channelName}`);
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