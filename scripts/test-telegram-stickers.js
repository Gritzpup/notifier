#!/usr/bin/env node

const token = process.argv[2];

if (!token) {
  console.error('Usage: node test-telegram-stickers.js YOUR_BOT_TOKEN');
  process.exit(1);
}

async function testTelegramStickers() {
  try {
    // Get recent updates
    console.log('Fetching recent updates to find sticker messages...');
    const updatesResponse = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100`
    );
    
    const updatesData = await updatesResponse.json();
    
    if (!updatesData.ok) {
      console.error('Failed to get updates:', updatesData.description);
      return;
    }
    
    const stickerMessages = updatesData.result
      .filter(update => update.message && update.message.sticker)
      .slice(-5); // Last 5 sticker messages
    
    if (stickerMessages.length === 0) {
      console.log('No sticker messages found. Send some stickers to the bot first.');
      return;
    }
    
    console.log(`\nFound ${stickerMessages.length} sticker messages\n`);
    
    // Test fetching sticker files
    for (const update of stickerMessages) {
      const sticker = update.message.sticker;
      const user = update.message.from;
      const userName = user.username || `${user.first_name} ${user.last_name || ''}`.trim();
      
      console.log(`Sticker from: ${userName}`);
      console.log(`  Emoji: ${sticker.emoji || 'No emoji'}`);
      console.log(`  Size: ${sticker.width}x${sticker.height}`);
      console.log(`  Animated: ${sticker.is_animated ? 'Yes' : 'No'}`);
      console.log(`  Video: ${sticker.is_video ? 'Yes' : 'No'}`);
      console.log(`  Set: ${sticker.set_name || 'No set'}`);
      
      // Get file info
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${sticker.file_id}`
      );
      
      const fileData = await fileResponse.json();
      
      if (fileData.ok && fileData.result.file_path) {
        const stickerUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        console.log(`  ✅ Sticker URL: ${stickerUrl}`);
      } else {
        console.log(`  ❌ Failed to get file path`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTelegramStickers();