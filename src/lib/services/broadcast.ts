// Broadcast channel for sharing messages between tabs
export class BroadcastService {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('notifier-hub');
      
      this.channel.onmessage = (event) => {
        const { type, data } = event.data;
        const listener = this.listeners.get(type);
        if (listener) {
          listener(data);
        }
      };
    }
  }

  on(type: string, callback: (data: any) => void) {
    this.listeners.set(type, callback);
  }

  off(type: string) {
    this.listeners.delete(type);
  }

  send(type: string, data: any) {
    if (this.channel) {
      this.channel.postMessage({ type, data });
    }
  }

  close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

export const broadcastService = new BroadcastService();