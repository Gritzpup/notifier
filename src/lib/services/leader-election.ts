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

  constructor() {
    this.tabId = this.generateTabId();
  }

  private generateTabId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  start(onLeadershipChange: (isLeader: boolean) => void) {
    this.onLeadershipChange = onLeadershipChange;
    
    // Try to become leader immediately
    this.tryBecomeLeader();
    
    // Check leadership periodically
    this.checkTimer = window.setInterval(() => {
      this.checkLeadership();
    }, this.heartbeatInterval);

    // Listen for storage changes (other tabs updating leadership)
    window.addEventListener('storage', this.handleStorageChange);
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => this.stop());
  }

  private tryBecomeLeader() {
    const current = this.getCurrentLeader();
    
    if (!current || Date.now() - current.timestamp > this.timeout) {
      // No leader or leader is dead, try to become leader
      this.setAsLeader();
    } else if (current.tabId === this.tabId) {
      // We are already the leader, update heartbeat
      this.setAsLeader();
    }
  }

  private setAsLeader() {
    const leaderData = {
      tabId: this.tabId,
      timestamp: Date.now()
    };
    
    try {
      localStorage.setItem(this.key, JSON.stringify(leaderData));
      
      if (!this.isLeader) {
        this.isLeader = true;
        console.log('[LeaderElection] This tab is now the leader');
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
        timestamp: Date.now()
      };
      localStorage.setItem(this.key, JSON.stringify(leaderData));
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

  private getCurrentLeader(): { tabId: string; timestamp: number } | null {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private handleStorageChange = (event: StorageEvent) => {
    if (event.key === this.key) {
      this.checkLeadership();
    }
  };

  stop() {
    // If we're the leader, remove our leadership
    const current = this.getCurrentLeader();
    if (current && current.tabId === this.tabId) {
      localStorage.removeItem(this.key);
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
    
    if (this.isLeader) {
      this.isLeader = false;
      this.onLeadershipChange?.(false);
    }
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }
}

export const leaderElection = new LeaderElection();