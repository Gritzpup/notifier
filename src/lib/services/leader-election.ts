// Leader election service to ensure only one tab polls at a time
export class LeaderElection {
  private readonly key = 'notifier-leader';
  private readonly heartbeatInterval = 2000; // 2 seconds
  private readonly timeout = 5000; // 5 seconds before considering leader dead
  private tabId: string;
  private isLeader = false;
  private heartbeatTimer: number | null = null;
  private checkTimer: number | null = null;
  private onLeadershipChange?: (isLeader: boolean) => void;
  private startTime = Date.now();
  private conflictDetected = false;

  constructor() {
    this.tabId = this.generateTabId();
  }

  private generateTabId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${performance.now()}`;
  }

  start(onLeadershipChange: (isLeader: boolean) => void) {
    this.onLeadershipChange = onLeadershipChange;
    
    console.log(`[LeaderElection] Starting - Tab ID: ${this.tabId}`);
    
    // Check for stale leader data first
    const current = this.getCurrentLeader();
    if (current) {
      const age = Date.now() - current.timestamp;
      console.log(`[LeaderElection] Current leader data:`, {
        tabId: current.tabId,
        timestamp: current.timestamp,
        age: `${age}ms (${Math.floor(age / 1000)}s)`,
        isStale: age > this.timeout
      });
      
      // If leader data is very old (more than 30 seconds), clean it up
      if (age > 30000) {
        console.log(`[LeaderElection] Cleaning up stale leader data (${Math.floor(age / 1000)}s old)`);
        localStorage.removeItem(this.key);
      }
    }
    
    // Add a small random delay to prevent race conditions when multiple tabs start simultaneously
    const jitter = Math.random() * 500;
    setTimeout(() => {
      this.tryBecomeLeader();
    }, jitter);
    
    // Check leadership periodically with jitter
    this.checkTimer = window.setInterval(() => {
      this.checkLeadership();
    }, this.heartbeatInterval + Math.random() * 200);

    // Listen for storage changes (other tabs updating leadership)
    window.addEventListener('storage', this.handleStorageChange);
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => this.stop());
    window.addEventListener('unload', () => this.stop());
    
    // Also clean up on page hide (mobile browsers)
    window.addEventListener('pagehide', () => {
      if (this.isLeader) {
        console.log('[LeaderElection] Page hiding, removing leadership');
        localStorage.removeItem(this.key);
      }
    });
  }

  private tryBecomeLeader() {
    const current = this.getCurrentLeader();
    const now = Date.now();
    
    if (!current || now - current.timestamp > this.timeout) {
      console.log(`[LeaderElection] No leader or leader timeout (${current ? now - current.timestamp : 'no leader'}ms), attempting to become leader`);
      this.setAsLeader();
    } else if (current.tabId === this.tabId) {
      // We are already the leader, update heartbeat
      this.setAsLeader();
    } else {
      const age = now - current.timestamp;
      console.log(`[LeaderElection] Another tab is leader: ${current.tabId.slice(0, 20)}... (age: ${age}ms / ${Math.floor(age / 1000)}s)`);
      
      // Additional check: if we detect only one tab and leader is stale, force takeover
      if (age > 10000) { // If leader hasn't updated in 10 seconds
        console.log(`[LeaderElection] Leader is stale (${Math.floor(age / 1000)}s), attempting force takeover`);
        // Try to detect if other tabs exist by setting a probe value
        const probeKey = 'leader-election-probe-' + this.tabId;
        localStorage.setItem(probeKey, Date.now().toString());
        
        // Wait briefly then check if anyone else set a probe
        setTimeout(() => {
          const probeCount = Object.keys(localStorage)
            .filter(key => key.startsWith('leader-election-probe-'))
            .length;
          
          // Clean up our probe
          localStorage.removeItem(probeKey);
          
          if (probeCount === 1) {
            console.log('[LeaderElection] Only one tab detected, forcing leadership takeover');
            localStorage.removeItem(this.key);
            this.setAsLeader();
          } else {
            console.log(`[LeaderElection] Multiple tabs detected (${probeCount}), waiting for proper handoff`);
          }
        }, 500);
      }
    }
  }

  private setAsLeader() {
    const leaderData = {
      tabId: this.tabId,
      timestamp: Date.now(),
      startTime: this.startTime
    };
    
    try {
      // Double-check no one else became leader in the meantime
      const current = this.getCurrentLeader();
      if (current && current.tabId !== this.tabId && Date.now() - current.timestamp < this.timeout) {
        console.log('[LeaderElection] Conflict detected, another tab became leader');
        this.conflictDetected = true;
        return;
      }
      
      localStorage.setItem(this.key, JSON.stringify(leaderData));
      
      if (!this.isLeader) {
        this.isLeader = true;
        console.log(`[LeaderElection] This tab is now the leader - Tab ID: ${this.tabId.slice(0, 20)}...`);
        this.onLeadershipChange?.(true);
      }
      
      // Update heartbeat
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }
      
      this.heartbeatTimer = window.setInterval(() => {
        this.updateHeartbeat();
      }, this.heartbeatInterval / 2);
    } catch (error) {
      console.error('[LeaderElection] Failed to set as leader:', error);
    }
  }

  private updateHeartbeat() {
    const current = this.getCurrentLeader();
    if (current && current.tabId === this.tabId) {
      const leaderData = {
        tabId: this.tabId,
        timestamp: Date.now(),
        startTime: this.startTime
      };
      localStorage.setItem(this.key, JSON.stringify(leaderData));
    } else if (this.isLeader) {
      console.log('[LeaderElection] Lost leader status during heartbeat update');
      this.isLeader = false;
      this.onLeadershipChange?.(false);
    }
  }

  private checkLeadership() {
    const current = this.getCurrentLeader();
    
    if (!current || Date.now() - current.timestamp > this.timeout) {
      // Leader is dead, try to become leader
      this.tryBecomeLeader();
    } else if (current.tabId !== this.tabId && this.isLeader) {
      // We lost leadership
      this.isLeader = false;
      console.log('[LeaderElection] This tab lost leadership');
      this.onLeadershipChange?.(false);
      
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }
  }

  private getCurrentLeader(): { tabId: string; timestamp: number; startTime?: number } | null {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[LeaderElection] Failed to parse leader data:', error);
      localStorage.removeItem(this.key); // Clean up corrupted data
      return null;
    }
  }

  private handleStorageChange = (event: StorageEvent) => {
    if (event.key === this.key) {
      this.checkLeadership();
    }
  };

  stop() {
    console.log(`[LeaderElection] Stopping - Tab ID: ${this.tabId.slice(0, 20)}...`);
    
    // If we're the leader, remove our leadership
    const current = this.getCurrentLeader();
    if (current && current.tabId === this.tabId) {
      localStorage.removeItem(this.key);
      console.log('[LeaderElection] Leadership removed');
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    window.removeEventListener('storage', this.handleStorageChange);
    window.removeEventListener('beforeunload', () => this.stop());
    window.removeEventListener('unload', () => this.stop());
    
    if (this.isLeader) {
      this.isLeader = false;
      this.onLeadershipChange?.(false);
    }
    
    // Clean up any probe entries
    Object.keys(localStorage)
      .filter(key => key.startsWith('leader-election-probe-'))
      .forEach(key => localStorage.removeItem(key));
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }
}

export const leaderElection = new LeaderElection();