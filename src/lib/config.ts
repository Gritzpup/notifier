// Environment variable configuration
export const config = {
  discord: {
    token: import.meta.env.VITE_DISCORD_TOKEN || '',
    // Optional: specify channel IDs to monitor, leave empty for all channels
    channels: (import.meta.env.VITE_DISCORD_CHANNELS || '').split(',').filter(c => c.trim())
  },
  telegram: {
    botToken: import.meta.env.VITE_TELEGRAM_TOKEN || ''
  },
  twitch: {
    username: import.meta.env.VITE_TWITCH_USERNAME || '',
    oauth: import.meta.env.VITE_TWITCH_OAUTH || '',
    channels: (import.meta.env.VITE_TWITCH_CHANNELS || '').split(',').filter(c => c.trim())
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