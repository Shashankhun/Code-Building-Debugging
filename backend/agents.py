import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from google import genai
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
api_key = os.getenv("GEMINI_API_KEY")

client = None
if api_key:
    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        print(f"Gemini client initialization failed: {e}")
else:
    print("No Gemini API key found in .env.")

MODEL_NAME = 'gemini-flash-latest'

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() in ("1", "true", "yes") or client is None
if MOCK_MODE:
    print("Mock mode is enabled. The app will use local fallback responses.")

def extract_code(text):
    pattern = r'```python\n(.*?)```'
    matches = re.findall(pattern, text, re.DOTALL)
    if matches: return matches[0].strip()
    pattern2 = r'```\n(.*?)```'
    matches2 = re.findall(pattern2, text, re.DOTALL)
    if matches2: return matches2[0].strip()
    return text.strip()

def run_model(content: str, system_instruction: str) -> str | None:
    if MOCK_MODE or client is None:
        return None
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                client.models.generate_content,
                model=MODEL_NAME,
                contents=content,
                config={'system_instruction': system_instruction}
            )
            response = future.result(timeout=12)
        return response.text
    except FuturesTimeoutError:
        print("Gemini model call timed out.")
        return None
    except Exception as e:
        print(f"Gemini model call failed: {e}")
        return None


def planner(prompt: str) -> str:
    print("Planner Agent running...")
    if MOCK_MODE:
        time.sleep(2)
        return f"### Mock Plan\n\nI will break down the request: `{prompt}`\n\n1. Initialize a list of numbers.\n2. Attempt to calculate the average by dividing the sum by the length.\n3. Wait, I will intentionally make a mistake to trigger the Debugger agent!\n\n*(Note: This is a Mock Response since the API key quota was 0)*"
    
    system_instruction = "You are a senior software architect. Break down the user's coding request into a clear, step-by-step implementation plan. Do not write the code, just the plan. Ensure the plan does not involve interactive user input."
    response_text = run_model(
        content=f"User request: {prompt}\n\nProvide the step-by-step plan:",
        system_instruction=system_instruction
    )
    if response_text is None:
        return f"### Mock Plan\n\nI will break down the request: `{prompt}`\n\n1. Initialize a list of numbers.\n2. Attempt to calculate the average by dividing the sum by the length.\n3. Wait, I will intentionally make a mistake to trigger the Debugger agent!\n\n*(Note: Returning mock plan because the Gemini API is unavailable.)*"
    return response_text

def coder(plan: str) -> str:
    print("Coder Agent running...")
    if MOCK_MODE:
        time.sleep(2)
        # Intentional bug: dividing by zero
        return "numbers = []\n\n# Intentional bug: length of empty array is 0!\naverage = sum(numbers) / len(numbers)\nprint('Average is:', average)"
    
    system_instruction = "You are an expert Python developer. Write the complete, runnable Python code based on the provided plan. Only output the python code inside a ```python block. Do not use `input()` or any interactive prompts as the code runs headlessly."
    response_text = run_model(
        content=f"Plan:\n{plan}\n\nWrite the code:",
        system_instruction=system_instruction
    )
    if response_text is None:
        return "numbers = []\n\n# Intentional bug: length of empty array is 0!\naverage = sum(numbers) / len(numbers)\nprint('Average is:', average)"
    return extract_code(response_text)

def reviewer(code: str) -> str:
    print("Reviewer Agent running...")
    if MOCK_MODE:
        time.sleep(2)
        return "### Code Review\n\n**CRITICAL BUG:**\nYou are dividing by `len(numbers)`. If the array is empty, this will cause a `ZeroDivisionError`.\n\n**Recommendation:**\nAdd a check to ensure the array is not empty before dividing."
    
    system_instruction = "You are a strict code reviewer. Analyze the provided Python code for potential bugs, edge cases, and improvements. Be concise."
    response_text = run_model(
        content=f"Code:\n{code}\n\nReview this code:",
        system_instruction=system_instruction
    )
    if response_text is None:
        return "### Code Review\n\n**CRITICAL BUG:**\nYou are dividing by `len(numbers)`. If the array is empty, this will cause a `ZeroDivisionError`.\n\n**Recommendation:**\nAdd a check to ensure the array is not empty before dividing."
    return response_text

def debugger(code: str, error: str, review: str = "") -> str:
    print("Debugger Agent running...")
    if MOCK_MODE:
        time.sleep(2)
        return "numbers = []\n\nif len(numbers) > 0:\n    average = sum(numbers) / len(numbers)\n    print('Average is:', average)\nelse:\n    print('Array is empty, cannot calculate average.')"
    
    system_instruction = "You are a debugging expert. You are provided with Python code that failed to run, the error message, and optionally a reviewer's feedback. Fix the code. Only output the full fixed python code inside a ```python block. Ensure the code does not use `input()` or block for interaction."
    prompt = f"Failed Code:\n{code}\n\nExecution Error:\n{error}\n"
    if review: prompt += f"\nReviewer Feedback:\n{review}\n"
    prompt += "\nProvide the fixed code:"

    response_text = run_model(
        content=prompt,
        system_instruction=system_instruction
    )
    if response_text is None:
        return "numbers = []\n\nif len(numbers) > 0:\n    average = sum(numbers) / len(numbers)\n    print('Average is:', average)\nelse:\n    print('Array is empty, cannot calculate average.')"
    return extract_code(response_text)
