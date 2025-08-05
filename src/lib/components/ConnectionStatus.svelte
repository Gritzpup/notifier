<script lang="ts">
  import { connectionsStore } from '$lib/stores/connections';
  import type { Platform } from '$lib/stores/messages';
  
  const platforms: { name: Platform; label: string; color: string }[] = [
    { name: 'discord', label: 'Discord', color: 'bg-discord' },
    { name: 'telegram', label: 'Telegram', color: 'bg-telegram' },
    { name: 'twitch', label: 'Twitch', color: 'bg-twitch' }
  ];
  
  function getStatusIcon(status: string) {
    switch (status) {
      case 'connected':
        return '●';
      case 'connecting':
        return '◐';
      case 'error':
        return '✕';
      default:
        return '○';
    }
  }
  
  function getStatusColor(status: string) {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500 animate-pulse';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  }
</script>

<div class="flex items-center justify-center gap-8 p-5 bg-gray-900/50 backdrop-blur-sm rounded-xl shadow-xl border border-gray-700/30">
  {#each platforms as platform}
    <div class="flex items-center gap-3 px-4 py-2 bg-gray-800/30 rounded-lg hover:bg-gray-700/30 transition-all duration-200">
      <div class="{platform.color} w-3 h-3 rounded-full shadow-lg"></div>
      <span class="text-base font-semibold text-gray-200">{platform.label}</span>
      <span class="text-xl {getStatusColor($connectionsStore[platform.name].status)}">
        {getStatusIcon($connectionsStore[platform.name].status)}
      </span>
      {#if $connectionsStore[platform.name].error}
        <span class="text-sm text-red-400 font-medium" title={$connectionsStore[platform.name].error}>
          ⚠️
        </span>
      {/if}
    </div>
  {/each}
</div>