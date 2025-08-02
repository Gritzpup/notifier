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

<div class="flex items-center justify-center gap-6 p-4 bg-gray-800 rounded-lg">
  {#each platforms as platform}
    <div class="flex items-center gap-2">
      <div class="{platform.color} w-2 h-2 rounded-full"></div>
      <span class="text-sm font-medium">{platform.label}</span>
      <span class="text-lg {getStatusColor($connectionsStore[platform.name].status)}">
        {getStatusIcon($connectionsStore[platform.name].status)}
      </span>
      {#if $connectionsStore[platform.name].error}
        <span class="text-xs text-red-400" title={$connectionsStore[platform.name].error}>
          !
        </span>
      {/if}
    </div>
  {/each}
</div>