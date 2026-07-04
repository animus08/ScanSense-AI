# 🩺 ScanSense AI: The Complete Master Guide

Welcome to the ultimate mastery guide for **ScanSense AI**! This document combines everything into one single, massive resource: from the basic setup instructions for beginners, all the way to a line-by-line developer masterclass regarding our modern Vanilla JS & FastAPI architecture.

---

## 🌟 Part 1: What is ScanSense AI?
**ScanSense AI** is a highly specialized, multimodal medical assistant designed for both patients and healthcare professionals. Unlike generic AI chatbots, ScanSense is tightly restricted to the medical domain and will automatically reject unrelated questions (e.g., coding, cooking, or general trivia).

### 🎯 Core Characteristics
- **Multimodal Capabilities:** It doesn't just read text! You can upload full medical PDF reports or even diagnostic images (like X-Rays, MRIs, and CT Scans), and the AI will analyze them visually.
- **Strict Medical Guardrails:** A rigorous validation process securely checks every uploaded file and user query to ensure it is actually medical data before generating a response.
- **Persistent Local Memory:** Completely private local storage. Every chat session is saved offline in an SQLite database (`chat.db`), allowing you to rename, retrieve, or delete your chat histories at any time.
- **Unified Build-Free Architecture:** A streamlined system where a FastAPI Python server serves raw HTML/JS/CSS directly, entirely eliminating the need for `npm`, Node.js, or complex build pipelines.

---

# 🚀 Part 2: How to Run the App (Step-by-Step Setup)

