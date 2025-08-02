<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionsStore } from '$lib/stores/connections';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  import MessageFeed from '$lib/components/MessageFeed.svelte';
  import { DiscordService } from '$lib/services/discord';
  import { TelegramService } from '$lib/services/telegram';
  import { TwitchService } from '$lib/services/twitch';
  import { config, hasDiscordConfig, hasTelegramConfig, hasTwitchConfig } from '$lib/config';
  import { initializeSocket, startDMPolling, disconnectSocket } from '$lib/services/socket';
  import { page } from '$app/stores';
  
  let discordService: DiscordService | null = null;
  let telegramService: TelegramService | null = null;
  let twitchService: TwitchService | null = null;
  let showInstallPrompt = false;
  let deferredPrompt: any = null;
  let discordAccessToken: string | null = null;
  let isDiscordOAuthConnected = false;
  
  onMount(() => {
    // Initialize socket connection
    initializeSocket();
    
    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const error = urlParams.get('error');
    
    if (error) {
      console.error('OAuth error:', error);
      alert(`Discord OAuth failed: ${error}`);
      // Clean URL
      window.history.replaceState({}, document.title, '/');
    } else if (accessToken) {
      discordAccessToken = accessToken;
      isDiscordOAuthConnected = true;
      startDMPolling(accessToken);
      // Clean URL
      window.history.replaceState({}, document.title, '/');
    }
    
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
    disconnectSocket();
  });
  
  function connectServices() {
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

<div class="min-h-screen bg-gray-900 text-gray-100">
  <!-- Header -->
  <header class="bg-gray-800 border-b border-gray-700">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <span class="text-3xl">🔔</span>
          Notification Hub
        </h1>
        
        <div class="flex items-center gap-4">
          {#if !isDiscordOAuthConnected}
            <a
              href="http://localhost:3001/auth/discord"
              class="px-4 py-2 bg-discord hover:bg-discord/80 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
            >
              <span>🔓</span>
              Connect Discord DMs
            </a>
          {:else}
            <div class="px-3 py-1 bg-green-600/20 text-green-400 text-sm rounded-md">
              Discord DMs Connected
            </div>
          {/if}
          
          {#if showInstallPrompt}
            <button
              on:click={handleInstall}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              Install App
            </button>
          {/if}
          
          <a
            href="/settings"
            class="p-2 text-gray-400 hover:text-white transition-colors"
            title="Settings"
          >
            ⚙️
          </a>
        </div>
      </div>
    </div>
  </header>
  
  <main class="max-w-7xl mx-auto px-4 py-6">
    <div class="space-y-6">
      <!-- Connection status -->
      <ConnectionStatus />
      
      <!-- Service status info -->
      {#if !hasDiscordConfig() && !hasTelegramConfig() && !hasTwitchConfig()}
        <div class="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 text-yellow-300">
          <p class="font-medium">No services configured</p>
          <p class="text-sm mt-1">
            Add your credentials to the .env file and restart the dev server.
          </p>
        </div>
      {/if}
      
      <!-- Message feed -->
      <div class="bg-gray-800 rounded-lg p-6 h-[calc(100vh-16rem)]">
        <MessageFeed />
      </div>
    </div>
  </main>
</div>