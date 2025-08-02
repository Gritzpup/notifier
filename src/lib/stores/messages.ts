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

export interface TwitchEmote {
  id: string;
  name: string;
  positions: Array<[number, number]>;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
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
  emotes?: TwitchEmote[];
  embeds?: DiscordEmbed[];
  attachments?: Attachment[];
  isBot?: boolean;
}

export type FilterType = Platform | 'all' | 'all-dms' | 'discord-dms' | 'telegram-dms' | 'twitch-dms';

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
      update(state => ({
        ...state,
        messages: [
          ...state.messages,
          {
            ...message,
            id: `${message.platform}-${Date.now()}-${Math.random()}`,
            timestamp: new Date(),
            isRead: false
          }
        ].slice(-500) // Keep last 500 messages
      }));
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
      case 'all-dms':
        return $store.messages.filter(msg => msg.isDM);
      case 'discord':
        return $store.messages.filter(msg => msg.platform === 'discord' && !msg.isDM);
      case 'telegram':
        return $store.messages.filter(msg => msg.platform === 'telegram' && !msg.isDM);
      case 'twitch':
        return $store.messages.filter(msg => msg.platform === 'twitch' && !msg.isDM);
      case 'discord-dms':
        return $store.messages.filter(msg => msg.platform === 'discord' && msg.isDM);
      case 'telegram-dms':
        return $store.messages.filter(msg => msg.platform === 'telegram' && msg.isDM);
      case 'twitch-dms':
        return $store.messages.filter(msg => msg.platform === 'twitch' && msg.isDM);
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
      discord: $store.messages.filter(msg => msg.platform === 'discord' && !msg.isRead && !msg.isDM).length,
      telegram: $store.messages.filter(msg => msg.platform === 'telegram' && !msg.isRead && !msg.isDM).length,
      twitch: $store.messages.filter(msg => msg.platform === 'twitch' && !msg.isRead && !msg.isDM).length,
      allDMs: $store.messages.filter(msg => msg.isDM && !msg.isRead).length,
      discordDMs: $store.messages.filter(msg => msg.platform === 'discord' && msg.isDM && !msg.isRead).length,
      telegramDMs: $store.messages.filter(msg => msg.platform === 'telegram' && msg.isDM && !msg.isRead).length,
      twitchDMs: $store.messages.filter(msg => msg.platform === 'twitch' && msg.isDM && !msg.isRead).length
    };
    
    console.log('Unread count calculation:', {
      total: counts.total,
      discord: counts.discord,
      twitch: counts.twitch,
      messages: $store.messages.map(m => ({
        platform: m.platform,
        isDM: m.isDM,
        isRead: m.isRead
      }))
    });
    
    return counts;
  }
);