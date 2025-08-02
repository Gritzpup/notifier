<script lang="ts">
  import { filteredMessages, messagesStore, unreadCount } from '$lib/stores/messages';
  import MessageCard from './MessageCard.svelte';
  import type { FilterType } from '$lib/stores/messages';
  import { onMount, afterUpdate, onDestroy } from 'svelte';
  import { tick } from 'svelte';
  
  let filter: FilterType = 'all';
  let messageContainer: HTMLDivElement;
  let previousMessageCount = 0;
  
  // Force reactivity for badge rendering
  let badges: Record<string, number>;
  $: badges = {
    all: $unreadCount.total,
    discord: $unreadCount.discord,
    telegram: $unreadCount.telegram,
    twitch: $unreadCount.twitch,
    'all-dms': $unreadCount.allDMs,
    'discord-dms': $unreadCount.discordDMs,
    'telegram-dms': $unreadCount.telegramDMs,
    'twitch-dms': $unreadCount.twitchDMs
  };
  
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
    // Only mark messages in the current filter view
    const unreadInView = $filteredMessages.filter(msg => !msg.isRead);
    
    if (unreadInView.length > 0) {
      console.log(`Marking ${unreadInView.length} messages as read in ${filter} view`);
      unreadInView.forEach(msg => {
        messagesStore.markAsRead(msg.id);
      });
    }
  }
  
  onMount(() => {
    scrollToBottom();
    
    let markAsReadTimeout: number | null = null;
    
    // Mark messages as read when user clicks anywhere on the page
    const handleClick = () => {
      // Clear any pending timeout
      if (markAsReadTimeout) {
        clearTimeout(markAsReadTimeout);
      }
      
      // Small delay to ensure user sees badges briefly
      markAsReadTimeout = window.setTimeout(() => {
        markVisibleMessagesAsRead();
      }, 300); // 300ms delay
    };
    
    // Also mark as read when window gains focus (coming back from another tab/window)
    const handleFocus = () => {
      if (document.hasFocus()) {
        console.log('Window focused - marking messages as read');
        setTimeout(() => {
          markVisibleMessagesAsRead();
        }, 500);
      }
    };
    
    // Add event listeners
    window.addEventListener('click', handleClick);
    window.addEventListener('focus', handleFocus);
    
    // Cleanup
    return () => {
      if (markAsReadTimeout) {
        clearTimeout(markAsReadTimeout);
      }
      window.removeEventListener('click', handleClick);
      window.removeEventListener('focus', handleFocus);
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
          {#if badges[option.value] > 0}
            <span class="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
              {badges[option.value]}
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