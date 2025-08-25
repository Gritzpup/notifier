import fetch from 'node-fetch';
export class TelegramBotService {
    token = '';
    io;
    isPolling = false;
    offset = 0;
    pollingTimeout = null;
    groupFilter = [];
    excludeGroups = [];
    sendOnlyMode = true; // Enable send-only mode to avoid conflicts with relayer
    constructor(io) {
        this.io = io;
    }
    async connect(token, groupFilter = [], excludeGroups = []) {
        if (this.isPolling || !token)
            return;
        this.token = token;
        this.groupFilter = groupFilter;
        this.excludeGroups = excludeGroups;
        // Check if we should disable polling to avoid conflicts with relayer
        if (this.sendOnlyMode) {
            console.log('[Telegram Bot] Running in send-only mode (polling disabled to avoid conflicts with relayer)');
            // Just store the token for sending messages, don't start polling
            this.io.emit('service-status', {
                platform: 'telegram',
                connected: true,
                mode: 'send-only'
            });
            return;
        }
        console.log('[Telegram Bot] Starting polling...');
        this.isPolling = true;
        this.startPolling();
        // Broadcast connection status
        this.io.emit('service-status', {
            platform: 'telegram',
            connected: true
        });
    }
    async startPolling() {
        if (!this.isPolling)
            return;
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.ok && data.result) {
                for (const update of data.result) {
                    this.offset = update.update_id + 1;
                    if (update.message && update.message.text) {
                        const message = update.message;
                        const chatName = message.chat.title ||
                            message.chat.username ||
                            `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim() ||
                            'Unknown';
                        // Apply filters
                        if (this.excludeGroups.length > 0 && this.excludeGroups.includes(chatName)) {
                            continue;
                        }
                        if (this.groupFilter.length > 0 && !this.groupFilter.includes(chatName)) {
                            continue;
                        }
                        const messageData = {
                            id: `telegram-${message.message_id}`,
                            platform: 'telegram',
                            platformMessageId: String(message.message_id),
                            author: message.from.username || message.from.first_name,
                            content: message.text,
                            avatarUrl: null,
                            channelId: String(message.chat.id),
                            channelName: chatName,
                            isGroup: message.chat.type === 'group' || message.chat.type === 'supergroup',
                            timestamp: message.date * 1000
                        };
                        // Broadcast to all connected clients
                        this.io.emit('new-message', messageData);
                    }
                }
            }
        }
        catch (error) {
            console.error('[Telegram Bot] Polling error:', error);
            this.io.emit('service-error', {
                platform: 'telegram',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        // Continue polling
        if (this.isPolling) {
            this.pollingTimeout = setTimeout(() => this.startPolling(), 1000);
        }
    }
    disconnect() {
        this.isPolling = false;
        if (this.pollingTimeout) {
            clearTimeout(this.pollingTimeout);
            this.pollingTimeout = null;
        }
        this.io.emit('service-status', {
            platform: 'telegram',
            connected: false
        });
    }
    getStatus() {
        return {
            platform: 'telegram',
            connected: this.sendOnlyMode ? !!this.token : this.isPolling,
            mode: this.sendOnlyMode ? 'send-only' : 'full'
        };
    }
    // Method to send notifications to Telegram
    async sendNotification(chatId, message) {
        if (!this.token) {
            throw new Error('Telegram bot not connected');
        }
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to send message: ${response.statusText}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('[Telegram Bot] Failed to send notification:', error);
            throw error;
        }
    }
}
