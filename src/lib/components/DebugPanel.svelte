<script lang="ts">
  import { connectionsStore } from '$lib/stores/connections';
  import { leaderElection } from '$lib/services/leader-election';
  import { onMount, onDestroy } from 'svelte';
  
  let isLeader = false;
  let leaderInfo: any = null;
  let sessionInfo: any = {};
  let showDebug = false;
  let interval: any;
  
  function updateLeaderInfo() {
    isLeader = leaderElection.getIsLeader();
    try {
      const data = localStorage.getItem('notifier-leader');
      leaderInfo = data ? JSON.parse(data) : null;
      
      // Get session info from Telegram service if available
      const telegramService = (window as any).telegramService;
      if (telegramService) {
        sessionInfo.telegram = {
          sessionId: telegramService.sessionId?.slice(0, 8),
          conflictCount: telegramService.conflictCount,
          lastPollTime: telegramService.lastPollTime ? new Date(telegramService.lastPollTime).toLocaleTimeString() : 'Never'
        };
      }
    } catch (error) {
      console.error('Failed to get leader info:', error);
    }
  }
  
  function forceResetTelegram() {
    // Force reset by clearing leader election and reloading
    localStorage.removeItem('notifier-leader');
    window.location.reload();
  }
  
  onMount(() => {
    updateLeaderInfo();
    interval = setInterval(updateLeaderInfo, 1000);
  });
  
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="debug-panel">
  <button 
    class="debug-toggle"
    on:click={() => showDebug = !showDebug}
    title="Toggle debug panel"
  >
    🐛
  </button>
  
  {#if showDebug}
    <div class="debug-content">
      <h3>Debug Info</h3>
      
      <div class="debug-section">
        <h4>Leader Election</h4>
        <p>Is Leader: <span class:leader={isLeader}>{isLeader ? 'YES' : 'NO'}</span></p>
        {#if leaderInfo}
          <p>Leader Tab: {leaderInfo.tabId?.slice(0, 20)}...</p>
          <p>Last Heartbeat: {new Date(leaderInfo.timestamp).toLocaleTimeString()}</p>
          <p>Age: {Math.floor((Date.now() - leaderInfo.timestamp) / 1000)}s</p>
        {/if}
      </div>
      
      <div class="debug-section">
        <h4>Connections</h4>
        {#each Object.entries($connectionsStore) as [platform, status]}
          <p>
            {platform}: 
            <span class:connected={status.connected} class:error={status.error}>
              {status.connected ? '✅' : status.error ? '❌' : '⏳'}
              {status.error || (status.connected ? 'Connected' : 'Connecting')}
            </span>
          </p>
        {/each}
      </div>
      
      {#if sessionInfo.telegram}
        <div class="debug-section">
          <h4>Telegram Session</h4>
          <p>Session: {sessionInfo.telegram.sessionId || 'N/A'}</p>
          <p>Conflicts: {sessionInfo.telegram.conflictCount || 0}</p>
          <p>Last Poll: {sessionInfo.telegram.lastPollTime || 'Never'}</p>
        </div>
      {/if}
      
      <div class="debug-actions">
        <button on:click={forceResetTelegram} class="reset-btn">
          Force Reset Telegram
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .debug-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
  }
  
  .debug-toggle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border: 2px solid #666;
    cursor: pointer;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .debug-toggle:hover {
    background: rgba(0, 0, 0, 0.9);
    border-color: #888;
    transform: scale(1.1);
  }
  
  .debug-content {
    position: absolute;
    bottom: 50px;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    color: white;
    padding: 20px;
    border-radius: 8px;
    min-width: 300px;
    max-width: 400px;
    border: 1px solid #444;
    font-family: monospace;
    font-size: 12px;
  }
  
  h3 {
    margin: 0 0 15px 0;
    color: #0ff;
    font-size: 14px;
  }
  
  h4 {
    margin: 10px 0 5px 0;
    color: #ff0;
    font-size: 12px;
  }
  
  .debug-section {
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
  }
  
  .debug-section:last-child {
    border-bottom: none;
  }
  
  p {
    margin: 3px 0;
    line-height: 1.4;
  }
  
  .leader {
    color: #0f0;
    font-weight: bold;
  }
  
  .connected {
    color: #0f0;
  }
  
  .error {
    color: #f00;
  }
  
  .debug-actions {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px solid #333;
  }
  
  .reset-btn {
    background: #f44;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: monospace;
    width: 100%;
    transition: background 0.2s;
  }
  
  .reset-btn:hover {
    background: #f66;
  }
</style>