### Step 1: Install Python
You need Python for the backend logic and local server.
- **Python**: Go to [python.org](https://www.python.org/downloads/) and download the latest version. **(Windows users: you MUST check the box "Add Python to PATH" during installation!)**
- *(Note: You do NOT need Node.js or npm!)*

### Step 2: Get a Free AI API Key
This app uses an AI brain from a company called Groq. You need a free key to connect to it.
1. Go to [Groq Console](https://console.groq.com/keys).
2. Create a free account.
3. Click on "Create API Key" and copy the long string of text. Keep it secret!

### Step 3: Set Up the Project
1. Open up your terminal (or Command Prompt / PowerShell on Windows) and navigate to the folder where this project is saved.
2. Go into the `backend/` folder (`cd backend`).
3. Inside `backend/`, create a new file named exactly `.env` (don't forget the dot at the beginning).
4. Open the `.env` file in notepad or any text editor and paste your API key like this:
   ```env
   GROQ_API_KEY=your_copied_api_key_here
   ```
5. Save the file.

> [!WARNING]
> The repository may contain a pre-existing `.env` file in the root folder. For runtime security and proper setup, please ensure your actual environment variables are placed in the **`backend/.env`** file. You should also delete or secure any `.env` file in the root folder to prevent API key exposure.


### Step 4: Simple One-Click Start (Automated Script)
Because this project now uses a unified architecture, we have written a launch script to completely automate starting the server for you!

Go back to the main `ScanSense AI` folder in your terminal, and run:

**(Windows)**:
```cmd
.\run.bat
```

**(Mac / Linux)**:
```bash
./run.sh
```

**What the script does automatically:**
1. Triggers the creation of your Python virtual environment (`venv`).
2. Activates the virtual environment.
3. Installs all required Python dependencies from `backend/requirements.txt`.
4. **Starts the Unified Server** on Port 8000.

Unlike previous versions, your browser will not open automatically. You must manually open Chrome, Edge, or Firefox and navigate to:
**`http://localhost:8000`**

You can now start chatting with your AI!

---

# 🧠 Part 3: Architecture & Code Deep Dive (For Developers)

The project sits on a cutting-edge, ultra-lightweight web stack:
- **Frontend:** **Vanilla JS + TailwindCSS**. A hyper-fast interface managing real-time state with pure `fetch()` APIs and Server-Sent Events.
- **Backend API:** **FastAPI** (Python). A lightning-fast API web server.
- **AI Brain:** **Llama 4 Scout (17b-16e-instruct)** via the ultra-fast **Groq** API.
- **Workflow Orchestration:** **LangGraph** & **LangChain**, governing the intelligent routing of files inside the backend.
- **Database:** **SQLite**. A lightweight, file-based database.

## 📂 3.1 The Big Picture: Folder Mappings

The codebase is split into two folders:

**`backend/` (The Python Engine)**
- `config/settings.py`: Hardcoded text, AI prompts, and environment variables.
- `database/db_manager.py`: Saving and loading from the SQLite `.db` file.
- `utils/ai_assistant.py`: The LangGraph AI rules and memory logic.
- `main.py`: The FastAPI server that handles HTTP requests and serves static files.

**`frontend/` (The Browser UI)**
- `index.html`: The layout screen.
- `app.js`: The Javascript data engine making API calls and drawing chat bubbles.
- `styles.css`: Custom animations and scrollbars.

---

## 💻 3.2 Full Backend Walkthrough (File by File)

### ⚙️ File 1: `backend/config/settings.py` (The Settings File)
This file holds the core configuration.

```python
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# App Configuration
PAGE_TITLE = "ScanSense AI"
LAYOUT = "wide"
INITIAL_SIDEBAR_STATE = "collapsed"

# Model configuration
MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct"

# API Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Prompts
SYSTEM_PROMPT = """You are a highly specialized and strict medical assistant named ScanSense AI.
Your ONLY purpose is to assist with medical analysis, health inquiries, and understanding medical documents or images.

RESPONSE FORMATTING RULES (strictly follow these):
- Always use clean, well-structured markdown.
- Use ## for main section headings (e.g., ## Radiological Findings).
- Use ### for sub-headings.
- Use bullet points (- item) for lists.
- Use **bold** only for key medical terms or critical values — NOT for every word.
- Write in clear paragraphs. Do not write walls of text.
- Never output raw asterisks like ****. Every ** must surround actual emphasized text.
- Separate sections with a blank line.

CRITICAL CONTENT RULES - DO NOT VIOLATE:
1. You are strictly forbidden from answering ANY non-medical questions.
2. If a user asks a math question, requests a general message, asks about programming, general knowledge, or ANY non-medical topic, you MUST ONLY reply with: "I am a specialized medical AI. I cannot assist with non-medical inquiries. Please ask me a health or medical-related question."
3. DO NOT under any circumstances provide the answer to a non-medical question. DO NOT try to be helpful for general inquiries.
4. Keep responses concise but comprehensive for medical questions.
"""
```
**Explanation:** 
- `dotenv` reads that hidden `.env` file you created and temporarily saves the secret `GROQ_API_KEY` into your computer's memory. 
- `SYSTEM_PROMPT` utilizes **Zero-Shot Prompting with Negative Constraints**. By capitalizing `STRICTLY FORBIDDEN`, we statistically push the LLM away from generating non-medical vocabulary.

---

### 💾 File 2: `backend/database/db_manager.py` (The Save System)
This file handles the SQLite database, serving as the permanent memory.

```python
import sqlite3
import datetime
import os

# Use absolute path for database
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(DB_DIR, "chat.db")

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            last_context TEXT,
            last_content_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if columns exist (for migration)
    c.execute("PRAGMA table_info(sessions)")
    columns = [column[1] for column in c.fetchall()]
    if 'last_context' not in columns:
        c.execute("ALTER TABLE sessions ADD COLUMN last_context TEXT")
    if 'last_content_type' not in columns:
        c.execute("ALTER TABLE sessions ADD COLUMN last_content_type TEXT")

    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            role TEXT,
            content TEXT,
            image TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS memory_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER UNIQUE,
            summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    conn.commit()
    conn.close()
```
**Explanation:** 
- The `sessions` table tracks individual chats. It stores the `last_context` (Base64 image string or PDF text) directly in the row.
- `messages` stores every individual chat bubble, tied back to a session via `FOREIGN KEY`.
- `memory_summaries` is our **Long-Term Memory** storage. After a chat ends, an AI agent writes a 3-sentence summary of it here.

---

### 🧠 File 3: `backend/utils/ai_assistant.py` (The Logic & Orchestrator)
This connects your backend to Groq using LangChain and LangGraph.

#### The Medical Bouncer
```python
def is_medical_content(content, content_type):
    llm = get_llm(temperature=0.0)
    
    if content_type == 'image':
        msg = HumanMessage(
            content=[
                {"type": "text", "text": "Is this image related to the medical field? Strict YES or NO."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{content}"}}
            ]
        )
    # ...
    return "YES" in str(response.content).strip().upper()
```
**Explanation:** 
- Before processing a file, this connects to the `llm` with `temperature=0` (0% creativity, 100% strict robotic precision). It forces the model to output a rigid YES/NO.

#### Late-Binding Guardrails
```python
    guardrail_reminder = (
        "\n\n[SYSTEM REMINDER: If this request is NOT related to medicine, health, or the provided medical context, "
        "you MUST decline and reply EXACTLY with: 'I am a specialized medical AI. I cannot assist with non-medical inquiries. Please ask me a health or medical-related question.']"
    )
    user_text_with_guardrail = user_text + guardrail_reminder

    messages.append(HumanMessage(content=user_text_with_guardrail))
```
**Explanation:**
- This is a critical security fix. If a user says `2+2`, we secretly append `[SYSTEM REMINDER: decline...]` to the end of their message right before sending it to Groq. This ensures the AI never "forgets" it is a medical assistant.

#### LangGraph Routing
```python
class ChatState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    context: str
    content_type: str

def call_model_node(state: ChatState):
    messages = list(state["messages"])
    llm = get_llm(temperature=0.7)
    response = llm.invoke(messages)
    return {"messages": [response]}

workflow = StateGraph(ChatState)
workflow.add_node("call_model", call_model_node)
workflow.add_edge(START, "call_model")
workflow.add_edge("call_model", END)
chatbot_app = workflow.compile()
```
**Explanation:** 
- `ChatState` acts as the memory block for the graph.
- `StateGraph` compiles this into a workflow. If we want to add complex agentic behaviors later (like web searching), we simply add a new `node` to this graph!

---

### 🚀 File 4: `backend/main.py` (The API Server)
This is the single entry point holding the Python backend together. 

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title="ScanSense AI API")

# Setup endpoints...

# Static File Serving
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "frontend")

@app.get("/{rest_of_path:path}")
async def serve_frontend(rest_of_path: str):
    file_path = os.path.join(FRONTEND_DIST, rest_of_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
```
**Explanation:** 
- This replaces the need for a React Vite server. FastAPI intercepts every web request. If you ask for `localhost:8000/app.js`, it reads `frontend/app.js` and serves it to you natively.

```python
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    # ...
    def sse_event_generator():
        full_response = ""
        yield f"data: SESSION_ID:{request.session_id}\n\n"
        
        for chunk in stream_chat_response(...):
            full_response += chunk
            safe_chunk = chunk.replace("\n", "\r")
            yield f"data: {safe_chunk}\n\n"
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")
```
**Explanation:** 
- **Server-Sent Events (SSE)** keep the HTTP connection physically open, constantly firing live packets (`data: ...`) to the browser so your screen gets that fluid "live-typing" animation!
- We use the `\r` (carriage return) hack because raw `\n` characters break the SSE protocol.

---

## 💻 3.3 Full Frontend Walkthrough (Vanilla JS)

By removing React, we achieved a massive performance boost, but we had to write complex state management ourselves.

### 🧩 File 5: `frontend/app.js` (The Engine)

#### The Custom Markdown Parser
We cannot use `react-markdown`. We built our own Regex parser.

```javascript
function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const output = [];
  let inList = false;

  for (let raw of lines) {
    let line = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (/^###\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<h3>' + applyInline(line.replace(/^###\s*/, '')) + '</h3>');
    } else if (/^- (.+)/.test(line)) {
      if (!inList) { output.push('<ul class="list-disc pl-5 my-2 space-y-1">'); inList = true; }
      output.push('<li>' + applyInline(line.replace(/^- /, '')) + '</li>');
    } else if (line.trim() === '') {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<br/>');
    } else {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<p>' + applyInline(line) + '</p>');
    }
  }
  
  if (inList) output.push('</ul>');
  let finalHtml = output.join('');
  return finalHtml;
}

function applyInline(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}
```
**Explanation:**
- It reads the text line-by-line.
- If a line starts with `- `, it knows to wrap it in `<li>` tags and open a `<ul>` tag if one isn't open yet.
- `applyInline` handles the `**bold**` asterisks.

#### SSE Stream Decoding
```javascript
    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      const lines = chunkText.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          
          if (data.startsWith("SESSION_ID:")) {
            const bId = parseInt(data.split(":")[1]);
            chats[chatIdx].backendId = bId;
            saveState();
            continue;
          }

          if (data === "[DONE]") continue;

          // Replace \r placeholder back to \n
          const cleanData = data.replace(/\r/g, "\n");
          fullResponse += cleanData;
          
          const msgIdx = chats[chatIdx].messages.findIndex(m => m.id === aiMsgId);
          if (msgIdx !== -1) {
            chats[chatIdx].messages[msgIdx].content = fullResponse;
            saveState();
            renderMessages();
          }
        }
      }
    }
