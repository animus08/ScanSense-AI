# 🧠 Complete Architecture & Code Deep Dive (Expanded Developer Edition)

Welcome to the ultimate technical guide for **ScanSense AI**. This document provides an exhaustive, line-by-line masterclass on the project's internal logic, system design, and component integration. Every single file, class, and critical function is documented below.

## 🌟 1. System Overview: The Unified Architecture
ScanSense AI previously utilized a decoupled React/Vite frontend and a FastAPI backend. To maximize performance, reduce build times, and eliminate `npm` dependencies, the application has been refactored into a **Build-Free Unified Architecture**.

### Key Architectural Shifts:
1. **Zero-Build Frontend:** The UI is purely Vanilla JS (`app.js`), HTML5, and Tailwind CSS (via CDN). There is no compilation step.
2. **Single Server Port:** FastAPI (`main.py`) acts as both the API engine and the static file server, hosting everything on `http://localhost:8000`.
3. **Local Persistence:** A lightweight SQLite database (`chat.db`) handles all session state and long-term memory locally, ensuring total privacy.

---

## 📂 2. Directory Structure Mappings

The codebase is organized into two distinct layers, orchestrated by a single bootstrapper:

**`backend/` (The Python Engine)**
- `config/settings.py`: Environment variables, prompts, and global constants.
- `database/db_manager.py`: SQLite interaction, schema definition, and query execution.
- `utils/ai_assistant.py`: The LangGraph state machine, message history handling, and LLM streaming.
- `main.py`: The FastAPI application, API routing, SSE chunking, and static file serving.
- `requirements.txt`: Python package dependencies.

**`frontend/` (The Browser UI)**
- `index.html`: The semantic DOM structure and Tailwind utility classes.
- `app.js`: The Vanilla JS application state, DOM manipulators, SSE parser, and Markdown renderer.
- `styles.css`: Custom CSS animations, scrollbar styling, and color variables.
- `logo.png` / `logo1.png`: Application branding.

**Root level**
- `run.bat` / `run.sh`: Automated bootstrapping scripts to activate virtual environments and launch Uvicorn.

---

## 💻 3. Backend Deep Dive: The Engine

### 3.1 The API Server (`backend/main.py`)
`main.py` is the literal heart of the application. It handles incoming HTTP requests, directs traffic, and pushes real-time data back to the browser.

#### The Core Setup
```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import base64
import os
import io
import PyPDF2
from PIL import Image

# Initialize Database correctly from backend directory
from .database.db_manager import (
    init_db, create_session, save_message, get_chat_history,
    get_all_sessions, delete_session, update_session_context,
    get_session_context, save_memory_summary, get_recent_memory_summaries
)
from .utils.ai_assistant import stream_chat_response, is_medical_content, summarize_session

app = FastAPI(title="ScanSense AI API")

# Add CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins since frontend is served from same server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()
```
**Explanation:** 
- We instantiate the `FastAPI` app. It is heavily reliant on asynchronous `async/await` capabilities, making it ideal for streaming LLM responses.
- `CORSMiddleware` handles cross-origin requests, though since we now serve statically, it's mostly a fallback for development.
- `startup_event` triggers SQLite table creation on boot.

#### The File Upload Endpoint
```python
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """ Endpoint to extract content from images and pdfs and validate them """
    try:
        content = await file.read()
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        extracted_context = ""
        content_type = ""
        encoded_image = None
        
        if file_ext == '.pdf':
            content_type = 'pdf'
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                extracted_context += page.extract_text()
            
            if not is_medical_content(extracted_context, 'pdf'):
                raise HTTPException(status_code=400, detail="The uploaded PDF does not appear to be medical in nature.")
                
        elif file_ext in ['.png', '.jpg', '.jpeg']:
            content_type = 'image'
            image = Image.open(io.BytesIO(content))
            buffered = io.BytesIO()
            image.convert('RGB').save(buffered, format="JPEG")
            encoded_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
            extracted_context = encoded_image
            
            if not is_medical_content(encoded_image, 'image'):
                raise HTTPException(status_code=400, detail="The uploaded image does not appear to be medical in nature.")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        return {
            "status": "success",
            "content_type": content_type,
            "context": extracted_context,
            "filename": file.filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```
