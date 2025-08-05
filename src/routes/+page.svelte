<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionsStore } from '$lib/stores/connections';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  import MessageFeed from '$lib/components/MessageFeed.svelte';
  import { DiscordService } from '$lib/services/discord';
  import { TelegramService } from '$lib/services/telegram';
  import { TwitchService } from '$lib/services/twitch';
  import { config, hasDiscordConfig, hasTelegramConfig, hasTwitchConfig } from '$lib/config';
  import { page } from '$app/stores';
  
  let discordService: DiscordService | null = null;
  let telegramService: TelegramService | null = null;
  let twitchService: TwitchService | null = null;
  let showInstallPrompt = false;
  let deferredPrompt: any = null;
  
  onMount(() => {
    
    
    // Auto-connect services based on env config
    connectServices();
    
    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPrompt = true;
    });
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
  
  onDestroy(() => {
    disconnectAll();
  });
  
  function connectServices() {
    // Disconnect existing services first to prevent duplicates
    disconnectAll();
    
    if (hasDiscordConfig()) {
      discordService = new DiscordService(config.discord.token, config.discord.channels);
      discordService.connect();
    }
    
    if (hasTelegramConfig()) {
      telegramService = new TelegramService(config.telegram.botToken, config.telegram.groups);
      telegramService.connect();
    }
    
    if (hasTwitchConfig()) {
      twitchService = new TwitchService(config.twitch);
      twitchService.connect();
    }
  }
  
  function disconnectAll() {
    discordService?.disconnect();
    telegramService?.disconnect();
    twitchService?.disconnect();
    
    discordService = null;
    telegramService = null;
    twitchService = null;
  }
  
  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        showInstallPrompt = false;
      }
      
      deferredPrompt = null;
    }
  }
</script>

<div class="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex flex-col">
  <!-- Header -->
  <header class="bg-gray-900/80 backdrop-blur-lg border-b border-gray-700/50 shadow-2xl">
    <div class="max-w-7xl mx-auto px-6 py-5">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold flex items-center gap-3">
          <span class="text-4xl">🔔</span>
          <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Notification Hub
          </span>
        </h1>
        
        <div class="flex items-center gap-4">
          {#if showInstallPrompt}
            <button
              on:click={handleInstall}
              class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-base font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Install App
            </button>
          {/if}
          
          <a
            href="/settings"
            class="p-3 text-gray-400 hover:text-white transition-all duration-200 hover:bg-gray-800/50 rounded-lg"
            title="Settings"
          >
            <span class="text-2xl">⚙️</span>
          </a>
        </div>
      </div>
    </div>
  </header>
  
  <main class="flex-1 overflow-hidden">
    <div class="max-w-7xl mx-auto h-full px-6 py-6 flex flex-col gap-6">
      <!-- Connection status -->
      <ConnectionStatus />
      
      <!-- Service status info -->
      {#if !hasDiscordConfig() && !hasTelegramConfig() && !hasTwitchConfig()}
        <div class="bg-yellow-500/20 backdrop-blur-md border border-yellow-500/50 rounded-xl p-5 text-yellow-300 shadow-xl">
          <p class="font-semibold text-lg">No services configured</p>
          <p class="text-base mt-2 opacity-90">
            Add your credentials to the .env file and restart the dev server.
          </p>
        </div>
      {/if}
      
      <!-- Message feed -->
      <div class="flex-1 bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-gray-700/30 overflow-hidden">
        <MessageFeed />
      </div>
    </div>
  </main>
</div>