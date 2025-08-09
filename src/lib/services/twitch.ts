import { messagesStore } from '$lib/stores/messages';
import { connectionsStore } from '$lib/stores/connections';
import { getTwitchAPIClient } from './twitch-api';
import type { TwitchEmote } from '$lib/stores/messages';

interface TwitchCredentials {
  username: string;
  oauth: string;
  channels: string[];
  clientId?: string;
  clientSecret?: string;
}

export class TwitchService {
  private ws: WebSocket | null = null;
  private credentials: TwitchCredentials;
  private pingInterval: number | null = null;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private joinedChannels = new Set<string>();
  private apiClient = null as ReturnType<typeof getTwitchAPIClient>;
  private userAvatarCache = new Map<string, string>();

  constructor(credentials: TwitchCredentials) {
    this.credentials = credentials;
    // Initialize API client if credentials provided
    if (credentials.clientId && credentials.clientSecret) {
      this.apiClient = getTwitchAPIClient(credentials.clientId, credentials.clientSecret);
    }
  }

  connect() {
    if (this.isDestroyed) return;
    
    console.log('[Twitch] Starting connection...');
    console.log('[Twitch] Credentials:', {
      username: this.credentials.username,
      hasOAuth: !!this.credentials.oauth,
      channels: this.credentials.channels
    });
    
    connectionsStore.setConnecting('twitch');
    
    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      console.log('[Twitch] WebSocket created, waiting for connection...');
      
      this.ws.onopen = () => {
        console.log('[Twitch] WebSocket opened, authenticating...');
        this.reconnectAttempts = 0;
        this.authenticate();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        // Don't log whispers for privacy
        if (!event.data.includes('WHISPER')) {
          console.log('[Twitch] Raw message:', event.data);
        }
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Twitch] WebSocket error:', error);
        connectionsStore.setError('twitch', 'Connection error');
      };

