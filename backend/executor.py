import subprocess
import tempfile
import os

def run_code(code: str) -> tuple[str, str]:
    """
    Executes Python code in a temporary file and returns (stdout, stderr).
    Returns (output, "") on success, or ("", error) on failure.
    """
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        # Run the code with a timeout
        import sys
        result = subprocess.run(
            [sys.executable, temp_path],
            capture_output=True,
            text=True,
            timeout=10, # 10 seconds timeout
            stdin=subprocess.DEVNULL
        )
        
        if result.returncode == 0:
            return result.stdout.strip(), ""
        else:
            return result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return "", "Execution timed out after 10 seconds."
    except Exception as e:
        return "", f"Execution error: {str(e)}"
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
