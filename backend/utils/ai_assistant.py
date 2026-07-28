from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_tavily import TavilySearch
from ..config.settings import GROQ_API_KEY, TAVILY_API_KEY, MODEL_NAME, SYSTEM_PROMPT

def clean_tavily_content(text: str) -> str:
    if not text:
        return ""
    # Normalize multiple spaces and newlines
    cleaned = " ".join(text.split())
    # Limit length to 220 characters to ensure clean, neat presentation
    if len(cleaned) > 220:
        cleaned = cleaned[:217] + "..."
    return cleaned

def extract_diagnoses_from_text(text: str) -> list:
    import re
    diagnoses = []
    lines = text.split('\n')
    in_diagnosis_section = False
    
    for line in lines:
        cleaned_line = line.strip()
        # Detect entering the diagnosis block (handles bullets, headers, etc. containing Diagnosis/Dg)
        if re.search(r'(?:Diagnosis|Diagnoses|Dg)', cleaned_line, re.IGNORECASE):
            in_diagnosis_section = True
            continue
        # Detect leaving the diagnosis block (next section header or list starts)
        if in_diagnosis_section and (cleaned_line.startswith('##') or 'prescription' in cleaned_line.lower() or 'medication' in cleaned_line.lower()):
            in_diagnosis_section = False
            
        if in_diagnosis_section:
            # Matches formats like:
            # - **Pityriasis versicolor**: description
            # • Tinea Corporis [High]: description
            # - **Tinea Corporis** [Moderate Confidence]: description
            match = re.search(r'(?:[-*•]\s*)?(?:\*\*)?([A-Za-z0-9\s\-]+?)(?:\s*\[[A-Za-z\s]+\])?(?:\*\*)?\s*:', cleaned_line)
            if match:
                term = match.group(1).strip()
                # Exclude boilerplate words that might have colons
                if term.lower() not in ['name', 'age', 'clinic', 'doctor', 'patient details', 'diagnosis', 'diagnoses', 'dg']:
                    diagnoses.append(term)
    return diagnoses

def run_tavily_search(query: str) -> str:
    """Executes a search using TavilySearch and formats results into a markdown string."""
    if not TAVILY_API_KEY:
        return ""
    try:
        # Initialize new non-deprecated TavilySearch tool - reads TAVILY_API_KEY and include_domains natively
        search_tool = TavilySearch(
            max_results=3,
            api_key=TAVILY_API_KEY,
            include_domains=["ncbi.nlm.nih.gov", "webmd.com", "mayoclinic.org"]
        )
        results = search_tool.invoke({"query": query})
        
        if not results:
            return ""
            
        search_md = "\n\n## 📚 Relevant Medical Literature & Studies\n"
        for idx, res in enumerate(results, 1):
            content = clean_tavily_content(res.get("content", ""))
            url = res.get("url", "")
            
            # Extract domain to show source credibility
            from urllib.parse import urlparse
            domain = urlparse(url).netloc
            title = f"Clinical Study Reference {idx} ({domain})"
            
            search_md += f"> \U0001f517 **[{title}]({url})**\n"
            search_md += f"> * **Key Finding:** {content}\n"
        return search_md.strip()

    except Exception as e:
        print(f"Tavily Search Error: {e}")
        return ""

def get_llm(temperature=0.2):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not found in environment variables.")
    
    # Hide slow reasoning trace for Qwen and GPT-OSS models to speed up output
    kwargs = {}
    if "qwen" in MODEL_NAME.lower() or "gpt-oss" in MODEL_NAME.lower():
        kwargs["reasoning_format"] = "hidden"
        
    return ChatGroq(model=MODEL_NAME, api_key=GROQ_API_KEY, temperature=temperature, max_tokens=4096, **kwargs)

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

# LangGraph State
class ChatState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    context: str
    content_type: str

def call_model_node(state: ChatState):
    messages = list(state["messages"])
    llm = get_llm(temperature=0.2)
    response = llm.invoke(messages)
    return {"messages": [response]}

# Build the LangGraph workflow
workflow = StateGraph(ChatState)
workflow.add_node("call_model", call_model_node)
workflow.add_edge(START, "call_model")
workflow.add_edge("call_model", END)
chatbot_app = workflow.compile()


