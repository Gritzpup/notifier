// Environment variable configuration
export const config = {
  discord: {
    token: import.meta.env.VITE_DISCORD_TOKEN || '',
    // Optional: specify channel IDs to monitor, leave empty for all channels
    channels: (import.meta.env.VITE_DISCORD_CHANNELS || '').split(',').filter((c: string) => c.trim())
  },
  telegram: {
    botToken: import.meta.env.VITE_TELEGRAM_TOKEN || '',
    // Optional: specify group/chat IDs to monitor, leave empty for all groups
    groups: (import.meta.env.VITE_TELEGRAM_GROUPS || '').split(',').filter((g: string) => g.trim()),
    // Optional: specify group/chat IDs to exclude from monitoring
    excludeGroups: (import.meta.env.VITE_TELEGRAM_EXCLUDE_GROUPS || '').split(',').filter((g: string) => g.trim())
  },
  twitch: {
    username: import.meta.env.VITE_TWITCH_USERNAME || '',
    oauth: import.meta.env.VITE_TWITCH_OAUTH || '',
    channels: (import.meta.env.VITE_TWITCH_CHANNELS || '').split(',').filter((c: string) => c.trim()),
    clientId: import.meta.env.VITE_TWITCH_CLIENT_ID || '',
    clientSecret: import.meta.env.VITE_TWITCH_CLIENT_SECRET || '',
    streamMonitors: (import.meta.env.VITE_TWITCH_STREAM_MONITORS || '').split(',').filter((c: string) => c.trim())
  }
};

export function hasDiscordConfig(): boolean {
  return Boolean(config.discord.token);
}

export function hasTelegramConfig(): boolean {
  return Boolean(config.telegram.botToken);
}

export function hasTwitchConfig(): boolean {
  return Boolean(config.twitch.username && config.twitch.oauth && config.twitch.channels.length > 0);
}