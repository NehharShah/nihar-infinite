#!/bin/bash

# Cross-Border Payment API - Temporal Setup Script
# This script helps set up Temporal for the payment processing system

set -e

echo "🚀 Setting up Temporal for Cross-Border Payment API"
echo "=================================================="

# Check if Temporal CLI is installed
if ! command -v temporal &> /dev/null; then
    echo "❌ Temporal CLI not found. Installing..."
    
    # Detect OS and install Temporal CLI
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install temporal
        else
            echo "❌ Homebrew not found. Please install Homebrew first:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -sSf https://temporal.download/cli.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "❌ Unsupported OS. Please install Temporal CLI manually:"
        echo "   https://github.com/temporalio/cli/releases"
        exit 1
    fi
else
    echo "✅ Temporal CLI already installed"
fi

# Check Temporal CLI version
TEMPORAL_VERSION=$(temporal version 2>/dev/null | head -n 1 || echo "unknown")
echo "📦 Temporal CLI Version: $TEMPORAL_VERSION"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file with Temporal configuration..."
    cat > .env << EOF
# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_AUTO_START=true

# Development Settings
NODE_ENV=development
TEMPORAL_METRICS_ENABLED=true
TEMPORAL_TRACING_ENABLED=true

# API Configuration
PORT=3000
LOG_LEVEL=info
EOF
    echo "✅ Created .env file"
else
    echo "✅ .env file already exists"
fi

# Check if Temporal server is running
echo "🔍 Checking if Temporal server is running..."
if curl -s http://localhost:7233/health &> /dev/null; then
    echo "✅ Temporal server is already running"
else
    echo "⚠️  Temporal server is not running"
    echo "   To start it, run: temporal server start-dev"
    echo "   Or use: npm run temporal:start"
fi

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
else
    echo "✅ npm dependencies already installed"
fi

# Build the project
echo "🔨 Building the project..."
npm run build

echo ""
echo "🎉 Temporal setup complete!"
echo ""
echo "Next steps:"
echo "1. Start Temporal server: temporal server start-dev"
echo "2. Start payment workers: npm run worker"
echo "3. Start the API server: npm run dev"
echo "4. Access Temporal UI: http://localhost:8233"
echo "5. Access API docs: http://localhost:3000/docs"
echo ""
echo "📚 For more information, see the README.md file" 