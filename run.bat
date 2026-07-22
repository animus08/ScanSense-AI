@echo off
echo 💎 Starting ScanSense AI Unified Connection...

:: 1. Setup Backend Environment (Python)
if not exist venv (
    echo 🏗️ Creating virtual environment...
    python -m venv venv
)
echo 🔄 Activating virtual environment...
call venv\Scripts\activate.bat

echo 📦 Installing backend dependencies...
pip install -r backend\requirements.txt

:: 2. Frontend is now Vanilla HTML/JS, no build step required!
echo 🚀 Frontend is ready (Vanilla JS).

:: 3. Start the Unified Server (FastAPI)
echo 🌐 Starting ScanSense AI (Port 8000)...
python -m uvicorn backend.main:app --reload --port 8000