```
**Explanation:**
- `reader.read()` intercepts the binary packets. `TextDecoder` translates them to strings.
- We reverse the `\r` hack, swapping it back to `\n` so the Markdown parser knows where the line breaks are.
- We then call `renderMessages()` which physically redraws the entire `innerHTML` of the chat box.

### 🎨 File 6: `frontend/styles.css` (The Styling)
We utilize custom CSS for scrollbars and animations.

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}

.typing-dot {
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
```
**Explanation:**
- This makes the scrollbars invisible unless hovered.
- The `animation-delay` offset creates the sequential bouncing wave effect in the "Assistant is typing..." indicator.

---

## 🚀 4. Scaling Up (The Future Developer Roadmap)

If you want to deploy ScanSense AI to thousands of users on the cloud, here is what you must change:

### Upgrade #1: Adding User Login (Authentication)
Right now, `chat.db` saves every chat into one giant pool. Anyone who opens the URL can see them.
**How to fix it:**
You would integrate an authentication library (like JWT or Firebase). You would modify the SQLite `sessions` table to add a new column: `user_id`. When querying past chats in `db_manager.py`, instead of `SELECT * FROM sessions`, you would write `SELECT * FROM sessions WHERE user_id = ?` to ensure users only see their own data.

### Upgrade #2: Swapping SQLite for PostgreSQL
SQLite is fantastic because it's just a file (`chat.db`). However, if 50 users try to upload X-rays at the exact same millisecond, SQLite will lock the file and crash.
**How to fix it:**
You would launch a real cloud database (like PostgreSQL on Supabase or AWS). You would change `import sqlite3` inside `database/db_manager.py` to `import psycopg2` or use an Object Relational Mapper (ORM) like SQLAlchemy. Because we beautifully modularized our database logic into its own folder, you would not have to change a single line of frontend code for this to work!

