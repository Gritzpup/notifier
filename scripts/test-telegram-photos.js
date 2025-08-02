#!/usr/bin/env node

const token = process.argv[2];

if (!token) {
  console.error('Usage: node test-telegram-photos.js YOUR_BOT_TOKEN');
  process.exit(1);
}

async function testTelegramPhotos() {
  try {
    // Get recent updates
    console.log('Fetching recent updates...');
    const updatesResponse = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=10`
    );
    
    const updatesData = await updatesResponse.json();
    
    if (!updatesData.ok) {
      console.error('Failed to get updates:', updatesData.description);
      return;
    }
    
    const messagesWithUsers = updatesData.result
      .filter(update => update.message && update.message.from)
      .slice(-5); // Last 5 messages
    
    if (messagesWithUsers.length === 0) {
      console.log('No recent messages found. Send some messages to the bot first.');
      return;
    }
    
    console.log(`\nFound ${messagesWithUsers.length} recent messages\n`);
    
    // Test fetching profile photos for each user
    for (const update of messagesWithUsers) {
      const user = update.message.from;
      const userName = user.username || `${user.first_name} ${user.last_name || ''}`.trim();
      
      console.log(`Testing profile photo for: ${userName} (ID: ${user.id})`);
      
      // Get user profile photos
      const photosResponse = await fetch(
        `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${user.id}&limit=1`
      );
      
      const photosData = await photosResponse.json();
      
      if (!photosData.ok) {
        console.log(`  ❌ Failed to get photos: ${photosData.description}`);
        continue;
      }
      
      if (photosData.result.photos.length === 0) {
        console.log(`  ⚠️  No profile photo set`);
        continue;
      }
      
      // Get the smallest photo
      const photo = photosData.result.photos[0][0];
      console.log(`  ✅ Found photo: ${photo.width}x${photo.height}`);
      
      // Get file info
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${photo.file_id}`
      );
      
      const fileData = await fileResponse.json();
      
      if (fileData.ok && fileData.result.file_path) {
        const photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        console.log(`  📸 Photo URL: ${photoUrl}`);
      } else {
        console.log(`  ❌ Failed to get file path`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTelegramPhotos();