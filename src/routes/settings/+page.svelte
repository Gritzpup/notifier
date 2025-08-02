<script lang="ts">
  import { goto } from '$app/navigation';
  import { config, hasDiscordConfig, hasTelegramConfig, hasTwitchConfig } from '$lib/config';
  
  function handleBack() {
    goto('/');
  }
</script>

<div class="min-h-screen bg-gray-900 text-gray-100">
  <!-- Header -->
  <header class="bg-gray-800 border-b border-gray-700">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            on:click={handleBack}
            class="p-2 text-gray-400 hover:text-white transition-colors"
            title="Back"
          >
            ←
          </button>
          <h1 class="text-2xl font-bold">Settings</h1>
        </div>
      </div>
    </div>
  </header>
  
  <main class="max-w-4xl mx-auto px-4 py-6 space-y-8">
    <!-- Configuration Status -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-6">Configuration Status</h2>
      
      <div class="space-y-4">
        <div class="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full {hasDiscordConfig() ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="font-medium">Discord</span>
          </div>
          <span class="text-sm text-gray-400">
            {hasDiscordConfig() ? 'Configured' : 'Not configured'}
          </span>
        </div>
        
        <div class="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full {hasTelegramConfig() ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="font-medium">Telegram</span>
          </div>
          <span class="text-sm text-gray-400">
            {hasTelegramConfig() ? `Configured${config.telegram.groups.length > 0 ? ` (${config.telegram.groups.length} groups)` : ''}` : 'Not configured'}
          </span>
        </div>
        
        <div class="flex items-center justify-between p-4 bg-gray-900 rounded-lg">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full {hasTwitchConfig() ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="font-medium">Twitch</span>
          </div>
          <span class="text-sm text-gray-400">
            {hasTwitchConfig() ? `Configured (${config.twitch.channels.length} channels)` : 'Not configured'}
          </span>
        </div>
      </div>
      
      <div class="mt-6 p-4 bg-blue-500/20 border border-blue-500/50 rounded-lg">
        <p class="text-sm text-blue-300">
          To configure services, create a <code class="bg-gray-800 px-1 rounded">.env</code> file 
          based on <code class="bg-gray-800 px-1 rounded">.env.example</code> and restart the dev server.
        </p>
      </div>
    </div>
    
    <!-- Setup Instructions -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-6">Setup Instructions</h2>
      
      <div class="space-y-6">
        <!-- Discord -->
        <div>
          <h3 class="text-lg font-semibold text-discord mb-3">Discord Bot Setup</h3>
          <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300">
            <li>Go to <a href="https://discord.com/developers/applications" target="_blank" class="text-blue-400 hover:underline">Discord Developer Portal</a></li>
            <li>Click "New Application" and give it a name</li>
            <li>Go to the "Bot" section in the sidebar</li>
            <li>Click "Add Bot" and confirm</li>
            <li>Under "Privileged Gateway Intents", enable:
              <ul class="list-disc list-inside ml-6 mt-1">
                <li>MESSAGE CONTENT INTENT</li>
              </ul>
            </li>
            <li>Click "Reset Token" and copy the token</li>
            <li>Add to .env: <code class="bg-gray-900 px-2 py-1 rounded">VITE_DISCORD_TOKEN=your_token_here</code></li>
            <li>To receive DMs, the bot needs to share a server with you</li>
          </ol>
        </div>
        
        <!-- Telegram -->
        <div>
          <h3 class="text-lg font-semibold text-telegram mb-3">Telegram Bot Setup</h3>
          <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300">
            <li>Open Telegram and search for <a href="https://t.me/BotFather" target="_blank" class="text-blue-400 hover:underline">@BotFather</a></li>
            <li>Send <code class="bg-gray-900 px-2 py-1 rounded">/newbot</code></li>
            <li>Choose a name for your bot</li>
            <li>Choose a username ending in "bot"</li>
            <li>Copy the token BotFather gives you</li>
            <li>Add to .env: <code class="bg-gray-900 px-2 py-1 rounded">VITE_TELEGRAM_TOKEN=your_token_here</code></li>
            <li>For private messages: Start a chat with your bot</li>
            <li>For groups: 
              <ul class="list-disc list-inside ml-6 mt-1">
                <li>Add the bot to your group</li>
                <li>Make the bot an admin (required for some groups)</li>
                <li>Send a message in the group</li>
                <li>Get the group ID from: <code class="bg-gray-900 px-1 rounded text-xs">https://api.telegram.org/bot[TOKEN]/getUpdates</code></li>
                <li>Add to .env: <code class="bg-gray-900 px-1 rounded text-xs">VITE_TELEGRAM_GROUPS=group_id_here</code></li>
              </ul>
            </li>
          </ol>
        </div>
        
        <!-- Twitch -->
        <div>
          <h3 class="text-lg font-semibold text-twitch mb-3">Twitch Chat Setup</h3>
          <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300">
            <li>Go to <a href="https://twitchapps.com/tmi/" target="_blank" class="text-blue-400 hover:underline">Twitch Chat OAuth Generator</a></li>
            <li>Click "Connect" and authorize</li>
            <li>Copy the OAuth token (includes "oauth:" prefix)</li>
            <li>Add to .env:
              <div class="mt-2 bg-gray-900 p-2 rounded text-xs">
                <div>VITE_TWITCH_USERNAME=your_username</div>
                <div>VITE_TWITCH_OAUTH=oauth:your_token_here</div>
                <div>VITE_TWITCH_CHANNELS=channel1,channel2</div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
    
    <!-- About -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">About</h2>
      
      <div class="space-y-3 text-sm text-gray-300">
        <p>
          <strong>Notification Hub</strong> aggregates notifications from Discord, Telegram, and Twitch.
        </p>
        
        <div>
          <p class="font-medium mb-2">Features:</p>
          <ul class="list-disc list-inside space-y-1 ml-2">
            <li>Real-time message updates</li>
            <li>Direct connections to platform APIs</li>
            <li>Works offline once installed as PWA</li>
            <li>No external servers required</li>
          </ul>
        </div>
      </div>
    </div>
  </main>
</div>