      this.ws.onclose = (event) => {
        console.log(`[Twitch] WebSocket closed - Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
        this.cleanup();
        
        if (!this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectAttempts * 2000, 10000);
          console.log(`[Twitch] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        } else {
          console.log('[Twitch] Max reconnection attempts reached or service destroyed');
          connectionsStore.disconnect('twitch');
        }
      };
    } catch (error) {
      console.error('[Twitch] Failed to create WebSocket:', error);
      connectionsStore.setError('twitch', 'Failed to connect');
    }
  }

  private authenticate() {
    // Ensure oauth token has the correct format
    const oauth = this.credentials.oauth.startsWith('oauth:') 
      ? this.credentials.oauth 
      : `oauth:${this.credentials.oauth}`;
    
    console.log('[Twitch] Authenticating as:', this.credentials.username);
    console.log('[Twitch] OAuth token format:', oauth.substring(0, 10) + '...');
    console.log('[Twitch] Channels to join:', this.credentials.channels);
    
    this.send(`PASS ${oauth}`);
    this.send(`NICK ${this.credentials.username}`);
    
    // Request capabilities
    this.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
    
    // Join channels after a short delay
    setTimeout(() => {
      this.credentials.channels.forEach(channel => {
        const channelName = channel.startsWith('#') ? channel : `#${channel}`;
        console.log(`[Twitch] Joining channel: ${channelName}`);
        this.send(`JOIN ${channelName}`);
      });
    }, 1000);
  }

  private handleMessage(rawMessage: string) {
    // Debug: Log raw message
    if (rawMessage.includes('twitchrelayer')) {
      console.log('[Twitch] RAW MESSAGE WITH TWITCHRELAYER:', rawMessage);
    }
    
    const messages = rawMessage.split('\r\n').filter(msg => msg.length > 0);
    
    for (const message of messages) {
      // Handle PING
      if (message === 'PING :tmi.twitch.tv') {
        this.send('PONG :tmi.twitch.tv');
        continue;
      }
      
      // Parse IRC message
      const parsed = this.parseIRCMessage(message);
      
      switch (parsed.command) {
        case '001': // Welcome message
          console.log('[Twitch] IRC authenticated successfully');
          connectionsStore.setConnected('twitch');
          break;
          
        case 'JOIN':
          if (parsed.nick === this.credentials.username) {
            this.joinedChannels.add(parsed.channel);
            console.log(`[Twitch] Successfully joined channel: ${parsed.channel}`);
          }
          break;
          
        case 'PART':
          if (parsed.nick === this.credentials.username) {
            this.joinedChannels.delete(parsed.channel);
            console.log(`[Twitch] Left channel: ${parsed.channel}`);
          }
          break;
          
        case 'PRIVMSG':
          // Enhanced debug logging for PRIVMSG
          console.log('[Twitch] PRIVMSG - Raw parsed data:', {
            nick: JSON.stringify(parsed.nick),
            nickLength: parsed.nick?.length,
            channel: parsed.channel,
            message: JSON.stringify(parsed.message),
            messageLength: parsed.message?.length
          });
          
          if (parsed.nick && parsed.channel && parsed.message) {
            // More defensive filtering - trim and normalize the nick
            const normalizedNick = (parsed.nick || '').trim().toLowerCase();
            
            // Debug nick comparison
            console.log('[Twitch] Nick check:', {
              original: parsed.nick,
              normalized: normalizedNick,
              isTwitchRelayer: normalizedNick === 'twitchrelayer',
              includesTwitchRelayer: normalizedNick.includes('twitchrelayer')
            });
            
            // Use includes instead of exact match (in case of hidden characters)
            if (normalizedNick.includes('twitchrelayer')) {
              console.log('[Twitch] TWITCHRELAYER MESSAGE DETECTED');
              
              // Check multiple patterns - including Unicode variants
              const messagePatterns = [
                '[Telegram]',
                '🔵 [Telegram]',
                '📱 Replying to',
                '📱',
                'Telegram] Gritzpup:',
                // Unicode patterns used by twitchrelayer
                '🔵',
                '𝐓𝐞𝐥𝐞𝐠𝐫𝐚𝐦',
                '[𝐓𝐞𝐥𝐞𝐠𝐫𝐚𝐦]',
                '↩️',
                '🔴'
              ];
              
              const shouldFilterTelegram = messagePatterns.some(pattern => 
                parsed.message.includes(pattern)
              );
              
              if (shouldFilterTelegram) {
                console.log('[Twitch] FILTERING: Telegram message/reply from twitchrelayer');
                console.log('[Twitch] Message that was filtered:', parsed.message);
                break;
              }
              
              // Also skip your Discord messages (check both regular and Unicode variants)
              const discordPatterns = [
                '[discord] gritzpup:',
                '[Discord] Gritzpup:',
                '𝐃𝐢𝐬𝐜𝐨𝐫𝐝] 𝐆𝐫𝐢𝐭𝐳𝐩𝐮𝐩:',
                '[𝐃𝐢𝐬𝐜𝐨𝐫𝐝] 𝐆𝐫𝐢𝐭𝐳𝐩𝐮𝐩:',
                '🟣',  // Purple circle that might be used for Discord
                '𝐆𝐫𝐢𝐭𝐳𝐩𝐮𝐩'  // Unicode variant of username
              ];
              
              const shouldFilterDiscord = discordPatterns.some(pattern => 
                parsed.message.toLowerCase().includes(pattern.toLowerCase())
              );
              
              if (shouldFilterDiscord) {
                console.log('[Twitch] FILTERING: Gritzpup Discord relay');
                console.log('[Twitch] Message that was filtered:', parsed.message);
                break;
              }
            }
            
            // Check if this is a relayed message from another platform (original check)
            const relayPrefixes = ['[Discord]', '[Telegram]'];
            const isRelayedMessage = relayPrefixes.some(prefix => 
              parsed.message.trimStart().startsWith(prefix)
            );
            
            if (isRelayedMessage) {
              console.log('[Twitch] Skipping relayed message:', parsed.message.substring(0, 50) + '...');
              break;
            }
            
            // Log the message only if it's not filtered
            console.log(`[Twitch] Chat message from ${parsed.nick} in ${parsed.channel}: ${parsed.message}`);
            console.log('[Twitch] Message tags:', parsed.tags);
            
            // Parse reply information from tags
            let replyTo = undefined;
            if (parsed.tags && parsed.tags['reply-parent-msg-id']) {
              const replyAuthor = parsed.tags['reply-parent-display-name'] || 
                                  parsed.tags['reply-parent-user-login'] || 
                                  'Unknown';
              const replyBody = parsed.tags['reply-parent-msg-body'] || '[Message unavailable]';
              
              // Unescape Twitch IRC escaped characters
              const unescapedBody = this.unescapeTwitchString(replyBody);
              
              replyTo = {
                author: replyAuthor,
                content: unescapedBody.length > 100 ? unescapedBody.substring(0, 100) + '...' : unescapedBody
              };
              
              console.log('[Twitch] Reply context:', replyTo);
            }
            
            // Parse emotes from tags
            const emotes = this.parseEmotesFromTags(parsed.tags.emotes, parsed.message);
            
            // Get user avatar if API client available
            this.fetchUserAvatar(parsed.nick).then(avatarUrl => {
              messagesStore.addMessage({
                platform: 'twitch',
                author: parsed.nick,
                content: parsed.message,
                avatarUrl: avatarUrl,
                channelId: parsed.channel,
                channelName: parsed.channel,
                isDM: false,
                emotes: emotes.length > 0 ? emotes : undefined,
                replyTo: replyTo
              });
            });
          }
          break;
          
        case 'NOTICE':
          console.log('[Twitch] Notice:', parsed.message);
          if (parsed.message?.includes('Login authentication failed')) {
            console.error('[Twitch] Authentication failed! Check your OAuth token');
            connectionsStore.setError('twitch', 'Authentication failed');
          }
          break;
          
        case 'WHISPER':
          // Silently ignore whispers for privacy
          break;
          
        default:
          console.log(`[Twitch] Unhandled command: ${parsed.command}`);
      }
    }
  }

  private parseIRCMessage(message: string) {
    const result: any = {
      tags: {},
      nick: null,
      command: null,
      channel: null,
      message: null
    };
    
    let idx = 0;
    
    // Parse tags
    if (message[idx] === '@') {
      const endIdx = message.indexOf(' ');
      const rawTags = message.slice(1, endIdx);
      
      rawTags.split(';').forEach(tag => {
        const [key, value] = tag.split('=');
        result.tags[key] = value || true;
      });
      
      idx = endIdx + 1;
    }
    
    // Skip prefix if present
    if (message[idx] === ':') {
      idx++;
      const endIdx = message.indexOf(' ', idx);
      const prefix = message.slice(idx, endIdx);
      
      // Extract nick from prefix
      const nickMatch = prefix.match(/^(\w+)!/);
      if (nickMatch) {
        result.nick = nickMatch[1];
      }
      
      idx = endIdx + 1;
    }
    
    // Parse command
    const commandEndIdx = message.indexOf(' ', idx);
    if (commandEndIdx !== -1) {
      result.command = message.slice(idx, commandEndIdx);
      idx = commandEndIdx + 1;
    } else {
      result.command = message.slice(idx);
      return result;
    }
    
    // Parse channel and message
    if (result.command === 'PRIVMSG' || result.command === 'JOIN' || result.command === 'PART') {
      const channelEndIdx = message.indexOf(' ', idx);
      
      if (channelEndIdx !== -1) {
        result.channel = message.slice(idx, channelEndIdx);
        
        // Parse message (skip the : prefix)
        if (message[channelEndIdx + 1] === ':') {
          result.message = message.slice(channelEndIdx + 2);
        } else {
          result.message = message.slice(channelEndIdx + 1);
        }
      } else {
        result.channel = message.slice(idx);
      }
    } else if (message[idx] === ':') {
      result.message = message.slice(idx + 1);
    } else {
      result.message = message.slice(idx);
    }
    
    return result;
  }

  private startPing() {
    this.stopPing();
    
    // Send PING every 4 minutes to keep connection alive
    this.pingInterval = window.setInterval(() => {
      this.send('PING :tmi.twitch.tv');
    }, 240000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private send(command: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Twitch] Sending:', command.includes('PASS') ? 'PASS oauth:***' : command);
      this.ws.send(command + '\r\n');
    } else {
      console.warn('[Twitch] Cannot send command, WebSocket not open. State:', this.ws?.readyState);
    }
  }

  joinChannel(channel: string) {
    const channelName = channel.startsWith('#') ? channel : `#${channel}`;
    if (!this.joinedChannels.has(channelName)) {
      this.send(`JOIN ${channelName}`);
    }
  }

  leaveChannel(channel: string) {
    const channelName = channel.startsWith('#') ? channel : `#${channel}`;
    if (this.joinedChannels.has(channelName)) {
      this.send(`PART ${channelName}`);
    }
  }

  private cleanup() {
    this.stopPing();
    this.joinedChannels.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  private unescapeTwitchString(str: string): string {
    if (!str) return '';
    return str
      .replace(/\\s/g, ' ')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\:/g, ';')
      .replace(/\\\\/g, '\\');
  }

  private parseEmotesFromTags(emotesTag: string | undefined | boolean, message: string): TwitchEmote[] {
    if (!emotesTag || typeof emotesTag !== 'string') return [];
    
    const emotes: TwitchEmote[] = [];
    const emoteData = emotesTag.split('/');
    
    for (const emote of emoteData) {
      const [id, positions] = emote.split(':');
      if (!id || !positions) continue;
      
      // Parse positions (can be multiple for the same emote)
      const positionPairs = positions.split(',');
      const parsedPositions: Array<[number, number]> = [];
      
      for (const pos of positionPairs) {
        const [start, end] = pos.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          parsedPositions.push([start, end]);
          
          // Extract emote name from message using the first position
          if (parsedPositions.length === 1) {
            const emoteName = message.substring(start, end + 1);
            emotes.push({
              id,
              name: emoteName,
              positions: parsedPositions
            });
          }
        }
      }
    }
    
    console.log('[Twitch] Parsed emotes:', emotes);
    return emotes;
  }
  
  private async fetchUserAvatar(username: string): Promise<string | undefined> {
    // Check cache first
    if (this.userAvatarCache.has(username)) {
      return this.userAvatarCache.get(username);
    }
    
    // If no API client, return undefined
    if (!this.apiClient) {
      return undefined;
    }
    
    try {
      const user = await this.apiClient.getUserByLogin(username);
      if (user && user.profile_image_url) {
        this.userAvatarCache.set(username, user.profile_image_url);
        return user.profile_image_url;
      }
    } catch (error) {
      console.error(`[Twitch] Failed to fetch avatar for ${username}:`, error);
    }
    
    return undefined;
  }

  disconnect() {
    this.isDestroyed = true;
    this.cleanup();
    connectionsStore.disconnect('twitch');
  }
}