def summarize_session(chat_history: list) -> str:
    """
    Uses the LLM to generate a concise memory summary of a past session.
    Called when a session has enough content to be worth summarizing.
    """
    if not chat_history or len(chat_history) < 2:
        return ""
    
    conversation_text = ""
    for msg in chat_history:
        role = "User" if msg["role"] == "user" else "Assistant"
        # Truncate very long messages (e.g. base64 images stored in content)
        content = msg["content"]
        if isinstance(content, str) and len(content) > 500:
            content = content[:500] + "... [truncated]"
        conversation_text += f"{role}: {content}\n"

    llm = get_llm(temperature=0.0)
    prompt = (
        "Summarize the following medical conversation in 3-5 sentences. "
        "Focus on: the medical topic discussed, key findings, patient concerns, "
        "and any recommendations made. Be concise.\n\n"
        f"Conversation:\n{conversation_text}"
    )
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return response.content.strip()
    except Exception as e:
        print(f"Summarization Error: {e}")
        return ""


def stream_chat_response(chat_history, context, content_type, user_text, long_term_memories=None,
                         analysis_depth="Detailed", include_differential=True, patient_friendly=False):
    """
    Generator that streams the response from the LangGraph execution.
    Incorporates both short-term (session history) and long-term (past summaries) memory.
    """
    # Build dynamic prompt modifications
    dynamic_instructions = "\n\nCRITICAL ANALYSIS CONFIGURATION:"
    
    # 1. Depth Configuration
    if analysis_depth == "Basic":
        dynamic_instructions += "\n- Provide a very brief, high-level analysis of under 100 words. Focus strictly on the primary issue."
    elif analysis_depth == "Comprehensive":
        dynamic_instructions += "\n- Provide an extremely thorough, exhaustive clinical report. Detail all abnormalities, technical values, and implications."
    else: # Detailed
        dynamic_instructions += "\n- Provide a standard detailed analysis (findings, assessment, and recommendations)."

    # 2. Differential Configuration
    if include_differential:
        dynamic_instructions += (
            "\n- You MUST include a section titled '## Differential Diagnoses' listing 2-3 potential alternative diagnoses "
            "with confidence levels (e.g., [High/Moderate/Low]) and short justifications."
        )
    else:
        dynamic_instructions += "\n- Do NOT include any differential or alternative diagnoses."

    # 3. Patient Friendly Configuration
    if patient_friendly:
        dynamic_instructions += (
            "\n- You MUST append a concluding section titled '## Patient-Friendly Summary'. "
            "Translate all complex medical terminology, diagnoses, and findings into simple, reassuring, jargon-free explanations (max 100 words)."
        )

    # 4. Token limit safety guardrail
    dynamic_instructions += "\n- Keep your final markdown analysis structured, clinical, and concise (under 600 words total) to prevent exceeding the model's output limit."

    current_system_prompt = SYSTEM_PROMPT + dynamic_instructions
    messages = [SystemMessage(content=current_system_prompt)]

    # --- LONG-TERM MEMORY ---
    # Inject summaries of past relevant sessions at the top
    if long_term_memories:
        memory_text = "Here is a summary of relevant past conversations with this user:\n\n"
        for mem in long_term_memories:
            title = mem.get("title", "Previous Chat")
            summary = mem.get("summary", "")
            memory_text += f"[{title}]: {summary}\n\n"
        memory_text += "Use this as background context. Do not repeat it unless asked."
        messages.append(SystemMessage(content=memory_text))

    # --- DOCUMENT CONTEXT (PDF) ---
    if content_type == "pdf" and context:
        messages.append(SystemMessage(content=f"Use this document context to answer:\n\n{context}"))

    # --- SHORT-TERM MEMORY (current session history) ---
    # Add full conversation history except the latest message (added below)
    for msg in chat_history[:-1]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))

    # --- CURRENT MESSAGE ---
    # Only attach image on the very first exchange (no prior AI replies yet)
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

    state = {
        "messages": messages,
        "context": context or "",
        "content_type": content_type or ""
    }

    try:
        full_response = ""
        for event in chatbot_app.stream(state, stream_mode="messages"):
            chunk, metadata = event
            if chunk.content and isinstance(chunk.content, str):
                full_response += chunk.content
                yield chunk.content
        
        # Perform Tavily web search if Comprehensive mode and key is available
        if analysis_depth == "Comprehensive" and TAVILY_API_KEY:
            # Strip any trailing blank lines/bullets from AI response
            if full_response.strip().endswith("-") or full_response.strip().endswith("*"):
                yield "\n"
            else:
                yield "\n\n"
            yield "\n🔍 *Fetching live medical literature resources...*\n"
            
            # Extract diagnoses dynamically from full_response using our new robust parser
            diagnoses = extract_diagnoses_from_text(full_response)
            
            if diagnoses:
                search_query = f"clinical guidelines research {' '.join(diagnoses[:2])}"
            else:
                search_query = f"medical study radiology diagnosis {user_text[:50]}"
                
            search_md = run_tavily_search(search_query)
            if search_md:
                yield search_md
            else:
                yield "\n*(No matching medical literature found)*\n"
                
    except Exception as e:
        yield f"\nAPI Error: {e}"
