#!/bin/bash

# Navigate to the project root
cd "$(dirname "$0")"

# 1. Setup Backend Environment (Python)
if [ ! -d "venv" ]; then
    echo "🏗️ Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Installing backend dependencies..."
    pip install -r backend/requirements.txt
else
    source venv/bin/activate
fi

# 2. Frontend is now Vanilla HTML/JS, no build step required!
echo "🚀 Frontend is ready (Vanilla JS)."

# 3. Start the Unified Server (FastAPI)
echo "💎 Starting ScanSense AI (Unified Server)..."
echo "🌐 Your app will be available at http://localhost:8000"
python3 -m uvicorn backend.main:app --reload --port 8000
