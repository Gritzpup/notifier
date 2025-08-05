<script lang="ts">
  import type { Message } from '$lib/stores/messages';
  import { messagesStore } from '$lib/stores/messages';
  import RichMessageContent from './RichMessageContent.svelte';
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  export let message: Message;
  
  $: platformColor = {
    discord: 'border-discord',
    telegram: 'border-telegram',
    twitch: 'border-twitch'
  }[message.platform];
  
  $: platformBg = {
    discord: 'bg-discord/10',
    telegram: 'bg-telegram/10',
    twitch: 'bg-twitch/10'
  }[message.platform];
  
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
  class="p-4 rounded-lg border-l-4 {platformColor} {platformBg} transition-all hover:bg-gray-800/50 cursor-pointer {message.isRead ? 'opacity-75' : ''}"
  on:click={markAsRead}
  on:keydown={(e) => e.key === 'Enter' && markAsRead()}
  role="button"
  tabindex="0"
  in:fly={{ y: -30, duration: 500, easing: cubicOut, opacity: 0 }}
>
  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-medium uppercase text-gray-400">
          {message.platform}
        </span>
        {#if message.channelName}
          <span class="text-xs text-gray-500">• {message.channelName}</span>
        {/if}
        <span class="text-xs text-gray-500">• {formatTime(message.timestamp)}</span>
        {#if !message.isRead}
          <span class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
        {/if}
      </div>
      
      <div class="flex items-start gap-3">
        {#if message.avatarUrl}
          <img 
            src={message.avatarUrl} 
            alt={message.author}
            class="w-8 h-8 rounded-full"
          />
        {/if}
        
        <div class="flex-1">
          <p class="font-semibold text-sm mb-1">
            {message.author}
            {#if message.isBot}
              <span class="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded ml-1">BOT</span>
            {/if}
          </p>
          <div class="text-sm text-gray-300">
            <RichMessageContent {message} />
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes messageGlow {
    0% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }
  
  div[role="button"]:not(.opacity-75) {
    animation: messageGlow 1s ease-out;
  }
</style>