document.addEventListener('DOMContentLoaded', () => {
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
    
    // Extra features
    const retryCounter = document.getElementById('retry-counter');
    const explainFixBtn = document.getElementById('explain-fix-btn');
    const explainFixContent = document.getElementById('explain-fix-content');
    const explainFixContainer = document.getElementById('explain-fix-container');

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
        terminalDisplay.innerHTML = '> Waiting for execution...';
        terminalDisplay.className = 'terminal-text';
        reviewDisplay.innerHTML = 'No feedback yet.';
        
        lastError = "";
        lastCode = "";
        lastReview = "";
        
        // Switch to Plan tab initially
        document.querySelector('[data-target="plan-tab"]').click();
    }

    function setAgentState(agentId, state, statusText) {
        // Reset all active states
        Object.values(agents).forEach(a => {
            if (a.classList.contains('active')) {
                a.classList.remove('active');
                a.classList.add('success');
            }
        });

        const agent = agents[agentId];
        if (agent) {
            agent.className = `agent-item ${state}`;
            agent.querySelector('.agent-status').textContent = statusText;
        }
    }

    async function handleBuild() {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        buildBtn.disabled = true;
        btnLoader.classList.remove('hidden');
        resetUI();

        try {
            const response = await fetch('http://127.0.0.1:5000/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

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
                    if (line.startsWith('event: ')) {
                        const eventType = line.split('\n')[0].replace('event: ', '');
                        const dataStr = line.split('\n')[1].replace('data: ', '');
                        const data = JSON.parse(dataStr);
                        
                        processEvent(eventType, data);
                    }
                }
            }
        } catch (error) {
            console.error('Error:', error);
            terminalDisplay.textContent = `System Error: ${error.message}`;
            terminalDisplay.classList.add('error');
        } finally {
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
        const { status, data } = payload;
        
        switch (type) {
            case 'status':
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
                planDisplay.innerHTML = marked.parse(data);
                document.querySelector('[data-target="plan-tab"]').click();
                break;

            case 'coder_result':
            case 'debugger_result':
                lastCode = data;
                codeDisplay.textContent = data;
                Prism.highlightElement(codeDisplay);
                document.querySelector('[data-target="code-tab"]').click();
                break;

            case 'execution_success':
                terminalDisplay.textContent = `> Execution successful!\n\nOutput:\n${data.output}`;
                terminalDisplay.className = 'terminal-text';
                break;

            case 'execution_error':
                lastError = data.error;
                terminalDisplay.textContent = `> Execution failed!\n\nError:\n${data.error}\n\nOutput:\n${data.output}`;
                terminalDisplay.className = 'terminal-text error';
                explainFixContainer.classList.remove('hidden');
                break;

            case 'reviewer_result':
                lastReview = data;
                reviewDisplay.innerHTML = marked.parse(data);
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

    buildBtn.addEventListener('click', handleBuild);
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleBuild();
        }
    });
});
