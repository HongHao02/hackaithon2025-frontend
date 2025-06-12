const vscode = acquireVsCodeApi();

const messageInput = document.getElementById('messageInput');
const generateButton = document.getElementById('generateButton');
const commitDropdown = document.getElementById('commitDropdown');
const commitButton = document.getElementById('commitButton');
const codeReviewButton = document.getElementById('codeReviewButton');

console.log('Webview initialized. Textarea editable:', !messageInput.disabled && !messageInput.readOnly);

generateButton.addEventListener('click', () => {
    console.log('Generate Message button clicked');
    vscode.postMessage({ type: 'generateMessage' });
});

commitDropdown.addEventListener('change', (event) => {
    console.log('Commit dropdown changed:', event.target.value);
    commitButton.disabled = !event.target.value;
});

commitButton.addEventListener('click', () => {
    const action = commitDropdown.value;
    const message = messageInput.value.trim();
    console.log('Commit button clicked with action:', action, 'and message:', message);
    if (action && message) {
        vscode.postMessage({ type: 'commitAction', action, message });
    } else if (!message) {
        alert('Please enter a commit message.');
    }
});

codeReviewButton.addEventListener('click', () => {
    console.log('Code Review button clicked');
    vscode.postMessage({ type: 'getCodeReview' });
});

window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('Received message:', message);
    switch (message.type) {
        case 'updateInput':
            messageInput.value = message.value;
            messageInput.disabled = false;
            messageInput.readOnly = false;
            console.log('Textarea updated with value:', message.value);
            break;
        case 'startLoading':
            generateButton.disabled = true;
            generateButton.classList.add('loading');
            generateButton.textContent = 'Generating...';
            console.log('Started loading state');
            break;
        case 'stopLoading':
            generateButton.disabled = false;
            generateButton.classList.remove('loading');
            generateButton.textContent = 'Generate Message';
            console.log('Stopped loading state');
            break;
        case 'startCommitLoading':
            commitButton.disabled = true;
            commitButton.classList.add('loading');
            commitButton.textContent = 'Committing...';
            console.log('Started commit loading state');
            break;
        case 'stopCommitLoading':
            commitButton.disabled = !commitDropdown.value;
            commitButton.classList.remove('loading');
            commitButton.textContent = 'Execute Commit';
            console.log('Stopped commit loading state');
            break;
    }
});