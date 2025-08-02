<script lang="ts">
  import type { Message, DiscordSticker, DiscordEmoji, TwitchEmote, DiscordEmbed, Attachment } from '$lib/stores/messages';
  
  export let message: Message;
  
  // Track sticker load attempts
  let stickerAttempts: Record<string, number> = {};
  let failedStickers = new Set<string>();
  
  // Check if sticker is a Discord built-in sticker based on ID range
  function isDiscordBuiltInSticker(stickerId: string): boolean {
    const id = BigInt(stickerId);
    // Wumpus stickers (749xxx range)
    if (id >= BigInt('749000000000000000') && id < BigInt('750000000000000000')) {
      return true;
    }
    // Other built-in stickers (816xxx range)
    if (id >= BigInt('816000000000000000') && id < BigInt('817000000000000000')) {
      return true;
    }
    return false;
  }
  
  // Check if sticker is a Lottie animation
  function isLottieSticker(sticker: DiscordSticker): boolean {
    return sticker.format_type === 3;
  }
  
  // Parse content and replace custom emojis with images
  function parseDiscordContent(content: string, customEmojis?: DiscordEmoji[]): string {
    if (!customEmojis || customEmojis.length === 0) return content;
    
    let parsed = content;
    for (const emoji of customEmojis) {
      const emojiPattern = new RegExp(`<(a?):${emoji.name}:${emoji.id}>`, 'g');
      const extension = emoji.animated ? 'gif' : 'png';
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}`;
      parsed = parsed.replace(emojiPattern, `<img src="${emojiUrl}" alt=":${emoji.name}:" class="inline-emoji" />`);
    }
    
    return parsed;
  }
  
  // Parse Twitch content and replace emotes with images
  function parseTwitchContent(content: string, emotes?: TwitchEmote[]): string {
    if (!emotes || emotes.length === 0) return content;
    
    // Sort emotes by position (reverse order to avoid position shifts)
    const sortedEmotes = [...emotes].sort((a, b) => {
      const aPos = a.positions[0][0];
      const bPos = b.positions[0][0];
      return bPos - aPos;
    });
    
    let parsed = content;
    for (const emote of sortedEmotes) {
      // Replace each occurrence of the emote
      for (const [start, end] of emote.positions) {
        const emoteText = content.substring(start, end + 1);
        const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/2.0`;
        const replacement = `<img src="${emoteUrl}" alt="${emoteText}" class="inline-emoji twitch-emote" />`;
        parsed = parsed.substring(0, start) + replacement + parsed.substring(end + 1);
      }
    }
    
    return parsed;
  }
  
  // Track failed sticker URLs
  let failedStickerUrls = new Set<string>();
  
  
  // Get sticker URL with fallback options
  function getStickerUrl(sticker: DiscordSticker, attemptIndex: number = 0): string {
    const urlPatterns = [];
    
    // Check if API provided a URL (future-proofing)
    if ((sticker as any).url || (sticker as any).image_url || (sticker as any).asset_url) {
      const providedUrl = (sticker as any).url || (sticker as any).image_url || (sticker as any).asset_url;
      console.log(`API provided URL for sticker ${sticker.name}: ${providedUrl}`);
      urlPatterns.push(providedUrl);
    }
    
    // Built-in Discord stickers can't be accessed - don't even try
    if (isDiscordBuiltInSticker(sticker.id)) {
      console.log(`Built-in Discord sticker (will use emoji fallback): ${sticker.name} (${sticker.id})`);
      return ''; // Return empty string to trigger fallback
    }
    // Regular stickers (guild/user uploaded) - these work!
    else {
      // For Lottie stickers (animated), Discord provides static PNG fallbacks
      if (sticker.format_type === 3) {
        urlPatterns.push(
          // Discord.com domain (2025 change)
          `https://discord.com/stickers/${sticker.id}.png`,
          // Media proxy with passthrough=false for static versions
          `https://media.discordapp.net/stickers/${sticker.id}.png?size=160&passthrough=false`,
          `https://media.discordapp.net/stickers/${sticker.id}.png?passthrough=false`,
          // Standard media proxy
          `https://media.discordapp.net/stickers/${sticker.id}.png?size=160`,
          `https://media.discordapp.net/stickers/${sticker.id}.png`
        );
      } else if (sticker.format_type === 4) {
        // GIF stickers - must use media.discordapp.net
        urlPatterns.push(
          `https://media.discordapp.net/stickers/${sticker.id}.gif`,
          // Fallback to static version
          `https://discord.com/stickers/${sticker.id}.png`
        );
      } else {
        // PNG/APNG stickers
        urlPatterns.push(
          `https://discord.com/stickers/${sticker.id}.png`,
          `https://media.discordapp.net/stickers/${sticker.id}.png?size=160&passthrough=false`,
          `https://media.discordapp.net/stickers/${sticker.id}.png?size=160`,
          `https://media.discordapp.net/stickers/${sticker.id}.png`
        );
      }
    }
    
    // Return the URL at the current attempt index
    return urlPatterns[Math.min(attemptIndex, urlPatterns.length - 1)] || '';
  }
  
  // Handle sticker load errors (only for guild/custom stickers now)
  function handleStickerError(sticker: DiscordSticker, currentAttempt: number) {
    const nextAttempt = currentAttempt + 1;
    const maxAttempts = 5;
    
    if (nextAttempt < maxAttempts) {
      const nextUrl = getStickerUrl(sticker, nextAttempt);
      if (nextUrl) {
        console.log(`[${sticker.name}] Trying URL ${nextAttempt + 1}/${maxAttempts}: ${nextUrl}`);
        return nextUrl;
      }
    }
    
    // Mark as failed
    failedStickers.add(sticker.id);
    console.error(`Guild/custom sticker failed to load: ${sticker.name} (${sticker.id})`, {
      format_type: sticker.format_type,
      attempts: nextAttempt
    });
    return null;
  }
  
  $: parsedContent = message.platform === 'discord' 
    ? parseDiscordContent(message.content, message.customEmojis)
    : message.platform === 'twitch'
    ? parseTwitchContent(message.content, message.emotes)
    : message.content;
    
  $: isSystemMessage = message.messageType === 'user_join' || message.messageType === 'user_leave';
  
  // Format file size to human readable
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>

