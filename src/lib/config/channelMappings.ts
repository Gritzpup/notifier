// Channel mappings from the relayer project
// Maps channel IDs to human-readable names

export interface ChannelMapping {
  discord?: string;
  telegram?: string | null;
  name: string;
}

// Reverse mappings for quick lookup
export const discordChannelNames: Record<string, string> = {
  '1401061935604174928': 'vent',
  '1402671254896644167': 'test',
  '1402671075816636546': 'dev',
  '1402670920136527902': 'music',
  '1401392870929465384': 'art',
  '1402671738562674741': 'pets',
  '1397623339660607530': 'general',
  '1397623339660607531': 'audio general' // Voice channel
};

// Telegram topic IDs to names (null means general chat)
export const telegramTopicNames: Record<string, string> = {
  '104': 'vent',
  '918': 'test',
  '774': 'dev',
  '453': 'music',
  '432': 'art',
  '748': 'pets',
  '4680': 'tech',
  'null': 'general' // Special case for general chat
};

// Helper functions
export function getDiscordChannelName(channelId: string): string {
  return discordChannelNames[channelId] || `channel-${channelId}`;
}

export function getTelegramChannelName(topicId: string | null | undefined): string {
  if (!topicId || topicId === 'null') {
    return 'general';
  }
  return telegramTopicNames[topicId] || `topic-${topicId}`;
}