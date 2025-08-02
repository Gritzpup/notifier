#!/usr/bin/env node

import WebSocket from 'ws';

const username = 'xgritzdogx';
const oauth = 'oauth:zfjhapil0wekaejkbni1cs0s4evojp';

console.log('Testing Twitch OAuth credentials...\n');

// Test IRC connection
const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

ws.on('open', () => {
    console.log('✅ Connected to Twitch IRC WebSocket');
    
    // Send authentication
    ws.send(`PASS ${oauth}`);
    ws.send(`NICK ${username}`);
    
    console.log('📤 Sent authentication...');
});

ws.on('message', (data) => {
    const message = data.toString();
    console.log('📥 Received:', message);
    
    if (message.includes('001')) {
        console.log('\n✅ Successfully authenticated to Twitch IRC!');
        console.log('Your OAuth token is valid.');
        ws.close();
        process.exit(0);
    } else if (message.includes('Login authentication failed') || message.includes('Improperly formatted auth')) {
        console.log('\n❌ Authentication failed!');
        console.log('Your OAuth token is invalid or expired.');
        console.log('\nPlease get a new token from: https://twitchapps.com/tmi/');
        ws.close();
        process.exit(1);
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('\nConnection closed.');
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('\n⏱️ Connection timed out. Please check your internet connection.');
    ws.close();
    process.exit(1);
}, 10000);