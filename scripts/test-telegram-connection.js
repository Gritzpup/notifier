#!/usr/bin/env node

/**
 * Test Telegram bot connection and show recent messages
 */

const token = '8224946532:AAEm1sKOIBwgSJ130B0hEhM3d1FyWbj51UM';

async function testConnection() {
  try {
    // Get bot info
    console.log('Testing bot connection...\n');
    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meResponse.json();
    
    if (meData.ok) {
      console.log('✓ Bot connected successfully!');
      console.log(`Bot name: ${meData.result.first_name}`);
      console.log(`Username: @${meData.result.username}\n`);
    } else {
      console.error('❌ Bot connection failed:', meData.description);
      return;
    }
    
    // Get updates
    console.log('Fetching recent updates...\n');
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
          name: chat.title || chat.username || `${chat.first_name} ${chat.last_name || ''}`.trim(),
          lastMessage: update.message.text || '[non-text message]',
          from: update.message.from.username || update.message.from.first_name
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
    
    console.log('Found chats:');
    console.log('============');
    chats.forEach(chat => {
      console.log(`\nChat: ${chat.name}`);
      console.log(`ID: ${chat.id}`);
      console.log(`Type: ${chat.type}`);
      console.log(`Last message from: ${chat.from}`);
      console.log(`Message: "${chat.lastMessage}"`);
    });
    
    console.log('\n\nTo monitor specific groups, add their IDs to your .env file:');
    console.log('VITE_TELEGRAM_GROUPS=' + Array.from(chats.keys()).join(','));
  } catch (error) {
    console.error('Failed to connect:', error.message);
  }
}

testConnection();