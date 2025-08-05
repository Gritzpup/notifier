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
  
  $: platformGradient = {
    discord: 'from-discord/20',
    telegram: 'from-telegram/20',
    twitch: 'from-twitch/20'
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
  class="p-6 rounded-2xl border-l-4 {platformColor} bg-gradient-to-r {platformGradient} to-gray-800/40 backdrop-blur-md transition-all duration-300 hover:bg-gray-700/50 cursor-pointer {message.isRead ? 'opacity-60' : ''} shadow-2xl hover:shadow-3xl border border-gray-700/20 hover:border-gray-600/30"
  on:click={markAsRead}
  on:keydown={(e) => e.key === 'Enter' && markAsRead()}
  role="button"
  tabindex="0"
  in:fly={{ y: -30, duration: 500, easing: cubicOut, opacity: 0 }}
>
  <div class="flex items-start justify-between gap-4">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-sm font-bold uppercase text-gray-300">
          {message.platform}
        </span>
        {#if message.channelName}
          <span class="text-sm text-gray-400">• {message.channelName}</span>
        {/if}
        <span class="text-sm text-gray-400">• {formatTime(message.timestamp)}</span>
        {#if !message.isRead}
          <span class="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-lg"></span>
        {/if}
      </div>
      
      <div class="flex items-start gap-4">
        {#if message.avatarUrl}
          <img 
            src={message.avatarUrl} 
            alt={message.author}
            class="w-12 h-12 rounded-full shadow-xl border-2 border-gray-600/30"
          />
        {/if}
        
        <div class="flex-1">
          <p class="font-bold text-lg mb-2 text-gray-100">
            {message.author}
            {#if message.isBot}
              <span class="text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white px-2 py-1 rounded-md ml-2 font-medium shadow-md">BOT</span>
            {/if}
          </p>
          <div class="text-base text-gray-200 leading-relaxed">
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