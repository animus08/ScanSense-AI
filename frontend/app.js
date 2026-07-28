// --- Constants & State ---
const STORAGE_KEY = "scansense_chats_v1";
const ACTIVE_CHAT_KEY = "scansense_active_chat_v1";

// --- Inline Markdown Renderer (line-by-line, reliable) ---
function renderMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const output = [];
  let inList = false;

  for (let raw of lines) {
    let line = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings (match anywhere in line as a fallback, but prioritize start of line)
    if (/^####\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<h4>' + applyInline(line.replace(/^####\s*/, '')) + '</h4>');
    } else if (/^###\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<h3>' + applyInline(line.replace(/^###\s*/, '')) + '</h3>');
    } else if (/^##\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<h2>' + applyInline(line.replace(/^##\s*/, '')) + '</h2>');
    } else if (/^#\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<h1>' + applyInline(line.replace(/^#\s*/, '')) + '</h1>');
    }
    // Horizontal rule
    else if (/^---+$/.test(line.trim())) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<hr>');
    }
    // Unordered list item (- or *)
    else if (/^\s*[-*]\s*(.+)/.test(line)) {
      if (!inList) { output.push('<ul>'); inList = true; }
      const content = line.replace(/^\s*[-*]\s*/, '');
      output.push('<li>' + applyInline(content) + '</li>');
    }
    // Ordered list item (1.)
    else if (/^\s*\d+\.\s*(.+)/.test(line)) {
      if (!inList) { output.push('<ul>'); inList = true; }
      const content = line.replace(/^\s*\d+\.\s*/, '');
      output.push('<li>' + applyInline(content) + '</li>');
    }
    // Blockquote
    else if (/^\s*&gt;\s*(.+)/.test(line)) {
      if (inList) { output.push('</ul>'); inList = false; }
      const content = line.replace(/^\s*&gt;\s*/, '');
      output.push('<blockquote class="border-l-4 border-primary pl-3 italic text-muted-foreground my-2">' + applyInline(content) + '</blockquote>');
    }
    // Empty line
    else if (line.trim() === '') {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<br>');
    }
    // Normal paragraph line
    else {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<p>' + applyInline(line) + '</p>');
    }
  }

  if (inList) output.push('</ul>');

  let finalHtml = output.join('');

  // Safety Net: Handle headings that got mashed inline despite our newline efforts
  finalHtml = finalHtml.replace(/<p>(.*?)####\s*(.*?)<\/p>/g, '<p>$1</p><h4>$2</h4><p>');
  finalHtml = finalHtml.replace(/<p>(.*?)###\s*(.*?)<\/p>/g, '<p>$1</p><h3>$2</h3><p>');
  finalHtml = finalHtml.replace(/<p>(.*?)##\s*(.*?)<\/p>/g, '<p>$1</p><h2>$2</h2><p>');
  finalHtml = finalHtml.replace(/<p>(.*?)#\s*(.*?)<\/p>/g, '<p>$1</p><h1>$2</h1><p>');

  // Cleanup empty paragraphs created by safety net
  finalHtml = finalHtml.replace(/<p>\s*<\/p>/g, '');

  return finalHtml;
}

function applyInline(text) {
  if (!text) return '';
  return text
    // Handle links: [text](url)
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank" class="text-primary hover:underline font-medium">$1</a>')
    // Handle triple bold/italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    // Handle bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Handle italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Handle code
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

const generateId = () => Math.random().toString(36).slice(2, 11);

const createNewChat = () => ({
  id: generateId(),
  title: "New Chat",
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function parseStoredChats(json) {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data) || data.length === 0) return [createNewChat()];
    return data;
  } catch (e) {
    return [createNewChat()];
  }
}

let chats = (() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? parseStoredChats(stored) : [createNewChat()];
})();

// Initialize active chat to the first one (most recent)
let activeChatId = chats[0].id;

let uploadedFiles = [];
let isGenerating = false;

// --- DOM Elements ---
const dom = {
  themeHtml: document.documentElement,
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),

  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  desktopSidebar: document.getElementById('desktop-sidebar'),
  mobileSidebarContainer: document.getElementById('mobile-sidebar-container'),
  mobileSidebarBackdrop: document.getElementById('mobile-sidebar-backdrop'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),

  btnNewChatDesktop: document.getElementById('btn-new-chat-desktop'),
  btnNewChatMobile: document.getElementById('btn-new-chat-mobile'),
  chatListDesktop: document.getElementById('chat-list-desktop'),
  chatListMobile: document.getElementById('chat-list-mobile'),

  messagesContainer: document.getElementById('messages-container'),

  filesPreviewContainer: document.getElementById('files-preview-container'),
  btnAttach: document.getElementById('btn-attach'),
  fileInput: document.getElementById('file-input'),
  chatTextarea: document.getElementById('chat-textarea'),
  btnSend: document.getElementById('btn-send'),
};

// --- Initialization ---
function init() {
  initTheme();
  initSidebar();
  initTextarea();
  initFiles();
  initChatLogic();

  renderChatList();
  renderMessages();
  lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

// --- Theme Logic ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'light' || (!savedTheme && !prefersDark)) {
    dom.themeHtml.classList.remove('dark');
    dom.themeIcon.setAttribute('data-lucide', 'moon');
  } else {
    dom.themeHtml.classList.add('dark');
    dom.themeIcon.setAttribute('data-lucide', 'sun');
  }

  dom.btnThemeToggle.addEventListener('click', () => {
    dom.themeHtml.classList.toggle('dark');
    const isDark = dom.themeHtml.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    dom.themeIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons({ name: 'theme-icon' });
  });
}

