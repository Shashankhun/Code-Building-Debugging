function initApp() {
    console.log('Mini GPT Pilot frontend initialized');
    const promptInput = document.getElementById('prompt-input');
    const buildBtn = document.getElementById('build-btn');
    const btnLoader = document.getElementById('btn-loader');
    
    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Displays
    const codeDisplay = document.getElementById('code-display');
    const planDisplay = document.getElementById('plan-display');
    const terminalDisplay = document.getElementById('terminal-display');
    const reviewDisplay = document.getElementById('review-display');
    const debuggerDisplay = document.getElementById('debugger-display');
    const problemDisplay = document.getElementById('problem-display');
    
    // Extra features
    const retryCounter = document.getElementById('retry-counter');
    const explainFixBtn = document.getElementById('explain-fix-btn');
    const explainFixContent = document.getElementById('explain-fix-content');
    const explainFixContainer = document.getElementById('explain-fix-container');
    const localFileWarning = document.getElementById('local-file-warning');

    // Agents
    const agents = {
        planner: document.getElementById('agent-planner'),
        coder: document.getElementById('agent-coder'),
        executor: document.getElementById('agent-executor'),
        reviewer: document.getElementById('agent-reviewer'),
        debugger: document.getElementById('agent-debugger')
    };
    
    let retryCount = 0;
    let lastError = "";
    let lastCode = "";
    let lastReview = "";
    let lastDebuggerCode = "";
    let eventLog = [];

    // Local file warning
    if (window.location.protocol === 'file:') {
        localFileWarning.classList.remove('hidden');
    }

    // Tab switching logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    function resetUI() {
        retryCount = 0;
        retryCounter.textContent = `Retries: 0/3`;
        retryCounter.classList.remove('hidden');
        explainFixContainer.classList.add('hidden');
        explainFixContent.classList.add('hidden');
        
        Object.values(agents).forEach(agent => {
            agent.className = 'agent-item';
            agent.querySelector('.agent-status').textContent = 'Waiting...';
        });

        codeDisplay.textContent = '# Code will appear here...';
        Prism.highlightElement(codeDisplay);
        planDisplay.innerHTML = 'No plan generated yet.';
        problemDisplay.innerHTML = 'No problems detected yet.';
        terminalDisplay.innerHTML = '> Waiting for execution...';
        terminalDisplay.className = 'terminal-text';
        reviewDisplay.innerHTML = 'No feedback yet.';
        debuggerDisplay.textContent = 'Debugger output will appear here...';
        Prism.highlightElement(debuggerDisplay);
        
        lastError = "";
        lastCode = "";
        lastReview = "";
        lastDebuggerCode = "";
        
        // Switch to Plan tab initially
        document.querySelector('[data-target="plan-tab"]').click();
    }

    function setAgentState(agentId, state, statusText) {
        const agent = agents[agentId];
        if (agent) {
            agent.className = `agent-item ${state}`;
            agent.querySelector('.agent-status').textContent = statusText;
        }
    }

    async function handleBuild() {
        console.log('handleBuild function called');
        const prompt = promptInput.value.trim();
        console.log('Prompt value:', prompt);
        if (!prompt) {
            console.log('Prompt is empty, returning');
            return;
        }

        console.log('Disabling button and showing loader');
        buildBtn.disabled = true;
        btnLoader.classList.remove('hidden');
        resetUI();
        terminalDisplay.textContent = '> Starting build...';
        terminalDisplay.className = 'terminal-text';

        try {
            console.log('Making fetch request to /api/build');
            let response;
            try {
                response = await fetch('http://127.0.0.1:5000/api/build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });
            } catch (fetchError) {
                console.error('Fetch failed:', fetchError);
                throw fetchError;
            }
            console.log('Fetch response status:', response.status);
            console.log('Response content-type:', response.headers.get('content-type'));
            console.log('Response headers:', [...response.headers.entries()]);
            console.log('Response body available:', !!response.body);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log('Starting to read response body');

            if (!response.body) throw new Error('ReadableStream not yet supported in this browser.');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                
                // Keep the last partial chunk in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    console.log('Processing SSE line:', trimmedLine);

                    if (trimmedLine.startsWith('event: ')) {
                        const rawLines = trimmedLine.split(/\r?\n/);
                        const eventType = rawLines[0].replace(/^event:\s*/, '').trim();
                        const dataLine = rawLines.find(l => l.startsWith('data:'));
                        if (!dataLine) continue;
                        const dataStr = dataLine.replace(/^data:\s*/, '').trim();
                        try {
                            const data = JSON.parse(dataStr);
                            console.log('Processing event:', eventType, data);
                            processEvent(eventType, data);
                        } catch (err) {
                            console.error('Failed to parse SSE event data:', dataStr, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in handleBuild:', error);
            terminalDisplay.textContent = `System Error: ${error.message}`;
            terminalDisplay.classList.add('error');
        } finally {
            console.log('Re-enabling button');
            buildBtn.disabled = false;
            btnLoader.classList.add('hidden');
            Object.values(agents).forEach(a => {
                if(a.classList.contains('active')) {
                    a.classList.remove('active');
                }
            });
        }
    }

    function processEvent(type, payload) {
        console.log('processEvent called with type:', type, 'payload:', payload);
        eventLog.push({ type, payload, timestamp: Date.now() });
        const { status, data } = payload;
        
        switch (type) {
            case 'status':
                console.log('Processing status event:', status, data);
                if (status === 'error') {
                    terminalDisplay.textContent = `> Backend System Error:\n\n${data}`;
                    terminalDisplay.className = 'terminal-text error';
                    document.querySelector('[data-target="terminal-tab"]').click();
                    Object.values(agents).forEach(a => {
                        if (a.classList.contains('active')) {
                            a.className = 'agent-item error';
                            a.querySelector('.agent-status').textContent = 'Failed';
                        }
                    });
                }
                else if (status === 'planner') setAgentState('planner', 'active', data);
                else if (status === 'coder') setAgentState('coder', 'active', data);
                else if (status === 'executor') {
                    setAgentState('executor', 'active', data);
                    document.querySelector('[data-target="terminal-tab"]').click();
                    if(data.includes('Attempt')) {
                        const match = data.match(/Attempt (\d+)/);
                        if (match && match[1] > 1) {
                            retryCount++;
                            retryCounter.textContent = `Retries: ${retryCount}/3`;
                        }
                    }
                }
                else if (status === 'reviewer') setAgentState('reviewer', 'active', data);
                else if (status === 'debugger') setAgentState('debugger', 'active', data);
                else if (status === 'done') {
                    setAgentState('executor', 'success', 'Success!');
                }
                else if (status === 'failed') {
                    setAgentState('debugger', 'error', 'Failed');
                    setAgentState('executor', 'error', 'Failed');
                }
                break;

            case 'planner_result':
                console.log('Processing planner_result');
                planDisplay.innerHTML = marked.parse(data);
                problemDisplay.innerHTML = 'No problems detected yet.';
                document.querySelector('[data-target="plan-tab"]').click();
                break;

            case 'coder_result':
                console.log('Processing coder_result');
                lastCode = data;
                codeDisplay.textContent = data;
                Prism.highlightElement(codeDisplay);
                document.querySelector('[data-target="code-tab"]').click();
                break;

            case 'debugger_result':
                console.log('Processing debugger_result');
                lastDebuggerCode = data;
                lastCode = data;
                codeDisplay.textContent = data;
                debuggerDisplay.textContent = data;
                Prism.highlightElement(codeDisplay);
                Prism.highlightElement(debuggerDisplay);
                document.querySelector('[data-target="debugger-tab"]').click();
                break;

            case 'execution_success':
                console.log('Processing execution_success');
                terminalDisplay.textContent = `> Execution successful!\n\nOutput:\n${data.output}`;
                terminalDisplay.className = 'terminal-text';
                break;

            case 'execution_error':
                console.log('Processing execution_error');
                lastError = data.error;
                terminalDisplay.textContent = `> Execution failed!\n\nError:\n${data.error}\n\nOutput:\n${data.output}`;
                terminalDisplay.className = 'terminal-text error';
                explainFixContainer.classList.remove('hidden');
                document.querySelector('[data-target="terminal-tab"]').click();

                const errorSummary = data.error.split('\n')[0] || 'Unknown execution error.';
                problemDisplay.innerHTML = marked.parse(`### Problem detected\n\n\`\`\`\n${errorSummary}\n\n\`\`\``);
                break;

            case 'reviewer_result':
                console.log('Processing reviewer_result');
                lastReview = data;
                reviewDisplay.innerHTML = marked.parse(data);
                if (!lastError) {
                    problemDisplay.innerHTML = marked.parse(`### Reviewer findings\n\n${data}`);
                }
                document.querySelector('[data-target="review-tab"]').click();
                break;
        }
    }

    // Explain Fix Feature (Bonus)
    explainFixBtn.addEventListener('click', async () => {
        if (!lastError || !lastCode) return;
        
        explainFixBtn.disabled = true;
        explainFixBtn.innerHTML = 'Analyzing <span class="loader"></span>';
        explainFixContent.classList.remove('hidden');
        explainFixContent.innerHTML = '<p>Analyzing the fix based on the previous error...</p>';

        try {
            // We'll call a new quick endpoint just for explanation, or just use Gemini client side if we had the key, but it's backend.
            // Since we don't have a specific endpoint, we can mock this or create a simple explanation locally.
            // For a real app, you'd add an /api/explain endpoint. Here we'll generate a simple static analysis.
            setTimeout(() => {
                const explanation = `
### Error Analysis
The execution encountered the following error:
\`\`\`
${lastError.split('\n').pop() || lastError}
\`\`\`

### The Fix
The Debugger Agent analyzed the reviewer's feedback and rewrote the code to handle the specific exception or syntax error. It likely added try-except blocks, corrected variable scopes, or fixed imported module errors.
                `;
                explainFixContent.innerHTML = marked.parse(explanation);
                explainFixBtn.innerHTML = '✨ Explain Fix';
                explainFixBtn.disabled = false;
            }, 1000);

        } catch(e) {
            explainFixContent.innerHTML = '<p>Error generating explanation.</p>';
            explainFixBtn.innerHTML = '✨ Explain Fix';
            explainFixBtn.disabled = false;
        }
    });

    buildBtn.addEventListener('click', () => {
        console.log('Build button clicked');
        handleBuild();
    });
    console.log('Event listener attached to build button');
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleBuild();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
