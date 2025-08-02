<script lang="ts">
  import { filteredMessages, messagesStore, unreadCount } from '$lib/stores/messages';
  import MessageCard from './MessageCard.svelte';
  import type { FilterType } from '$lib/stores/messages';
  import { onMount, afterUpdate, onDestroy } from 'svelte';
  import { tick } from 'svelte';
  
  let filter: FilterType = 'all';
  let messageContainer: HTMLDivElement;
  let previousMessageCount = 0;
  let focusHandler: (() => void) | null = null;
  
  // Debug: Log when unread counts change
  $: {
    console.log('Unread counts updated:', $unreadCount);
  }
  
  const filterOptions: { value: FilterType; label: string; color?: string; isDM?: boolean }[] = [
    // Channel messages
    { value: 'all', label: 'All' },
    { value: 'discord', label: 'Discord', color: 'text-discord' },
    { value: 'telegram', label: 'Telegram', color: 'text-telegram' },
    { value: 'twitch', label: 'Twitch', color: 'text-twitch' },
    // DMs
    { value: 'all-dms', label: 'All DMs', isDM: true },
    { value: 'discord-dms', label: 'Discord DMs', color: 'text-discord', isDM: true },
    { value: 'telegram-dms', label: 'Telegram DMs', color: 'text-telegram', isDM: true },
    { value: 'twitch-dms', label: 'Twitch DMs', color: 'text-twitch', isDM: true }
  ];
  
  function setFilter(newFilter: FilterType) {
    filter = newFilter;
    messagesStore.setFilter(newFilter);
    // Don't automatically mark as read when switching filters
    // Let the user see the unread badges first
  }
  
  function getUnreadCount(filterValue: FilterType): number {
    const count = (() => {
      switch (filterValue) {
        case 'all': return $unreadCount.total;
        case 'discord': return $unreadCount.discord;
        case 'telegram': return $unreadCount.telegram;
        case 'twitch': return $unreadCount.twitch;
        case 'all-dms': return $unreadCount.allDMs;
        case 'discord-dms': return $unreadCount.discordDMs;
        case 'telegram-dms': return $unreadCount.telegramDMs;
        case 'twitch-dms': return $unreadCount.twitchDMs;
        default: return 0;
      }
    })();
    
    // Debug logging
    if (filterValue === 'discord' || filterValue === 'twitch' || filterValue === 'telegram') {
      console.log(`getUnreadCount(${filterValue}): ${count}`);
    }
    
    return count;
  }
  
  async function scrollToBottom() {
    await tick();
    if (messageContainer) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }
  
  // Auto-scroll to bottom when new messages arrive
  afterUpdate(() => {
    if ($filteredMessages.length > previousMessageCount) {
      scrollToBottom();
    }
    previousMessageCount = $filteredMessages.length;
  });
  
  function markVisibleMessagesAsRead() {
    if (document.hasFocus() && !document.hidden) {
      console.log(`Window focused - marking ${filter} messages as read`);
      
      // For now, we'll mark messages based on the current filter view
      // This matches the user's expectation that viewing messages marks them as read
      const visibleMessageIds = $filteredMessages
        .filter(msg => !msg.isRead)
        .map(msg => msg.id);
      
      // Mark each visible message as read
      visibleMessageIds.forEach(id => messagesStore.markAsRead(id));
    }
  }
  
  onMount(() => {
    scrollToBottom();
    
    let wasHidden = document.hidden;
    let wasFocused = document.hasFocus();
    
    // Create focus handler that only triggers when window GAINS focus
    focusHandler = () => {
      if (!wasFocused && document.hasFocus()) {
        console.log('Window gained focus - marking messages as read');
        // Small delay to ensure UI has updated
        setTimeout(() => markVisibleMessagesAsRead(), 300);
      }
      wasFocused = document.hasFocus();
    };
    
    // Handle visibility changes (tab switching)
    const visibilityHandler = () => {
      if (wasHidden && !document.hidden) {
        console.log('Tab became visible - marking messages as read');
        // Small delay to ensure UI has updated
        setTimeout(() => markVisibleMessagesAsRead(), 300);
      }
      wasHidden = document.hidden;
    };
    
    // Add event listeners
    window.addEventListener('focus', focusHandler);
    window.addEventListener('blur', () => { wasFocused = false; });
    document.addEventListener('visibilitychange', visibilityHandler);
    
    // Don't mark as read on initial mount - let badges show first
    
    // Cleanup
    return () => {
      if (focusHandler) {
        window.removeEventListener('focus', focusHandler);
      }
      window.removeEventListener('blur', () => { wasFocused = false; });
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  });
</script>

<div class="flex flex-col h-full">
  <!-- Filter tabs -->
  <div class="flex items-center gap-1 p-2 bg-gray-800 rounded-lg mb-4">
    {#each filterOptions as option}
      <button
        class="px-4 py-2 text-sm font-medium rounded-md transition-colors
               {filter === option.value 
                 ? 'bg-gray-700 text-white' 
                 : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}"
        on:click={() => setFilter(option.value)}
      >
        <span class={option.color}>
          {option.label}
          {#if getUnreadCount(option.value) > 0}
            <span class="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
              {getUnreadCount(option.value)}
            </span>
          {/if}
        </span>
      </button>
    {/each}
    
    {#if $filteredMessages.length > 0}
      <div class="ml-auto">
        <button
          class="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors"
          on:click={() => messagesStore.markAllAsRead(filter === 'all' ? undefined : filter)}
        >
          Mark all as read
        </button>
      </div>
    {/if}
  </div>
  
  <!-- Messages list -->
  <div class="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin" bind:this={messageContainer}>
    {#if $filteredMessages.length === 0}
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg mb-2">No messages yet</p>
        <p class="text-sm">Messages will appear here when received</p>
      </div>
    {:else}
      {#each $filteredMessages as message (message.id)}
        <MessageCard {message} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #4b5563 #1f2937;
    scroll-behavior: smooth;
  }
  
  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: #1f2937;
    border-radius: 4px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #4b5563;
    border-radius: 4px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
</style>