---

## 🐞 5. Troubleshooting & Common Bugs (FAQ)

Every developer runs into issues. If you pull this code onto a brand new computer and things break, check this list:

### Error: "GROQ_API_KEY not found"
**Cause:** Python cannot find your secret key in memory.
**Fix:** You forgot to create the `.env` file, or you named it `.env.txt`. Make sure the file has no extension and is sitting in the `backend/` folder.

### Error: "Database disk image is malformed"
**Cause:** Your computer suddenly shut down while writing a message, corrupting the `chat.db` file.
**Fix:** Delete the `chat.db` file completely. The next time you run your backend, the `init_db()` function will instantly generate a fresh, clean database automatically!

### The UI is completely blank when opening localhost:8000
**Cause:** FastAPI is unable to locate the `frontend` directory.
**Fix:** Ensure you are running the server using `run.bat` from the root directory. If you manually run `python main.py` from inside another folder, relative paths will break.

---

---

# 📚 Part 6: API Reference & Endpoint Details

If you are a frontend developer attempting to build a completely new UI (for example, an iOS App or Android App in Flutter) and you want to connect it to our existing FastAPI backend, this API reference is exactly what you need.

## 📡 6.1 Upload API
Used for uploading and validating files before they are attached to a chat.

- **Endpoint URL:** `/api/upload`
- **Method:** `POST`
- **Headers:** `multipart/form-data`

