#!/bin/bash

echo "🔧 Setting up Notification Hub..."

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the app, run: npm run dev"
echo "   This will start both frontend and backend automatically!"
echo ""
echo "⚠️  Don't forget to add your Discord Client Secret to .env file"