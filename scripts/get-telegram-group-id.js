#!/usr/bin/env node

/**
 * Helper script to get Telegram group/chat IDs
 * Usage: node scripts/get-telegram-group-id.js YOUR_BOT_TOKEN
 */

const token = process.argv[2];

if (!token) {
  console.error('Usage: node scripts/get-telegram-group-id.js YOUR_BOT_TOKEN');
  process.exit(1);
}

async function getUpdates() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await response.json();
    
    if (!data.ok) {
      console.error('Error:', data.description);
      return;
    }
    
    const chats = new Map();
    
    data.result.forEach(update => {
      if (update.message && update.message.chat) {
        const chat = update.message.chat;
        const chatInfo = {
          id: chat.id,
          type: chat.type,
          name: chat.title || chat.username || `${chat.first_name} ${chat.last_name || ''}`.trim()
        };
        chats.set(chat.id, chatInfo);
      }
    });
    
    if (chats.size === 0) {
      console.log('No chats found. Make sure to:');
      console.log('1. Add the bot to your group');
      console.log('2. Send a message in the group');
      console.log('3. Run this script again');
      return;
    }
    
    console.log('\nFound chats:');
    console.log('============');
    chats.forEach(chat => {
      console.log(`ID: ${chat.id}`);
      console.log(`Type: ${chat.type}`);
      console.log(`Name: ${chat.name}`);
      console.log('---');
    });
    
    console.log('\nTo monitor specific groups, add their IDs to your .env file:');
    console.log('VITE_TELEGRAM_GROUPS=' + Array.from(chats.keys()).join(','));
  } catch (error) {
    console.error('Failed to fetch updates:', error.message);
  }
}

getUpdates();