### Request Body (Form Data)
| Key | Type | Description | Required |
| --- | --- | --- | --- |
| `file` | `File` | The physical file being uploaded (PDF, JPG, PNG). | Yes |

### Success Response (200 OK)
Returns a JSON object containing the extracted text or Base64 string.
```json
{
  "status": "success",
  "content_type": "pdf",
  "context": "Patient Name: John Doe. Blood Test Results show elevated white blood cell count...",
  "filename": "blood_test_results.pdf"
}
```

### Error Response (400 Bad Request)
If the file fails the medical validation check.
```json
{
  "detail": "The uploaded PDF does not appear to be medical in nature."
}
```

---

## 📡 6.2 Chat API (Server-Sent Events)
Used for sending user messages and receiving the real-time AI typing animation.

- **Endpoint URL:** `/api/chat`
- **Method:** `POST`
- **Headers:** `application/json`

### Request Body (JSON)
| Key | Type | Description | Required |
| --- | --- | --- | --- |
| `message` | `String` | The text the user typed. | Yes |
| `context` | `String` | The extracted string from `/api/upload`. | No |
| `content_type` | `String` | Either "pdf" or "image". | No |
| `session_id` | `Integer` | The SQLite session ID to attach this message to. | No (If empty, a new session is created) |

### Success Response (200 OK - Text/Event-Stream)
This does not return standard JSON. It returns an open stream of string packets prefixed with `data: `.

**Stream Example:**
```text
data: SESSION_ID:42

data: Hello!
data: I see your X-Ray.
data: You have a minor fracture in the 
data: distal radius.
data: [DONE]
```

---

# 📖 Part 7: Code Appendix (Raw Source Files)

For absolute completeness, below are the critical source files that make up the entire Vanilla JS application. 

## Appendix A: `frontend/styles.css`
This file provides all the visual flair, smooth animations, and scrollbar modifications.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
    
    /* App specific */
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --chat-user: 0 0% 96%;
    --chat-user-foreground: 240 10% 3.9%;
    --chat-ai: 0 0% 100%;
    --chat-ai-foreground: 240 10% 3.9%;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    
    /* App specific */
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --chat-user: 240 3.7% 15.9%;
    --chat-user-foreground: 0 0% 98%;
    --chat-ai: 240 10% 3.9%;
    --chat-ai-foreground: 0 0% 98%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}

.scrollbar-thin {
  scrollbar-width: thin;
}

/* Float Animation */
@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
  100% { transform: translateY(0px); }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

/* Typing Indicator Dots */
.typing-dot {
  animation: bounce 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
.typing-dot:nth-child(3) { animation-delay: 0s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* File Upload Animation */
@keyframes pulse-border {
  0% { border-color: rgba(var(--primary), 0.2); }
  50% { border-color: rgba(var(--primary), 0.8); }
  100% { border-color: rgba(var(--primary), 0.2); }
}

.upload-active {
  animation: pulse-border 1.5s infinite;
  background-color: rgba(var(--primary), 0.05);
}

/* Custom Markdown Prose Fixes */
.prose p { margin-top: 0.5em; margin-bottom: 0.5em; }
.prose ul { margin-top: 0.5em; margin-bottom: 0.5em; }
.prose h3 { margin-top: 1em; margin-bottom: 0.5em; font-size: 1.25em; font-weight: 600; }
.prose strong { font-weight: 600; }
```

## Appendix B: `run.bat` (The Bootstrapper)
This file is the magic behind the "One-Click Start".

```cmd
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
cd backend
python -m uvicorn main:app --reload --port 8000
```

## Appendix C: `frontend/index.html` (The Layout)
This is the complete DOM structure that wires the Javascript and Tailwind together.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ScanSense AI</title>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Custom Styles -->
  <link rel="stylesheet" href="styles.css" />
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="flex h-screen w-full overflow-hidden bg-background">
  <!-- Sidebar and Chat containers omitted for brevity in appendix -->
  <!-- See full source in repository -->
  <script src="app.js?v=4"></script>
</body>
</html>
```

---

This marks the absolute end of the ScanSense AI Complete Guide. Happy coding!
