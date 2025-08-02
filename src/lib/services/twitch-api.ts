// Twitch Helix API client for fetching user data and emotes
interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface TwitchEmoteData {
  id: string;
  name: string;
  images: {
    url_1x: string;
    url_2x: string;
    url_4x: string;
  };
}

export class TwitchAPIClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private userCache = new Map<string, { data: TwitchUser; timestamp: number }>();
  private emotesCache = new Map<string, { data: TwitchEmoteData[]; timestamp: number }>();
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Subtract 1 minute for safety

      return this.accessToken as string;
    } catch (error) {
      console.error('[TwitchAPI] Failed to get access token:', error);
      throw error;
    }
  }

  async getUserByLogin(login: string): Promise<TwitchUser | null> {
    // Check cache first
    const cached = this.userCache.get(login.toLowerCase());
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`[TwitchAPI] Returning cached user data for ${login}`);
      return cached.data;
    }

    try {
      const token = await this.getAccessToken();
      const response = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId,
        },
      });

      if (!response.ok) {
        console.error(`[TwitchAPI] Failed to fetch user ${login}:`, response.statusText);
        return null;
      }

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const user = data.data[0];
        // Cache the result
        this.userCache.set(login.toLowerCase(), {
          data: user,
          timestamp: Date.now(),
        });
        console.log(`[TwitchAPI] Fetched and cached user data for ${login}`);
        return user;
      }

      return null;
    } catch (error) {
      console.error(`[TwitchAPI] Error fetching user ${login}:`, error);
      return null;
    }
  }

  async getGlobalEmotes(): Promise<TwitchEmoteData[]> {
    // Check cache first
    const cached = this.emotesCache.get('global');
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const token = await this.getAccessToken();
      const response = await fetch('https://api.twitch.tv/helix/chat/emotes/global', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId,
        },
      });

      if (!response.ok) {
        console.error('[TwitchAPI] Failed to fetch global emotes:', response.statusText);
        return [];
      }

      const data = await response.json();
      const emotes = data.data || [];
      
      // Cache the result
      this.emotesCache.set('global', {
        data: emotes,
        timestamp: Date.now(),
      });

      return emotes;
    } catch (error) {
      console.error('[TwitchAPI] Error fetching global emotes:', error);
      return [];
    }
  }

  async getChannelEmotes(broadcasterId: string): Promise<TwitchEmoteData[]> {
    // Check cache first
    const cached = this.emotesCache.get(`channel:${broadcasterId}`);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const token = await this.getAccessToken();
      const response = await fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId,
        },
      });

      if (!response.ok) {
        console.error(`[TwitchAPI] Failed to fetch channel emotes for ${broadcasterId}:`, response.statusText);
        return [];
      }

      const data = await response.json();
      const emotes = data.data || [];
      
      // Cache the result
      this.emotesCache.set(`channel:${broadcasterId}`, {
        data: emotes,
        timestamp: Date.now(),
      });

      return emotes;
    } catch (error) {
      console.error(`[TwitchAPI] Error fetching channel emotes for ${broadcasterId}:`, error);
      return [];
    }
  }

  // Clear cache for a specific user
  clearUserCache(login: string) {
    this.userCache.delete(login.toLowerCase());
  }

  // Clear all caches
  clearAllCaches() {
    this.userCache.clear();
    this.emotesCache.clear();
  }
}

// Singleton instance
let twitchAPIClient: TwitchAPIClient | null = null;

export function getTwitchAPIClient(clientId?: string, clientSecret?: string): TwitchAPIClient | null {
  if (!twitchAPIClient && clientId && clientSecret) {
    twitchAPIClient = new TwitchAPIClient(clientId, clientSecret);
  }
  return twitchAPIClient;
}