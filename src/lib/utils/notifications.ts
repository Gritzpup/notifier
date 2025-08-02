export function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return Promise.resolve('denied');
  }
  
  return Notification.requestPermission();
}

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function notify(title: string, options?: NotificationOptions): void {
  if (canNotify()) {
    new Notification(title, {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      ...options
    });
  }
}

export function notifyMessage(platform: string, author: string, content: string): void {
  if (canNotify() && document.hidden) {
    notify(`${platform}: ${author}`, {
      body: content,
      tag: `${platform}-${Date.now()}`,
      requireInteraction: false
    });
  }
}