// --- Sidebar Logic ---
function initSidebar() {
  let sidebarOpen = true;

  dom.btnToggleSidebar.addEventListener('click', () => {
    if (window.innerWidth >= 1024) {
      // Desktop: slide in/out by changing max-width
      if (sidebarOpen) {
        dom.desktopSidebar.style.width = '0';
        dom.desktopSidebar.style.minWidth = '0';
        dom.desktopSidebar.style.opacity = '0';
        dom.desktopSidebar.style.overflow = 'hidden';
      } else {
        dom.desktopSidebar.style.width = '256px';
        dom.desktopSidebar.style.minWidth = '256px';
        dom.desktopSidebar.style.opacity = '1';
        dom.desktopSidebar.style.overflow = '';
      }
      sidebarOpen = !sidebarOpen;
    } else {
      // Mobile: show overlay
      dom.mobileSidebarContainer.classList.remove('hidden');
    }
  });

  const closeMobileSidebar = () => dom.mobileSidebarContainer.classList.add('hidden');
  dom.btnCloseSidebar.addEventListener('click', closeMobileSidebar);
  dom.mobileSidebarBackdrop.addEventListener('click', closeMobileSidebar);

  // Sync Desktop and Mobile sidebar configurations
  const depthDesktop = document.getElementById('select-depth-desktop');
  const depthMobile = document.getElementById('select-depth-mobile');
  const diffDesktop = document.getElementById('toggle-diff-desktop');
  const diffMobile = document.getElementById('toggle-diff-mobile');
  const patientDesktop = document.getElementById('toggle-patient-desktop');
  const patientMobile = document.getElementById('toggle-patient-mobile');

  if (depthDesktop && depthMobile) {
    depthDesktop.addEventListener('change', (e) => { depthMobile.value = e.target.value; });
    depthMobile.addEventListener('change', (e) => { depthDesktop.value = e.target.value; });
  }
  if (diffDesktop && diffMobile) {
    diffDesktop.addEventListener('change', (e) => { diffMobile.checked = e.target.checked; });
    diffMobile.addEventListener('change', (e) => { diffDesktop.checked = e.target.checked; });
  }
  if (patientDesktop && patientMobile) {
    patientDesktop.addEventListener('change', (e) => { patientMobile.checked = e.target.checked; });
    patientMobile.addEventListener('change', (e) => { patientDesktop.checked = e.target.checked; });
  }
}

