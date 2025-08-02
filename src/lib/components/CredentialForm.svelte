<script lang="ts">
  import { credentialsStore } from '$lib/stores/credentials';
  import type { Credentials } from '$lib/utils/crypto';
  
  export let onSave: () => void = () => {};
  
  let passphrase = '';
  let confirmPassphrase = '';
  let isNewSetup = !credentialsStore.hasStored();
  
  let credentials: Credentials = {
    discord: { token: '' },
    telegram: { botToken: '' },
    twitch: { username: '', oauth: '', channels: [] }
  };
  
  let twitchChannelsInput = '';
  let error = '';
  let showPassphrase = false;
  
  function handleSubmit() {
    error = '';
    
    if (isNewSetup && passphrase !== confirmPassphrase) {
      error = 'Passphrases do not match';
      return;
    }
    
    if (!passphrase) {
      error = 'Passphrase is required';
      return;
    }
    
    // Process Twitch channels
    if (twitchChannelsInput) {
      credentials.twitch!.channels = twitchChannelsInput
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
    }
    
    credentialsStore.save(credentials, passphrase);
    onSave();
  }
  
  function togglePassphrase() {
    showPassphrase = !showPassphrase;
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-6">
  {#if error}
    <div class="p-3 bg-red-500/20 border border-red-500/50 rounded-md text-red-300 text-sm">
      {error}
    </div>
  {/if}
  
  <!-- Passphrase -->
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">Security</h3>
    
    <div>
      <label for="passphrase" class="block text-sm font-medium mb-2">
        Passphrase
      </label>
      <div class="relative">
        {#if showPassphrase}
          <input
            id="passphrase"
            type="text"
            bind:value={passphrase}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Enter a secure passphrase"
          />
        {:else}
          <input
            id="passphrase"
            type="password"
            bind:value={passphrase}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Enter a secure passphrase"
          />
        {/if}
        <button
          type="button"
          on:click={togglePassphrase}
          class="absolute right-2 top-2 text-gray-400 hover:text-white"
        >
          {showPassphrase ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
    
    {#if isNewSetup}
      <div>
        <label for="confirmPassphrase" class="block text-sm font-medium mb-2">
          Confirm Passphrase
        </label>
        <input
          id="confirmPassphrase"
          type="password"
          bind:value={confirmPassphrase}
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Confirm your passphrase"
        />
      </div>
    {/if}
  </div>
  
  <!-- Discord -->
  <div class="space-y-4">
    <h3 class="text-lg font-semibold text-discord">Discord</h3>
    
    <div>
      <label for="discordToken" class="block text-sm font-medium mb-2">
        Bot Token
      </label>
      <input
        id="discordToken"
        type="password"
        bind:value={credentials.discord.token}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-discord focus:ring-1 focus:ring-discord"
        placeholder="Enter your Discord bot token"
      />
      <p class="mt-1 text-xs text-gray-400">
        Create a bot at discord.com/developers/applications
      </p>
    </div>
  </div>
  
  <!-- Telegram -->
  <div class="space-y-4">
    <h3 class="text-lg font-semibold text-telegram">Telegram</h3>
    
    <div>
      <label for="telegramToken" class="block text-sm font-medium mb-2">
        Bot Token
      </label>
      <input
        id="telegramToken"
        type="password"
        bind:value={credentials.telegram.botToken}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-telegram focus:ring-1 focus:ring-telegram"
        placeholder="Enter your Telegram bot token"
      />
      <p class="mt-1 text-xs text-gray-400">
        Get a token from @BotFather on Telegram
      </p>
    </div>
  </div>
  
  <!-- Twitch -->
  <div class="space-y-4">
    <h3 class="text-lg font-semibold text-twitch">Twitch</h3>
    
    <div>
      <label for="twitchUsername" class="block text-sm font-medium mb-2">
        Username
      </label>
      <input
        id="twitchUsername"
        type="text"
        bind:value={credentials.twitch.username}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-twitch focus:ring-1 focus:ring-twitch"
        placeholder="Your Twitch username"
      />
    </div>
    
    <div>
      <label for="twitchOauth" class="block text-sm font-medium mb-2">
        OAuth Token
      </label>
      <input
        id="twitchOauth"
        type="password"
        bind:value={credentials.twitch.oauth}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-twitch focus:ring-1 focus:ring-twitch"
        placeholder="oauth:your_token_here"
      />
      <p class="mt-1 text-xs text-gray-400">
        Get a token from twitchapps.com/tmi
      </p>
    </div>
    
    <div>
      <label for="twitchChannels" class="block text-sm font-medium mb-2">
        Channels to Monitor
      </label>
      <input
        id="twitchChannels"
        type="text"
        bind:value={twitchChannelsInput}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:border-twitch focus:ring-1 focus:ring-twitch"
        placeholder="channel1, channel2, channel3"
      />
      <p class="mt-1 text-xs text-gray-400">
        Comma-separated list of channel names (without #)
      </p>
    </div>
  </div>
  
  <button
    type="submit"
    class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
  >
    Save Credentials
  </button>
</form>