<div class="rich-content">
  {#if isSystemMessage}
    <div class="system-message">
      <span class="system-icon">
        {#if message.messageType === 'user_join'}
          →
        {:else if message.messageType === 'user_leave'}
          ←
        {/if}
      </span>
      <span class="system-text">{@html parsedContent}</span>
    </div>
  {:else}
    <div class="message-text">{@html parsedContent}</div>
  {/if}
  
  {#if message.stickers && message.stickers.length > 0}
    <div class="stickers-container">
      {#each message.stickers as sticker, i (sticker.id)}
        {#if isDiscordBuiltInSticker(sticker.id)}
          <!-- Built-in Discord sticker - show emoji fallback immediately -->
          <div class="sticker-placeholder discord-builtin-sticker">
            <div class="sticker-icon">
              {#if sticker.name.toLowerCase().includes('wave')}
                👋
              {:else if sticker.name.toLowerCase().includes('heart')}
                ❤️
              {:else if sticker.name.toLowerCase().includes('laugh')}
                😂
              {:else if sticker.name.toLowerCase().includes('cry')}
                😭
              {:else if sticker.name.toLowerCase().includes('angry')}
                😡
              {:else if sticker.name.toLowerCase().includes('think')}
                🤔
              {:else if sticker.name.toLowerCase().includes('wumpus')}
                🟣
              {:else if sticker.name.toLowerCase().includes('yay')}
                🎉
              {:else if sticker.name.toLowerCase().includes('sad')}
                😢
              {:else if sticker.name.toLowerCase().includes('love')}
                💕
              {:else}
                💜
              {/if}
            </div>
            <span class="sticker-name">{sticker.name}</span>
            <span class="sticker-type">
              {#if sticker.format_type === 3}
                Animated Sticker
              {:else}
                Discord Sticker
              {/if}
            </span>
          </div>
        {:else if !failedStickers.has(sticker.id)}
          <!-- Custom/Guild stickers - try to load -->
          <img 
            src={getStickerUrl(sticker, stickerAttempts[sticker.id] || 0)}
            alt={sticker.name}
            class="discord-sticker {isLottieSticker(sticker) ? 'animated-sticker' : ''}"
            loading="lazy"
            on:load={(e) => {
              const attempt = stickerAttempts[sticker.id] || 0;
              console.log(`✓ Sticker loaded: ${sticker.name} (attempt ${attempt + 1})`);
              console.log(`Working URL: ${e.target.src}`);
              console.log(`Format type: ${sticker.format_type} (${sticker.format_type === 3 ? 'Lottie/APNG' : sticker.format_type === 1 ? 'PNG' : 'Other'})`);
              // Check if image is animated
              if (e.target.complete && e.target.naturalHeight > 0) {
                console.log(`Image dimensions: ${e.target.naturalWidth}x${e.target.naturalHeight}`);
              }
            }}
            on:error={(e) => {
              const attempt = stickerAttempts[sticker.id] || 0;
              const nextUrl = handleStickerError(sticker, attempt);
              if (nextUrl) {
                stickerAttempts[sticker.id] = attempt + 1;
                stickerAttempts = {...stickerAttempts}; // Trigger reactivity
                e.target.src = nextUrl;
              }
            }}
          />
        {:else}
          <!-- Failed to load guild/custom sticker -->
          <div class="sticker-placeholder failed-sticker">
            <span class="sticker-icon">❌</span>
            <span class="sticker-name">{sticker.name}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  
  {#if message.embeds && message.embeds.length > 0}
    <div class="embeds-container">
      {#each message.embeds as embed}
        <div class="embed" style={embed.color ? `border-left-color: #${embed.color.toString(16).padStart(6, '0')}` : ''}>
          {#if embed.author}
            <div class="embed-author">
              {#if embed.author.icon_url}
                <img src={embed.author.icon_url} alt="" class="embed-author-icon" />
              {/if}
              <span class="embed-author-name">{embed.author.name}</span>
            </div>
          {/if}
          
          {#if embed.title}
            <div class="embed-title">{embed.title}</div>
          {/if}
          
          {#if embed.description}
            <div class="embed-description">{embed.description}</div>
          {/if}
          
          {#if embed.fields && embed.fields.length > 0}
            <div class="embed-fields">
              {#each embed.fields as field}
                <div class="embed-field" class:inline={field.inline}>
                  <div class="embed-field-name">{field.name}</div>
                  <div class="embed-field-value">{field.value}</div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  
  {#if message.attachments && message.attachments.length > 0}
    <div class="attachments-container">
      {#each message.attachments as attachment}
        <!-- Check if this is a Telegram sticker (image or video) -->
        {#if message.platform === 'telegram' && attachment.filename?.includes('sticker')}
          <div class="telegram-sticker-container">
            {#if attachment.content_type?.startsWith('video/')}
              <video 
                src={attachment.url}
                class="telegram-sticker"
                autoplay
                loop
                muted
                playsinline
              />
            {:else}
              <img 
                src={attachment.url} 
                alt={attachment.filename}
                loading="lazy"
                class="telegram-sticker"
              />
            {/if}
          </div>
        {:else if attachment.content_type?.startsWith('image/')}
            <div class="attachment-image">
              <img 
                src={attachment.url} 
                alt={attachment.filename}
                loading="lazy"
                style={attachment.width && attachment.height ? `max-width: ${Math.min(attachment.width, 400)}px; max-height: ${Math.min(attachment.height, 300)}px;` : ''}
              />
              <div class="attachment-info">
                <span class="attachment-filename">{attachment.filename}</span>
                <span class="attachment-size">{formatFileSize(attachment.size)}</span>
              </div>
            </div>
        {:else}
          <a href={attachment.url} target="_blank" rel="noopener noreferrer" class="attachment-file">
            <div class="file-icon">📎</div>
            <div class="file-details">
              <span class="attachment-filename">{attachment.filename}</span>
              <span class="attachment-size">{formatFileSize(attachment.size)}</span>
            </div>
          </a>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .rich-content {
    width: 100%;
  }
  
  .message-text {
    word-break: break-word;
    line-height: 1.5;
  }
  
  :global(.inline-emoji) {
    width: 1.375em;
    height: 1.375em;
    vertical-align: -0.375em;
    margin: 0 0.05em 0 0.1em;
  }
  
  :global(.twitch-emote) {
    width: 1.75em;
    height: 1.75em;
  }
  
  .system-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-style: italic;
    opacity: 0.8;
  }
  
  .system-icon {
    font-size: 1.2em;
    font-weight: bold;
  }
  
  .stickers-container {
    margin-top: 0.5rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .discord-sticker {
    max-width: 160px;
    max-height: 160px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    background-color: rgba(0, 0, 0, 0.1);
    /* Ensure APNG animations play */
    image-rendering: auto;
    /* Force browser to not optimize animated images */
    -webkit-user-select: none;
    user-select: none;
  }
  
  .discord-sticker.animated-sticker {
    box-shadow: 0 0 0 2px rgba(235, 69, 158, 0.3);
    /* Allow larger size for animated stickers */
    max-width: 200px;
    max-height: 200px;
  }
  
  .sticker-placeholder {
    width: 160px;
    height: 160px;
    border-radius: 8px;
    background-color: rgba(0, 0, 0, 0.3);
    border: 2px dashed rgba(255, 255, 255, 0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    text-align: center;
  }
  
  .discord-builtin-sticker {
    background: linear-gradient(135deg, rgba(88, 101, 242, 0.2), rgba(114, 137, 218, 0.2));
    border-color: rgba(88, 101, 242, 0.4);
    position: relative;
    overflow: hidden;
  }
  
  .discord-builtin-sticker::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
    animation: shimmer 3s infinite;
  }
  
  @keyframes shimmer {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(180deg); }
  }
  
  .discord-builtin-sticker .sticker-icon {
    font-size: 4rem;
    z-index: 1;
    position: relative;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  }
  
  .discord-builtin-sticker .sticker-name {
    z-index: 1;
    position: relative;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }
  
  .discord-builtin-sticker .sticker-type {
    z-index: 1;
    position: relative;
    font-size: 0.75rem;
    color: rgba(114, 137, 218, 0.9);
    font-weight: 500;
  }
  
  
  .failed-sticker {
    background-color: rgba(237, 66, 69, 0.1);
    border-color: rgba(237, 66, 69, 0.3);
  }
  
  .sticker-icon {
    font-size: 2rem;
    opacity: 0.7;
  }
  
  .sticker-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .sticker-type {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
  }
  
  .embeds-container {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .embed {
    background-color: rgba(0, 0, 0, 0.2);
    border-left: 4px solid #5865f2;
    border-radius: 4px;
    padding: 0.75rem;
  }
  
  .embed-author {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .embed-author-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }
  
  .embed-author-name {
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .embed-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  
  .embed-description {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 0.5rem;
  }
  
  .embed-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
  }
  
  .embed-field {
    min-width: 0;
  }
  
  .embed-field.inline {
    display: inline-block;
  }
  
  .embed-field-name {
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 0.125rem;
  }
  
  .embed-field-value {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
  }
  
  .attachments-container {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .attachment-image {
    display: inline-block;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background-color: rgba(0, 0, 0, 0.2);
  }
  
  .attachment-image img {
    display: block;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
  }
  
  .attachment-info {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    padding: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .attachment-image:hover .attachment-info {
    opacity: 1;
  }
  
  .attachment-file {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
  }
  
  .attachment-file:hover {
    background-color: rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.2);
  }
  
  .file-icon {
    font-size: 2rem;
  }
  
  .file-details {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  
  .attachment-filename {
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .attachment-size {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }
  
  .telegram-sticker-container {
    display: inline-block;
    margin: 0.25rem 0;
  }
  
  .telegram-sticker {
    max-width: 120px;
    max-height: 120px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
</style>