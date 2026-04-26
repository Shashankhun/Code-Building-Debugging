from flask import Flask, request, Response, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from agents import planner, coder, reviewer, debugger
from executor import run_code

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

def stream_event(event_type, status, data):
    payload = json.dumps({"status": status, "data": data})
    return f"event: {event_type}\ndata: {payload}\n\n"

@app.route('/api/build', methods=['POST'])
def build():
    data = request.json
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    def generate():
        try:
            # 1. Plan
            yield stream_event("status", "planner", "Planner is creating a plan...")
            plan = planner(prompt)
            yield stream_event("planner_result", "success", plan)

            # 2. Code
            yield stream_event("status", "coder", "Coder is writing the code...")
            code = coder(plan)
            yield stream_event("coder_result", "success", code)

            # Execution Loop
            max_retries = 3
            for i in range(max_retries):
                yield stream_event("status", "executor", f"Running code (Attempt {i+1}/{max_retries})...")
                output, error = run_code(code)

                if not error:
                    yield stream_event("execution_success", "success", {"output": output, "code": code})
                    yield stream_event("status", "done", "Process completed successfully!")
                    return

                # Error occurred
                print(f"--- EXECUTION ERROR ---\n{error}\n--- CODE ---\n{code}\n-----------------------")
                yield stream_event("execution_error", "error", {"error": error, "output": output})
                
                if i < max_retries - 1:
                    yield stream_event("status", "reviewer", "Reviewer is analyzing the issue...")
                    review = reviewer(code)
                    yield stream_event("reviewer_result", "success", review)

                    yield stream_event("status", "debugger", "Debugger is fixing the code...")
                    code = debugger(code, error, review)
                    yield stream_event("debugger_result", "success", code)
                else:
                    yield stream_event("status", "failed", "Maximum retries reached. Could not fix the code.")
                    return

        except Exception as e:
            yield stream_event("status", "error", f"System Error: {str(e)}")

    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
