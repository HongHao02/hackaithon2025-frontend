const vscode = acquireVsCodeApi();

const messageInput = document.getElementById('messageInput');
const generateButton = document.getElementById('generateButton');
const loader = document.getElementById('loader');
const commitDropdown = document.getElementById('commitDropdown');
const codeReviewButton = document.getElementById('codeReviewButton');
const modelDropdownGenerate = document.getElementById('modelDropdownGenerate');
const modelDropdownReview = document.getElementById('modelDropdownReview');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const reviewDialog = document.getElementById('reviewDialog');
const reviewContent = document.getElementById('reviewContent');
const closeDialogButton = document.getElementById('closeDialog');

console.log('Webview initialized. Textarea editable:', !messageInput.disabled && !messageInput.readOnly);

// Initialize active tab on load
function initializeTabs() {
    tabButtons.forEach(button => {
        const tabId = button.getAttribute('data-tab');
        if (tabId === 'generate-commit') {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    tabContents.forEach(content => {
        content.style.display = content.id === 'generate-commit' ? 'block' : 'none';
    });
    console.log('Initialized tab: generate-commit');
}

// Call initialization on load
window.addEventListener('load', () => {
    initializeTabs();
    console.log('Fetching OpenAI models');
    vscode.postMessage({ type: 'fetchModels' });
});

// Synchronize model dropdowns
[modelDropdownGenerate, modelDropdownReview].forEach(dropdown => {
    dropdown.addEventListener('change', (event) => {
        const selectedModel = event.target.value;
        console.log('Model selected:', selectedModel);
        modelDropdownGenerate.value = selectedModel;
        modelDropdownReview.value = selectedModel;
    });
});

// Tab switching
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => {
            content.style.display = content.id === tabId ? 'block' : 'none';
        });
        console.log('Switched to tab:', tabId);
    });
});

// Generate Message
generateButton.addEventListener('click', () => {
    console.log('Generate Message button clicked');
    vscode.postMessage({ type: 'generateMessage', model: modelDropdownGenerate.value });
});

// SCM Action with Confirmation
commitDropdown.addEventListener('change', async (event) => {
    const action = event.target.value;
    const message = messageInput.value.trim();
    console.log('Commit dropdown changed:', action);

    if (!action || !message) {
        if (action) {
            vscode.postMessage({ type: 'showErrorMessage', value: 'Please enter a commit message.' });
        }
        commitDropdown.value = ''; // Reset dropdown
        return;
    }

    // Show confirmation dialog
    const confirmed = await vscode.postMessage({
        type: 'requestConfirmation',
        value: `Are you sure you want to perform '${action}' with message: "${message}"?`
    });

    window.addEventListener('message', function handleConfirmation(event) {
        const msg = event.data;
        if (msg.type === 'confirmationResponse' && msg.confirmed) {
            console.log('Confirmed action:', action);
            vscode.postMessage({ type: 'commitAction', action, message });
            window.removeEventListener('message', handleConfirmation);
        } else if (msg.type === 'confirmationResponse') {
            console.log('Action cancelled');
            commitDropdown.value = ''; // Reset dropdown
            window.removeEventListener('message', handleConfirmation);
        }
    }, { once: true });
});

// Message Input
messageInput.addEventListener('input', () => {
    console.log('Textarea input changed.');
});

// Code Review
codeReviewButton.addEventListener('click', () => {
    console.log('Code Review button clicked');
    vscode.postMessage({ type: 'getCodeReview', model: modelDropdownReview.value });
});

// Close Dialog
closeDialogButton.addEventListener('click', () => {
    reviewDialog.style.display = 'none';
    console.log('Closed review dialog');
});

// Message Handler
window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('Received message:', message);
    switch (message.type) {
        case 'updateInput':
            messageInput.value = message.value;
            messageInput.disabled = false;
            messageInput.readOnly = false;
            console.log('Textarea updated with value:', message.value, 'Editable:', !messageInput.disabled);
            break;
        case 'startLoading':
            loader.style.display = 'flex';
            commitDropdown.disabled = true;
            modelDropdownGenerate.disabled = true;
            modelDropdownReview.disabled = true;

            console.log('Started loading state');
            break;
        case 'stopLoading':
            loader.style.display = 'none';
            commitDropdown.disabled = false;
            modelDropdownGenerate.disabled = false;
            modelDropdownReview.disabled = false;

            console.log('Stopped loading state');
            break;
        case 'startCommitLoading':
            loader.style.display = 'flex';
            commitDropdown.disabled = true;
            modelDropdownGenerate.disabled = true;
            modelDropdownReview.disabled = true;
            commitDropdown.classList.add('loading');
            console.log('Started commit loading state');
            break;
        case 'stopCommitLoading':
            loader.style.display = 'none';
            commitDropdown.disabled = false;
            modelDropdownGenerate.disabled = false;
            modelDropdownReview.disabled = false;
            commitDropdown.classList.remove('loading');
            commitDropdown.value = ''; // Reset dropdown after action
            console.log('Stopped commit loading state');
            break;
        case 'startModelLoading':
            loader.style.display = 'flex';
            modelDropdownGenerate.disabled = true;
            modelDropdownReview.disabled = true;
            console.log('Started model loading state');
            break;
        case 'stopModelLoading':
            loader.style.display = 'none';
            modelDropdownGenerate.disabled = false;
            modelDropdownReview.disabled = false;
            console.log('Stopped model loading state');
            break;
        case 'updateModelDropdown':
            [modelDropdownGenerate, modelDropdownReview].forEach(dropdown => {
                dropdown.innerHTML = '<option value="">Select OpenAI Model</option>';
                message.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    dropdown.appendChild(option);
                });
            });
            console.log('Updated model dropdowns with:', message.models);
            break;
        case 'showCodeReview':
            reviewContent.textContent = message.review;
            reviewDialog.style.display = 'flex';
            console.log('Showing code review dialog with:', message.review);
            break;
        case 'showErrorMessage':
            alert(message.value);
            console.log('Showing error message:', message.value);
            break;
        case 'requestConfirmation':
            vscode.postMessage({
                type: 'confirmationResponse',
                confirmed: confirm(message.value)
            });
            break;
        case 'generateMessageStarted':
            // Disable generate commit message button
            generateButton.disabled = true;
            generateButton.classList.add('processing');
            generateButton.textContent = 'Processing... Please wait';

            console.log('Started message generation loading state');
            break;
        case 'generateMessageCompleted':
            // Reset generate commit message button
            generateButton.disabled = false;
            generateButton.classList.remove('processing');
            generateButton.textContent = 'Generate Message';
            
            console.log('Completed message generation');
            break;
        case 'codeReviewStarted':
            // Disable code review button
            codeReviewButton.disabled = true;
            codeReviewButton.classList.add('processing');
            codeReviewButton.textContent = 'Processing... Please wait';

            console.log('Started code review loading state');
            break;
        case 'codeReviewCompleted':
            // Reset code review button
            codeReviewButton.disabled = false;
            codeReviewButton.classList.remove('processing');
            codeReviewButton.textContent = 'Get Code Review';

            console.log('Completed code review');
            break;
    }
});