import https from 'https';

const BOT_TOKEN = '8224946532:AAEm1sKOIBwgSJ130B0hEhM3d1FyWbj51UM';

console.log('Testing Telegram bot...\n');

// Test bot connection
https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const bot = JSON.parse(data);
    if (bot.ok) {
      console.log('✅ Bot connected successfully!');
      console.log(`Bot name: ${bot.result.first_name} (@${bot.result.username})`);
      console.log(`Can read all group messages: ${bot.result.can_read_all_group_messages}`);
      console.log('');
      
      // Get recent updates
      https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', () => {
          const updates = JSON.parse(data2);
          if (updates.ok) {
            if (updates.result.length === 0) {
              console.log('📭 No recent messages in the queue');
              console.log('\nTo test:');
              console.log('1. Make sure the bot is added to your group');
              console.log('2. If the bot cannot read all messages, make it a group admin');
              console.log('3. Send a message mentioning @GritzNotifierBot');
              console.log('4. Or make the bot an admin so it can see all messages');
            } else {
              console.log(`📬 Found ${updates.result.length} updates:`);
              updates.result.forEach((update, i) => {
                if (update.message) {
                  const msg = update.message;
                  console.log(`\nMessage ${i + 1}:`);
                  console.log(`  From: ${msg.from.first_name} (${msg.from.username || 'no username'})`);
                  console.log(`  Chat: ${msg.chat.title || msg.chat.username || 'Direct message'} (ID: ${msg.chat.id})`);
                  console.log(`  Text: ${msg.text || '(no text)'}`);
                  console.log(`  Date: ${new Date(msg.date * 1000).toLocaleString()}`);
                }
              });
              
              console.log('\n💡 Add these chat IDs to VITE_TELEGRAM_GROUPS in .env to filter messages');
            }
          }
        });
      });
    } else {
      console.log('❌ Bot connection failed:', bot);
    }
  });
});