import { writable, derived } from 'svelte/store';

export type Platform = 'discord' | 'telegram' | 'twitch';

export interface DiscordSticker {
  id: string;
  name: string;
  format_type: number;
  type?: number; // 1 = Standard (Discord), 2 = Guild
  guild_id?: string;
  pack_id?: string; // For standard Discord stickers
  asset?: string; // Alternative asset ID
  description?: string;
  tags?: string;
  available?: boolean;
}

export interface DiscordEmoji {
  id: string;
  name: string;
  animated?: boolean;
}

export interface TelegramCustomEmoji {
  id: string;
  name: string;
  url: string;
  offset: number;
  length: number;
  width: number;
  height: number;
  animated: boolean;
}

export interface TwitchEmote {
  id: string;
  name: string;
  positions: Array<[number, number]>;
}

export interface DiscordEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: {
    name: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  image?: {
    url: string;
    proxy_url?: string;
    width?: number;
    height?: number;
  };
  video?: {
    url: string;
    proxy_url?: string;
    width?: number;
    height?: number;
  };
  provider?: {
    name: string;
    url?: string;
  };
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

export type MessageType = 'text' | 'user_join' | 'user_leave' | 'system';

export interface Message {
  id: string;
  platform: Platform;
  author: string;
  content: string;
  timestamp: Date;
  avatarUrl?: string;
  channelId?: string;
  channelName?: string;
  isRead: boolean;
  isDM: boolean;
  messageType?: MessageType;
  stickers?: DiscordSticker[];
  customEmojis?: DiscordEmoji[];
  telegramCustomEmojis?: TelegramCustomEmoji[];
  emotes?: TwitchEmote[];
  embeds?: DiscordEmbed[];
  attachments?: Attachment[];
  isBot?: boolean;
  replyTo?: {
    author: string;
    content: string;
  };
  platformMessageId?: string;
  isStreamNotification?: boolean;
}

export type FilterType = Platform | 'all';

interface MessagesState {
  messages: Message[];
  filter: FilterType;
}

function createMessagesStore() {
  const { subscribe, set, update } = writable<MessagesState>({
    messages: [],
    filter: 'all'
  });

  return {
    subscribe,
    
    addMessage: (message: Omit<Message, 'id' | 'timestamp' | 'isRead'>) => {
      console.log('=== messagesStore.addMessage called ===');
      console.log('Platform:', message.platform);
      console.log('Author:', message.author);
      console.log('Content:', message.content);
      console.log('Is DM:', message.isDM);
      console.log('Channel Name:', message.channelName);
      console.log('Channel ID:', message.channelId);
      
      update(state => {
        // Check for duplicate/relayed messages
        const isDuplicate = state.messages.some(existingMsg => {
          // Skip if same platform - we only check cross-platform duplicates
          if (existingMsg.platform === message.platform) return false;
          
          // Get message content without relay prefixes
          const cleanContent = (content: string) => {
            // Remove common relay prefixes
            return content
              .replace(/^↩️ Replying to .+?: /, '') // Remove Twitch relay prefix
              .replace(/^\[.+?\]\s*/, '') // Remove [Platform] prefix
              .replace(/^.+? \[Telegram\] .+?: /, '') // Remove Telegram relay format
              .replace(/^.+? \[Discord\] .+?: /, '') // Remove Discord relay format
              .trim();
          };
          
          const existingContent = cleanContent(existingMsg.content || '');
          const newContent = cleanContent(message.content || '');
          
          // Check if content matches (case insensitive)
          if (existingContent.toLowerCase() === newContent.toLowerCase()) {
            // Check if messages are within 5 seconds of each other
            const timeDiff = Math.abs(new Date().getTime() - existingMsg.timestamp.getTime());
            if (timeDiff < 5000) {
              console.log(`[Duplicate Detection] Blocking relayed message: "${newContent.substring(0, 50)}..."`);
              return true;
            }
          }
          
          return false;
        });
        
        // Don't add the message if it's a duplicate
        if (isDuplicate) {
          return state;
        }
        
        const newMessage = {
          ...message,
          id: `${message.platform}-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          isRead: false
        };
        
        console.log('Current messages count:', state.messages.length);
        console.log('Current filter:', state.filter);
        
        return {
          ...state,
          messages: [
            ...state.messages,
            newMessage
          ].slice(-500) // Keep last 500 messages
        };
      });
    },
    
    markAsRead: (messageId: string) => {
      update(state => ({
        ...state,
        messages: state.messages.map(msg =>
          msg.id === messageId ? { ...msg, isRead: true } : msg
        )
      }));
    },
    
    markAllAsRead: (platform?: Platform) => {
      update(state => ({
        ...state,
        messages: state.messages.map(msg =>
          !platform || msg.platform === platform ? { ...msg, isRead: true } : msg
        )
      }));
    },
    
    clearMessages: (platform?: Platform) => {
      update(state => ({
        ...state,
        messages: platform
          ? state.messages.filter(msg => msg.platform !== platform)
          : []
      }));
    },
    
    setFilter: (filter: FilterType) => {
      update(state => ({ ...state, filter }));
    },
    
    deleteMessage: (platform: Platform, platformMessageId: string) => {
      console.log(`=== messagesStore.deleteMessage called ===`);
      console.log(`Platform: ${platform}, Platform Message ID: ${platformMessageId}`);
      
      update(state => {
        const messageIndex = state.messages.findIndex(
          msg => msg.platform === platform && msg.platformMessageId === platformMessageId
        );
        
        if (messageIndex !== -1) {
          console.log(`Found message to delete at index ${messageIndex}`);
          const newMessages = [...state.messages];
          newMessages.splice(messageIndex, 1);
          
          return {
            ...state,
            messages: newMessages
          };
        } else {
          console.log(`No message found with platform ${platform} and ID ${platformMessageId}`);
          return state;
        }
      });
    }
  };
}

export const messagesStore = createMessagesStore();

export const filteredMessages = derived(
  messagesStore,
  $store => {
    switch ($store.filter) {
      case 'all':
        return $store.messages;
      case 'discord':
        return $store.messages.filter(msg => msg.platform === 'discord');
      case 'telegram':
        return $store.messages.filter(msg => msg.platform === 'telegram');
      case 'twitch':
        return $store.messages.filter(msg => msg.platform === 'twitch');
      default:
        return $store.messages;
    }
  }
);

export const unreadCount = derived(
  messagesStore,
  $store => {
    const counts = {
      total: $store.messages.filter(msg => !msg.isRead).length,
      discord: $store.messages.filter(msg => msg.platform === 'discord' && !msg.isRead).length,
      telegram: $store.messages.filter(msg => msg.platform === 'telegram' && !msg.isRead).length,
      twitch: $store.messages.filter(msg => msg.platform === 'twitch' && !msg.isRead).length
    };
    
    console.log('Unread count calculation:', {
      total: counts.total,
      discord: counts.discord,
      telegram: counts.telegram,
      twitch: counts.twitch,
      messages: $store.messages.map(m => ({
        platform: m.platform,
        isRead: m.isRead
      }))
    });
    
    return counts;
  }
);