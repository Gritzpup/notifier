import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const DISCORD_CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '1401002202268696697';
const DISCORD_CLIENT_SECRET = process.env.VITE_DISCORD_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3001/auth/discord/callback';

// Discord OAuth2 URLs
const DISCORD_OAUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';

// Start OAuth2 flow
router.get('/discord', (req, res) => {
  console.log('Discord OAuth2 - Client ID:', DISCORD_CLIENT_ID);
  console.log('Discord OAuth2 - Has Secret:', !!DISCORD_CLIENT_SECRET);
  
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).json({ error: 'Discord Client ID not configured' });
  }
  
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify messages.read guilds'
  });
  
  res.redirect(`${DISCORD_OAUTH_URL}?${params}`);
});

// OAuth2 callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect('http://localhost:5174?error=no_code');
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: REDIRECT_URI
      })
    });
    
    const tokenData = await tokenResponse.json() as any;
    
    if (tokenData.error) {
      return res.redirect(`http://localhost:5174?error=${tokenData.error}`);
    }
    
    // Redirect to frontend with access token
    res.redirect(`http://localhost:5174?access_token=${tokenData.access_token}`);
  } catch (error) {
    console.error('OAuth2 callback error:', error);
    res.redirect('http://localhost:5174?error=oauth_failed');
  }
});

export { router as authRouter };