**Explanation:**
- This endpoint processes files before they reach the chat.
- **PDF Extraction**: Uses `PyPDF2` to read all text from the PDF into memory.
- **Image Encoding**: Uses `PIL` to convert images to JPEG and then base64 encodes them so the AI vision model can read them.
- **Pre-Flight Validation**: Calls `is_medical_content` to act as an initial bouncer, rejecting non-medical files outright.

#### The Chat Endpoint & SSE Implementation
The most critical part of `main.py` is the `/api/chat` endpoint, which utilizes Server-Sent Events (SSE).

```python
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not request.session_id:
        request.session_id = create_session(request.message[:30] + "...")
        
    # Context retrieval and DB saving logic...
    save_message(request.session_id, "user", request.message)
    chat_history = get_chat_history(request.session_id)
    long_term_memories = get_recent_memory_summaries(...)

    def sse_event_generator():
        full_response = ""
        yield f"data: SESSION_ID:{request.session_id}\n\n"
        
        for chunk in stream_chat_response(
            chat_history=chat_history,
            context=current_context,
            content_type=current_content_type,
            user_text=request.message,
            long_term_memories=long_term_memories
        ):
            full_response += chunk
            # The Carriage Return Hack:
            safe_chunk = chunk.replace("\n", "\r")
            yield f"data: {safe_chunk}\n\n"
        
        save_message(request.session_id, "assistant", full_response)
        
        # Background memory summary...
        updated_history = get_chat_history(request.session_id)
        if len(updated_history) >= 2:
            summary = summarize_session(updated_history)
            if summary:
                save_memory_summary(request.session_id, summary)

        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")
```
**Explanation:**
- `sse_event_generator()` is a Python generator function (`yield`). Instead of waiting for the AI to finish its 30-second thought process, the server pushes data *live* as it generates.
- **The Carriage Return Hack (`replace("\n", "\r")`)**: Standard SSE protocols use `\n\n` to signify the end of a data packet. If the AI outputs a raw newline, it breaks the SSE packet. By temporarily replacing `\n` with `\r` (carriage return), we safely transmit line breaks to the Javascript frontend, which swaps them back.
- `StreamingResponse` natively understands generators and keeps the HTTP connection open.

#### Static File Serving
```python
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
- This acts as a "catch-all" route. If the browser asks for `/app.js`, FastAPI manually locates it in the `frontend` folder and returns it. If the path doesn't exist, it defaults to returning `index.html`. This entirely removes the need for a separate NGINX or Node server.

---

### 3.2 The LangGraph Orchestrator (`backend/utils/ai_assistant.py`)
This file houses the intelligence. It constructs the message history array and queries the Llama model.

#### LLM Configuration
```python
def get_llm(temperature=0.0):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not found in environment variables.")
    return ChatGroq(model=MODEL_NAME, api_key=GROQ_API_KEY, temperature=temperature)
