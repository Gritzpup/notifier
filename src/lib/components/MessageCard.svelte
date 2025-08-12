<script lang="ts">
  import type { Message } from '$lib/stores/messages';
  import { messagesStore } from '$lib/stores/messages';
  import RichMessageContent from './RichMessageContent.svelte';
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  export let message: Message;
  
  let platformColor = '';
  let platformGradient = '';
  let platformBgGlow = '';
  
  // Special styling for stream notifications
  $: if (message.isStreamNotification && message.platform === 'twitch') {
    platformColor = 'border-l-purple-600';
    platformGradient = 'from-purple-600/30 to-violet-600/10';
    platformBgGlow = 'shadow-purple-600/30';
  } else {
    switch(message.platform) {
      case 'discord':
        platformColor = 'border-l-indigo-500';
        platformGradient = 'from-indigo-500/20 to-transparent';
        platformBgGlow = 'shadow-indigo-500/20';
        break;
      case 'telegram':
        platformColor = 'border-l-sky-500';
        platformGradient = 'from-sky-500/20 to-transparent';
        platformBgGlow = 'shadow-sky-500/20';
        break;
      case 'email':
        platformColor = 'border-l-emerald-500';
        platformGradient = 'from-emerald-500/20 to-transparent';
        platformBgGlow = 'shadow-emerald-500/20';
        break;
      case 'slack':
        platformColor = 'border-l-purple-500';
        platformGradient = 'from-purple-500/20 to-transparent';
        platformBgGlow = 'shadow-purple-500/20';
        break;
      case 'whatsapp':
        platformColor = 'border-l-green-500';
        platformGradient = 'from-green-500/20 to-transparent';
        platformBgGlow = 'shadow-green-500/20';
        break;
      case 'twitch':
        platformColor = 'border-l-violet-500';
        platformGradient = 'from-violet-500/20 to-transparent';
        platformBgGlow = 'shadow-violet-500/20';
        break;
      default:
        platformColor = 'border-l-gray-500';
        platformGradient = 'from-gray-500/20 to-transparent';
        platformBgGlow = 'shadow-gray-500/20';
    }
  }
  
  function formatTime(date: Date) {
    // Format: "3:45:32 PM" or "15:45:32" based on system locale
    return date.toLocaleTimeString();
  }
  
  function markAsRead() {
    if (!message.isRead) {
      messagesStore.markAsRead(message.id);
    }
  }
</script>

<div 
  class="message-card p-6 lg:p-8 rounded-2xl border-l-4 {platformColor} bg-gradient-to-r {platformGradient} transition-all duration-300 cursor-pointer {message.isRead ? 'opacity-60' : ''} shadow-lg hover:shadow-xl {platformBgGlow} {message.isStreamNotification ? 'stream-notification' : ''}"
  on:click={markAsRead}
  on:keydown={(e) => e.key === 'Enter' && markAsRead()}
  role="button"
  tabindex="0"
  in:fly={{ y: -30, duration: 500, easing: cubicOut, opacity: 0 }}
>
  <div class="flex items-start justify-between gap-4">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-3 mb-4">
        <span class="platform-label font-semibold uppercase">
          {message.platform}
        </span>
        {#if message.channelName}
          <span class="metadata-text">• {message.channelName}</span>
        {/if}
        <span class="metadata-text">• {formatTime(message.timestamp)}</span>
        {#if !message.isRead}
          <span class="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-lg"></span>
        {/if}
      </div>
      
      <div class="flex items-start gap-4">
        {#if message.avatarUrl}
          <img 
            src={message.avatarUrl} 
            alt={message.author}
            class="w-14 h-14 rounded-full shadow-xl border-2 border-gray-600/30"
          />
        {/if}
        
        <div class="flex-1">
          <p class="author-name font-semibold mb-3">
            {message.author}
            {#if message.isBot}
              <span class="bot-badge font-medium">BOT</span>
            {/if}
          </p>
          {#if message.replyTo}
            <div class="reply-block mb-3">
              <div class="reply-author">{message.replyTo.author}</div>
              <div class="reply-content">{message.replyTo.content}</div>
            </div>
          {/if}
          <div class="message-content">
            <RichMessageContent {message} />
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .message-card {
    background-color: var(--color-bg-secondary);
    border: 1px solid rgba(255, 255, 255, 0.06);
    margin-bottom: 1rem;
  }
  
  .message-card:hover {
    background-color: var(--color-bg-hover);
    border-color: rgba(255, 255, 255, 0.1);
  }
  
  .platform-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    letter-spacing: 0.05em;
  }
  
  .metadata-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }
  
  .author-name {
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
    font-weight: 600;
  }
  
  .bot-badge {
    font-size: var(--font-size-xs);
    background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
    color: white;
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    margin-left: 0.5rem;
    display: inline-block;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .reply-block {
    border-left: 3px solid var(--color-text-muted);
    padding-left: 12px;
    opacity: 0.8;
  }
  
  .reply-author {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 600;
    margin-bottom: 2px;
  }
  
  .reply-content {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .message-content {
    font-size: var(--font-size-base);
    line-height: var(--line-height-base);
    color: var(--color-text-primary);
    max-width: 65ch; /* Optimal reading width */
  }
  
  @keyframes messageGlow {
    0% {
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.6), 0 0 40px rgba(59, 130, 246, 0.3);
    }
    50% {
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.15);
    }
    100% {
      box-shadow: none;
    }
  }
  
  .message-card:not(.opacity-60) {
    animation: messageGlow 10s ease-out forwards;
  }
  
  /* Stream notification special styling */
  .stream-notification {
    border-left-width: 6px;
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
    position: relative;
    overflow: hidden;
  }
  
  .stream-notification::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, #9333ea, #a855f7, #9333ea);
    border-radius: inherit;
    opacity: 0;
    z-index: -1;
    animation: streamPulse 2s ease-in-out infinite;
  }
  
  @keyframes streamPulse {
    0%, 100% {
      opacity: 0;
      transform: scale(1);
    }
    50% {
      opacity: 0.3;
      transform: scale(1.02);
    }
  }
</style>