// --- Input & File Logic ---
function initTextarea() {
  dom.chatTextarea.addEventListener('input', () => {
    dom.chatTextarea.style.height = 'auto';
    dom.chatTextarea.style.height = Math.min(dom.chatTextarea.scrollHeight, 160) + 'px';
    checkInputEmpty();
  });

  dom.chatTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

function checkInputEmpty() {
  const text = dom.chatTextarea.value.trim();
  if (isGenerating || (!text && uploadedFiles.length === 0)) {
    dom.btnSend.disabled = true;
  } else {
    dom.btnSend.disabled = false;
  }
}

function initFiles() {
  dom.btnAttach.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    const newFiles = files.map(f => ({
      id: generateId(),
      name: f.name,
      type: f.type,
      size: f.size,
      file: f
    }));

    uploadedFiles = [...uploadedFiles, ...newFiles];
    dom.fileInput.value = '';
    renderFilesPreview();
    checkInputEmpty();
  });
}

window.removeFile = function (id) {
  uploadedFiles = uploadedFiles.filter(f => f.id !== id);
  renderFilesPreview();
  checkInputEmpty();
};

function renderFilesPreview() {
  dom.filesPreviewContainer.innerHTML = uploadedFiles.map(f => `
    <div class="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">
      <i data-lucide="${f.type.startsWith('image/') ? 'image' : 'file-text'}" class="h-3.5 w-3.5 text-primary"></i>
      <span class="max-w-[120px] truncate">${f.name}</span>
      <button onclick="removeFile('${f.id}')" class="text-muted-foreground hover:text-foreground transition-colors">
        <i data-lucide="x" class="h-3.5 w-3.5"></i>
      </button>
    </div>
  `).join('');
  lucide.createIcons();
}

// --- Chat Core Logic ---
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
}

function getActiveChat() {
  return chats.find(c => c.id === activeChatId) || chats[0];
}

function initChatLogic() {
  dom.btnNewChatDesktop.addEventListener('click', handleNewChat);
  dom.btnNewChatMobile.addEventListener('click', () => {
    handleNewChat();
    dom.mobileSidebarContainer.classList.add('hidden');
  });
  dom.btnSend.addEventListener('click', handleSend);
}

function handleNewChat() {
  const chat = createNewChat();
  chats = [chat, ...chats];
  activeChatId = chat.id;
  saveState();
  renderChatList();
  renderMessages();
}

window.selectChat = function (id) {
  activeChatId = id;
  saveState();
  renderChatList();
  renderMessages();
  dom.mobileSidebarContainer.classList.add('hidden');
}

window.deleteChat = function (e, id) {
  e.stopPropagation();
  chats = chats.filter((c) => c.id !== id);
  if (chats.length === 0) {
    const fresh = createNewChat();
    chats = [fresh];
    activeChatId = fresh.id;
  } else if (id === activeChatId) {
    activeChatId = chats[0].id;
  }
  saveState();
  renderChatList();
  renderMessages();
};

window.startEditChat = function (e, id, currentTitle) {
  e.stopPropagation();
  window._editingChatId = id;
  renderChatList();
};

window.confirmEditChat = function (e, id) {
  e.stopPropagation();
  const input = document.getElementById(`edit-input-${id}`);
  if (input && input.value.trim()) {
    chats = chats.map(c => c.id === id ? { ...c, title: input.value.trim() } : c);
    saveState();
  }
  window._editingChatId = null;
  renderChatList();
};

window.cancelEditChat = function (e) {
  e.stopPropagation();
  window._editingChatId = null;
  renderChatList();
};

