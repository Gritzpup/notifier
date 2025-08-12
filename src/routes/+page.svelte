<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionsStore } from '$lib/stores/connections';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  import MessageFeed from '$lib/components/MessageFeed.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import { DiscordService } from '$lib/services/discord';
  import { TelegramService } from '$lib/services/telegram';
  import { TwitchService } from '$lib/services/twitch';
  import { TwitchEventSubService } from '$lib/services/twitch-eventsub';
  import { config, hasDiscordConfig, hasTelegramConfig, hasTwitchConfig } from '$lib/config';
  import { page } from '$app/stores';
  
  let discordService: DiscordService | null = null;
  let telegramService: TelegramService | null = null;
  let twitchService: TwitchService | null = null;
  let twitchEventSubService: TwitchEventSubService | null = null;
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
      telegramService = new TelegramService(config.telegram.botToken, config.telegram.groups, config.telegram.excludeGroups);
      // Expose for debugging
      (window as any).telegramService = telegramService;
      telegramService.connect();
    }
    
    if (hasTwitchConfig()) {
      twitchService = new TwitchService(config.twitch);
      twitchService.connect();
      
      // Connect EventSub for stream notifications if monitors are configured
      if (config.twitch.streamMonitors.length > 0) {
        twitchEventSubService = new TwitchEventSubService(config.twitch.streamMonitors);
        twitchEventSubService.connect();
      }
    }
  }
  
  function disconnectAll() {
    discordService?.disconnect();
    telegramService?.disconnect();
    twitchService?.disconnect();
    twitchEventSubService?.disconnect();
    
    discordService = null;
    telegramService = null;
    twitchService = null;
    twitchEventSubService = null;
    
    // Clean up window reference
    if ((window as any).telegramService) {
      delete (window as any).telegramService;
    }
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

<div class="h-screen flex flex-col">
  <!-- Header -->
  <header class="header-bar">
    <div class="max-w-7xl mx-auto px-6 py-5">
      <div class="flex items-center justify-between">
        <h1 class="flex items-center gap-3">
          <span class="text-4xl">🔔</span>
          <span class="header-title">
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
      <div class="message-feed-container">
        <MessageFeed />
      </div>
    </div>
  </main>
  <DebugPanel />
</div>

<style>
  .header-bar {
    background-color: rgba(15, 15, 15, 0.8);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  }
  
  .header-title {
    font-size: 1.875rem; /* 30px */
    font-weight: 700;
    background: linear-gradient(135deg, #60A5FA 0%, #A78BFA 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .message-feed-container {
    flex: 1;
    background-color: rgba(26, 26, 26, 0.5);
    backdrop-filter: blur(8px);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.03);
    overflow: hidden;
  }
  
  @media (max-width: 768px) {
    .message-feed-container {
      padding: 1rem;
      border-radius: 0.75rem;
    }
  }
</style>