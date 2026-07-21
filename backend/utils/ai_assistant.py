from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from ..config.settings import GROQ_API_KEY, MODEL_NAME, SYSTEM_PROMPT

def get_llm(temperature=0.0):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not found in environment variables.")
    
    # Hide slow reasoning trace for Qwen and GPT-OSS models to speed up output
    kwargs = {}
    if "qwen" in MODEL_NAME.lower() or "gpt-oss" in MODEL_NAME.lower():
        kwargs["reasoning_format"] = "hidden"
        
    return ChatGroq(model=MODEL_NAME, api_key=GROQ_API_KEY, temperature=temperature, **kwargs)

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
    llm = get_llm(temperature=0.7)
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


def stream_chat_response(chat_history, context, content_type, user_text, long_term_memories=None):
    """
    Generator that streams the response from the LangGraph execution.
    Incorporates both short-term (session history) and long-term (past summaries) memory.
    """
    messages = [SystemMessage(content=SYSTEM_PROMPT)]

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
        for event in chatbot_app.stream(state, stream_mode="messages"):
            chunk, metadata = event
            if chunk.content and isinstance(chunk.content, str):
                yield chunk.content
    except Exception as e:
        yield f"\nAPI Error: {e}"
