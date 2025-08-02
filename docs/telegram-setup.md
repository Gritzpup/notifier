# Telegram Setup Guide

## Prerequisites
- A Telegram account
- Node.js installed (for the helper script)

## Step 1: Create a Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name for your bot (e.g., "My Notification Bot")
4. Choose a username ending in "bot" (e.g., "mynotification_bot")
5. Copy the token BotFather gives you

## Step 2: Configure the Bot

Add the bot token to your `.env` file:
```env
VITE_TELEGRAM_TOKEN=your_bot_token_here
```

## Step 3: Set Up Groups (Optional)

### For Private Messages
Simply start a chat with your bot and send a message.

### For Group Messages

1. **Add the bot to your group**
   - Open your Telegram group
   - Click on the group name at the top
   - Click "Add Member"
   - Search for your bot and add it

2. **Make the bot an admin** (required for some groups)
   - Click on the group name
   - Click on your bot in the member list
   - Click "Promote to Admin"
   - Give it at least "Read Messages" permission

3. **Get the group ID**
   
   Option A: Use the helper script
   ```bash
   node scripts/get-telegram-group-id.js YOUR_BOT_TOKEN
   ```
   
   Option B: Manual method
   - Send a message in the group
   - Visit: `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates`
   - Look for your group in the JSON response
   - The group ID will be a negative number (e.g., -1001234567890)

4. **Configure group filtering** (optional)
   
   To monitor specific groups only, add their IDs to your `.env`:
   ```env
   VITE_TELEGRAM_GROUPS=-1001234567890,-1009876543210
   ```
   
   Leave empty to monitor all groups the bot is in.

## Troubleshooting

### Bot not receiving messages
- Make sure the bot is in the group
- For supergroups, the bot needs to be an admin
- Try removing and re-adding the bot

### Can't find group ID
- Make sure you've sent a message after adding the bot
- The bot must be active (your app should be running)
- Try the helper script: `node scripts/get-telegram-group-id.js YOUR_TOKEN`

### Multiple groups
- Separate group IDs with commas in VITE_TELEGRAM_GROUPS
- The bot will only monitor groups listed (or all if empty)