```
**Explanation:**
- A helper function that instantiates the Groq LangChain wrapper. By default, it uses `temperature=0.0` for highly deterministic tasks (like validation), but the main chat increases this to `0.7` for natural conversation.

#### Pre-Flight Medical Validation
```python
def is_medical_content(content, content_type):
    llm = get_llm(temperature=0.0)
    
    if content_type == 'image':
        msg = HumanMessage(
            content=[
                {"type": "text", "text": "Is this image related to the medical field (e.g., X-ray, MRI, medical report, prescription, symptoms, anatomy)? Answer strictly with 'YES' or 'NO'."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{content}"}}
            ]
        )
    elif content_type == 'pdf':
        sample_text = content[:2000]
        msg = HumanMessage(
            content=f"Is this text from a medical document? Answer strictly with 'YES' or 'NO'.\n\nText:\n{sample_text}"
        )
    else:
        return False

    try:
        response = llm.invoke([msg])
        return "YES" in str(response.content).strip().upper()
    except Exception as e:
        print(f"Validation Error: {e}")
        return False
```
**Explanation:**
- This function acts as an intelligent firewall. It prevents non-medical images or PDFs from entering the main pipeline, enforcing the strict medical domain constraint.

#### LangGraph State Definition
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
- **StateGraph** defines the AI's execution pipeline. While currently simple (Start -> LLM -> End), using LangGraph allows us to easily add future nodes (like "Search Medical Database" or "Consult Pharmacist Agent") without rewriting the core loop.

#### Late-Binding Prompt Injection
A critical security feature implemented in this file prevents "jailbreaks" (users forcing the AI to answer non-medical questions).

```python
    # Only attach image on the very first exchange
    prior_assistant_count = sum(1 for m in chat_history[:-1] if m["role"] == "assistant")
    is_first_image_message = (content_type == "image" and context and prior_assistant_count == 0)

    guardrail_reminder = (
        "\n\n[SYSTEM REMINDER: If this request is NOT related to medicine, health, or the provided medical context, "
        "you MUST decline and reply EXACTLY with: 'I am a specialized medical AI. I cannot assist with non-medical inquiries. Please ask me a health or medical-related question.']"
    )
    user_text_with_guardrail = user_text + guardrail_reminder

    if is_first_image_message:
        messages.append(HumanMessage(
            content=[
                {"type": "text", "text": user_text_with_guardrail},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{context}"}}
            ]
        ))
    else:
        messages.append(HumanMessage(content=user_text_with_guardrail))
```
**Explanation:**
- LLMs often suffer from "attention collapse"—forgetting their original System Prompt instructions if the user's latest query is highly distracting (e.g., "Write a message for my school").
- By silently appending the `guardrail_reminder` directly to the *bottom* of the user's message just milliseconds before execution, we force the AI's attention to prioritize the refusal directive.

---

### 3.3 The Database Layer (`backend/database/db_manager.py`)
We utilize `sqlite3` to ensure zero-configuration deployment. No Docker or PostgreSQL daemons are required.

#### Schema Initialization
```python
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Create sessions table...
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
    # Create memory_summaries table...
    conn.commit()
    conn.close()
```
**Explanation:**
- `FOREIGN KEY(session_id)` ensures relational integrity. A message cannot exist without a parent session.
- Files (Images/PDFs) are stored as strings (Base64 or extracted text) in the `sessions` table under `last_context`. No physical files are saved to the OS disk, ensuring clean state management.

#### Long Term Memory Queries
```python
def get_recent_memory_summaries(exclude_session_id=None, limit=5):
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    if exclude_session_id:
        c.execute(
            "SELECT ms.summary, s.title FROM memory_summaries ms "
            "JOIN sessions s ON ms.session_id = s.id "
            "WHERE ms.session_id != ? "
            "ORDER BY ms.created_at DESC LIMIT ?",
            (exclude_session_id, limit)
        )
    # ...
```
**Explanation:**
- An inner `JOIN` combines the `summary` text with the `title` of the session it came from. This data is injected into the AI's System Prompt, giving it the illusion of long-term memory across isolated chats.

---

## 💻 4. Frontend Deep Dive: The Vanilla UI

The frontend is a masterpiece of modern Vanilla Javascript. Without React, we rely on heavy DOM manipulation and native Browser APIs.

### 4.1 The Custom Markdown Parser (`frontend/app.js`)
Instead of importing a heavy library like `react-markdown`, we wrote a lightweight, line-by-line Regex parser.

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
    } 
    // ... list logic, paragraphs
  }
  
  let finalHtml = output.join('');
  
  // Safety Net: Handle headings that got mashed inline despite our newline efforts
  finalHtml = finalHtml.replace(/<p>(.*?)####\s*(.*?)<\/p>/g, '<p>$1</p><h4>$2</h4><p>');
  
  return finalHtml;
}

function applyInline(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
```
**Explanation:**
- **Sanitization first:** `.replace(/</g, '&lt;')` completely neutralizes XSS (Cross-Site Scripting) attacks by converting HTML brackets into harmless text entities.
- **Stateful parsing:** The `inList` boolean tracks if we are currently building an `<ul>` element across multiple lines, closing it intelligently when a non-list line appears.
- **Inline processing:** `applyInline` handles the bold and italic asterisks within the generated HTML tags.

### 4.2 Handling the SSE Stream (`frontend/app.js`)
The hardest part of Vanilla JS AI apps is smoothly decoding the binary network stream.

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
          
          if (data === "[DONE]") continue;

          // The Carriage Return Fix:
          const cleanData = data.replace(/\r/g, "\n");
          fullResponse += cleanData;
          
          // Trigger DOM Update
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
- `chatRes.body.getReader()` grants low-level access to the TCP/HTTP stream buffer.
- `decoder.decode(value)` converts the raw `Uint8Array` bytes into readable UTF-8 text.
- `replace(/\r/g, "\n")` reverses the hack we performed in `main.py`, restoring true line breaks so the Markdown parser can do its job.
- We update the local `chats` array state and trigger `renderMessages()`—which entirely replaces the `innerHTML` of the chat window, creating the illusion of smooth typing.

### 4.3 Sidebar & Layout Logic (`frontend/index.html`)
The UI utilizes CSS Grid and Flexbox heavily via Tailwind classes.

```html
<div id="desktop-sidebar" style="width:256px; min-width:256px; transition: width 0.25s ease;" class="flex flex-col bg-sidebar h-full border-r ...">
```
**Explanation:**
- We avoid heavy React `framer-motion` libraries by utilizing pure CSS `transition: width 0.25s ease`. 
- When the sidebar toggle button is clicked in `app.js`, we simply set `dom.desktopSidebar.style.width = '0'`, and the browser's GPU hardware-accelerates the smooth collapsing animation.

---

## 🔒 5. Security & Prompt Architecture

### 5.1 Environment Variables
`GROQ_API_KEY` is loaded natively via the `python-dotenv` package in `settings.py`. It is never exposed to the frontend browser, preventing credential theft.

### 5.2 The System Prompt (`backend/config/settings.py`)
```python
SYSTEM_PROMPT = """You are a highly specialized and strict medical assistant named ScanSense AI.
Your ONLY purpose is to assist with medical analysis, health inquiries, and understanding medical documents or images.

CRITICAL CONTENT RULES - DO NOT VIOLATE:
1. You are strictly forbidden from answering ANY non-medical questions.
...
"""
```
**Explanation:**
- Utilizing "Negative Constraint Prompting". Instruct-tuned models (like Llama 3) respond well to explicitly capitalized boundaries. We define exactly what the model *cannot* do, drastically reducing hallucination and off-topic engagement.

---

## 🎨 6. Styling & CSS Architecture (`frontend/styles.css`)

While Tailwind CSS handles 95% of the styling through utility classes in `index.html` and `app.js`, `styles.css` is reserved for complex, custom behaviors that Tailwind either cannot do natively or that would result in excessively long class strings.

### 6.1 Custom Scrollbars
Webkit browsers (Chrome, Safari, Edge) allow deep customization of scrollbars. We hide the ugly default blocky scrollbars and replace them with sleek, modern, fading ones.

```css
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
```
**Explanation:**
- We override the base `::-webkit-scrollbar` pseudo-element to shrink it to `6px`.
- By setting the `track` to `transparent`, the scrollbar visually "floats" over the content instead of carving out a rigid gray box on the side of the screen.

### 6.2 Custom Animations
Tailwind includes basic animations (spin, pulse, ping), but we needed custom keyframes for the chat bubbles and the typing indicator.

```css
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
```
**Explanation:**
- The `.animate-float` is applied to the brain logo in the empty state screen, giving it a subtle hovering effect.
- The `.typing-dot` leverages `animation-delay` offsets. Because child 1 starts at `-0.32s` and child 2 at `-0.16s`, they don't bounce at the exact same time, creating a "wave" effect.

### 6.3 CSS Variables (Theaming)
The entire dark/light mode system relies on CSS variables defined in `:root` and `.dark`.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  /* ... */
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```
**Explanation:**
- When the user clicks the moon/sun icon, Javascript toggles the `.dark` class on the `<html>` tag. This instantly swaps all color definitions, and Tailwind recalculates the entire UI in milliseconds.

---

## 🚀 7. Conclusion
ScanSense AI represents a masterclass in modern, decoupled-yet-unified application design. By abandoning heavy frontend build pipelines and relying on pure Browser APIs and FastAPI streaming, the codebase achieves near-instant startup times, minimal memory footprints, and extreme extensibility.

*(End of Architecture Document)*
