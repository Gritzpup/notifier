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
    twitch: $unreadCount.twitch
  };
  
  const filterOptions: { value: FilterType; label: string; color?: string; isDM?: boolean }[] = [
    { value: 'all', label: 'All' },
    { value: 'discord', label: 'Discord', color: 'text-discord' },
    { value: 'telegram', label: 'Telegram', color: 'text-telegram' },
    { value: 'twitch', label: 'Twitch', color: 'text-twitch' }
  ];
  
  function setFilter(newFilter: FilterType) {
    filter = newFilter;
    messagesStore.setFilter(newFilter);
    console.log('Filter changed to:', newFilter);
    // Don't automatically mark as read when switching filters
    // Let the user see the unread badges first
  }
  
  // Log initial filter and messages
  $: {
    console.log('=== MessageFeed State ===');
    console.log('Active filter:', filter);
    console.log('Filtered messages count:', $filteredMessages.length);
    console.log('All messages sample:', $filteredMessages.slice(0, 3).map(m => ({
      platform: m.platform,
      isDM: m.isDM,
      author: m.author,
      content: m.content.substring(0, 50)
    })));
  }
  
  async function scrollToTop() {
    await tick();
    if (messageContainer) {
      messageContainer.scrollTop = 0;
    }
  }
  
  // Auto-scroll to top when new messages arrive
  afterUpdate(() => {
    if ($filteredMessages.length > previousMessageCount) {
      scrollToTop();
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
    scrollToTop();
    
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
  <div class="flex items-center gap-2 p-3 bg-gray-900/50 backdrop-blur-sm rounded-xl mb-6 shadow-xl border border-gray-700/30">
    {#each filterOptions as option}
      <button
        class="px-6 py-3 text-base font-semibold rounded-lg transition-all duration-200 transform hover:scale-105
               {filter === option.value 
                 ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg' 
                 : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
        on:click={() => setFilter(option.value)}
      >
        <span class={option.color}>
          {option.label}
          {#if badges[option.value] > 0}
            <span class="ml-2 px-2.5 py-1 text-sm bg-red-500 text-white rounded-full font-bold shadow-md">
              {badges[option.value]}
            </span>
          {/if}
        </span>
      </button>
    {/each}
    
    {#if $filteredMessages.length > 0}
      <div class="ml-auto">
        <button
          class="px-5 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200 font-medium"
          on:click={() => messagesStore.markAllAsRead(filter === 'all' ? undefined : filter)}
        >
          Mark all as read
        </button>
      </div>
    {/if}
  </div>
  
  <!-- Messages list -->
  <div class="flex-1 overflow-y-auto space-y-4 pr-4" bind:this={messageContainer}>
    {#if $filteredMessages.length === 0}
      <div class="text-center py-20 text-gray-400">
        <p class="text-2xl mb-3 font-semibold">No messages yet</p>
        <p class="text-lg opacity-75">Messages will appear here when received</p>
      </div>
    {:else}
      {#each [...$filteredMessages].reverse() as message (message.id)}
        <MessageCard {message} />
      {/each}
    {/if}
  </div>
</div>