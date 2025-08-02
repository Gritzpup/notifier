# Why Discord Personal DMs Need Manual Authorization

## The Two Different Discord Connections:

### 1. Bot Connection (Automatic)
- **What it sees**: Server messages in channels the bot can access
- **How it works**: Uses bot token, connects automatically via WebSocket
- **No button needed**: Bot permissions are set when you invite it to server

### 2. Personal DMs (OAuth2 - Requires Button)
- **What it sees**: YOUR personal direct messages  
- **How it works**: Uses OAuth2 to act on YOUR behalf
- **Button required**: Discord requires explicit user consent for privacy/security

## Why Can't Personal DMs Be Automatic?

1. **Discord's Security Policy**: Apps cannot access user DMs without explicit permission
2. **Privacy Protection**: Your DMs are private - Discord ensures you knowingly grant access
3. **OAuth2 Standard**: Industry standard requires user interaction for personal data access
4. **Different from Bot**: Bot has its own identity; OAuth2 uses YOUR identity

## How It Works:

1. Click "Connect Discord DMs" → Redirects to Discord
2. Discord asks: "Do you want to allow this app to read your messages?"
3. You click "Authorize"
4. App can now poll your DMs every 5 seconds

## Summary:
- **Bot messages** = Automatic (it's the bot's own messages)
- **Your personal DMs** = Manual authorization required (it's YOUR private messages)

This is by design for security - Discord won't let any app secretly read your personal messages!