// --- Rendering ---
function renderChatList() {
  const renderItem = (chat) => {
    const isActive = chat.id === activeChatId;
    const isEditing = window._editingChatId === chat.id;

    if (isEditing) {
      return `
        <div class="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm bg-accent text-accent-foreground">
          <i data-lucide="message-square" class="h-4 w-4 shrink-0 text-muted-foreground"></i>
          <div class="flex flex-1 items-center gap-1">
            <input id="edit-input-${chat.id}" value="${chat.title}" class="flex-1 bg-transparent text-sm outline-none text-foreground" autofocus onclick="event.stopPropagation()">
            <button onclick="confirmEditChat(event, '${chat.id}')"><i data-lucide="check" class="h-3.5 w-3.5 text-primary"></i></button>
            <button onclick="cancelEditChat(event)"><i data-lucide="x" class="h-3.5 w-3.5 text-muted-foreground"></i></button>
          </div>
        </div>
      `;
    }

    return `
      <div class="group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${isActive ? "bg-accent text-accent-foreground" : "text-sidebar-foreground hover:bg-muted"}" onclick="selectChat('${chat.id}')">
        <i data-lucide="message-square" class="h-4 w-4 shrink-0 text-muted-foreground"></i>
        <span class="flex-1 truncate">${chat.title}</span>
        <div class="hidden group-hover:flex items-center gap-0.5">
          <button onclick="startEditChat(event, '${chat.id}', '${chat.title}')" class="rounded p-1 hover:bg-background/50">
            <i data-lucide="pencil" class="h-3.5 w-3.5 text-muted-foreground"></i>
          </button>
          <button onclick="deleteChat(event, '${chat.id}')" class="rounded p-1 hover:bg-background/50">
            <i data-lucide="trash-2" class="h-3.5 w-3.5 text-destructive"></i>
          </button>
        </div>
      </div>
    `;
  };

  const html = chats.map(renderItem).join('');
  dom.chatListDesktop.innerHTML = html;
  dom.chatListMobile.innerHTML = html;
  lucide.createIcons();
}

function renderMessages() {
  const chat = getActiveChat();

  if (chat.messages.length === 0) {
    dom.messagesContainer.innerHTML = `
      <div class="flex h-full flex-col items-center justify-center text-center px-4">
        <img src="/logo.png" alt="ScanSense AI Logo" class="h-48 w-auto mb-6 object-contain" />
        <h2 class="font-display text-3xl font-semibold text-foreground mb-8">What's on your mind today?</h2>
        <div class="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
          <button onclick="fastPrompt('Analyze my blood test results')" class="rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground hover:bg-muted transition-colors text-left shadow-sm">Analyze my blood test results</button>
          <button onclick="fastPrompt('What does this X-ray show?')" class="rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground hover:bg-muted transition-colors text-left shadow-sm">What does this X-ray show?</button>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const html = `<div class="mx-auto max-w-5xl">` + chat.messages.map(msg => {
    const isUser = msg.role === 'user';
    let filesHtml = '';
    if (msg.files && msg.files.length > 0) {
      filesHtml = `<div class="flex flex-wrap gap-2 mb-2">` + msg.files.map(f => `
        <div class="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          <i data-lucide="${f.type.startsWith('image/') ? 'image' : 'file-text'}" class="h-4 w-4 text-primary"></i>
          <span class="truncate max-w-[150px]">${f.name}</span>
        </div>
      `).join('') + `</div>`;
    }

    const contentHtml = renderMarkdown(msg.content);

    return `
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'} mb-4">
        <div class="flex gap-3 max-w-[92%] ${isUser ? 'flex-row-reverse' : ''}">
          <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-display font-semibold ${isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}">
            ${isUser ? 'U' : 'AI'}
          </div>
          <div class="space-y-2">
            ${filesHtml}
            <div class="rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${isUser ? 'bg-chat-user text-chat-user-foreground rounded-br-md' : 'bg-chat-ai text-chat-ai-foreground rounded-bl-md'}">
              <div class="prose prose-base max-w-none dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-li:my-1 prose-blockquote:my-2">
                ${contentHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('') + `</div>`;

  dom.messagesContainer.innerHTML = html;
  lucide.createIcons();

  // Scroll to bottom
  dom.messagesContainer.scrollTo({ top: dom.messagesContainer.scrollHeight, behavior: 'smooth' });
}

window.fastPrompt = function (prompt) {
  dom.chatTextarea.value = prompt;
  handleSend();
};

// --- Send & API ---
async function handleSend() {
  const content = dom.chatTextarea.value.trim();
  const currentFiles = [...uploadedFiles];

  if (!content && currentFiles.length === 0) return;

  isGenerating = true;
  checkInputEmpty();

  // Basic cleanup
  dom.chatTextarea.value = '';
  dom.chatTextarea.style.height = 'auto';
  uploadedFiles = [];
  renderFilesPreview();

  const chatIdx = chats.findIndex(c => c.id === activeChatId);
  if (chatIdx === -1) return;

  const userMsgId = generateId();
  const userMsg = {
    id: userMsgId,
    role: "user",
    content: content,
    files: currentFiles.map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size })),
    timestamp: new Date().toISOString(),
  };

  const aiMsgId = generateId();
  const aiMsg = {
    id: aiMsgId,
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
  };

  // Update State Locally
  chats[chatIdx].messages.push(userMsg);
  if (chats[chatIdx].messages.length === 1) {
    chats[chatIdx].title = content.slice(0, 40) || "New Chat";
  }
  chats[chatIdx].messages.push(aiMsg);
  saveState();
  renderChatList();
  renderMessages();

  try {
    let uploadedContext = "";
    let uploadedContentType = "";

    // Upload Files First
    if (currentFiles.length > 0) {
      const fileData = currentFiles[0].file;
      if (fileData) {
        const formData = new FormData();
        formData.append("file", fileData);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedContext = uploadData.context;
          uploadedContentType = uploadData.content_type;
        } else {
          try {
            const errResult = await uploadRes.json();
            throw new Error(errResult.detail || "File upload failed");
          } catch (e) { throw new Error(e.message || "File upload failed"); }
        }
      }
    }

    // Read active settings
    const selectDepth = document.getElementById('select-depth-desktop');
    const toggleDiff = document.getElementById('toggle-diff-desktop');
    const togglePatient = document.getElementById('toggle-patient-desktop');

    const analysisDepth = selectDepth ? selectDepth.value : 'Detailed';
    const includeDifferential = toggleDiff ? toggleDiff.checked : true;
    const patientFriendly = togglePatient ? togglePatient.checked : false;

    // Call Chat API with SSE
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        session_id: chats[chatIdx].backendId || null,
        context: uploadedContext || undefined,
        content_type: uploadedContentType || undefined,
        analysis_depth: analysisDepth,
        include_differential: includeDifferential,
        patient_friendly: patientFriendly,
      }),
    });

    if (!chatRes.ok) throw new Error("Failed to get response");
    if (!chatRes.body) throw new Error("No response body");

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining text in the buffer
        if (buffer.trim()) {
          processLine(buffer);
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line (or empty string if ends with \n) in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        processLine(line);
      }
    }


    function processLine(line) {
      const trimmedStart = line.trimStart();
      if (trimmedStart.startsWith("data: ")) {
        const dataIndex = line.indexOf("data: ");
        const data = line.slice(dataIndex + 6);

        if (data.startsWith("SESSION_ID:")) {
          const bId = parseInt(data.split(":")[1]);
          chats[chatIdx].backendId = bId;
          saveState();
          return;
        }

        if (data.trim() === "[DONE]") return;

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
  } catch (error) {
    const msgIdx = chats[chatIdx].messages.findIndex(m => m.id === aiMsgId);
    if (msgIdx !== -1) {
      chats[chatIdx].messages[msgIdx].content = `Error: ${error.message}`;
      saveState();
      renderMessages();
    }
  } finally {
    isGenerating = false;
    checkInputEmpty();
    // Final render to ensure everything is settled
    renderMessages();
  }
}
