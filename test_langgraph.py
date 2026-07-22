import warnings
warnings.filterwarnings('ignore')

import os
import sys

# Add working directory to sys path so we can import utils
sys.path.insert(0, os.path.abspath('.'))

from backend.utils.ai_assistant import is_medical_content, stream_chat_response

print("Testing is_medical_content (pdf text):")
is_med = is_medical_content("The patient presents with severe migraines and nausea. MRI scan scheduled.", "pdf")
print("Expected YES, got -> Yes/True?", is_med)

is_med = is_medical_content("This is a guide on how to bake chocolate chip cookies.", "pdf")
print("Expected NO, got -> Yes/True?", is_med)

print("\nTesting stream_chat_response:")
history = [
    {"role": "user", "content": "What is the capital of France?"},
    {"role": "assistant", "content": "I am a medical assistant and cannot answer that."}
]
print("Bot response stream:")
stream = stream_chat_response(history, None, None, "Can you explain what Ibuprofen is used for?")
for chunk in stream:
    print(chunk, end="", flush=True)

print("\n\nDone testing.")
