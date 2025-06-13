import * as vscode from 'vscode';
import { execSync } from 'child_process';

import { COMMANDS, CONFIG_KEYS, SCM_ACTIONS, EXTENSION_NAME, VIEW_IDS, END_POINTS } from './constants';
import { getBackendUrl, getNonce, getStagedDiffOrShowError } from './helpers';
import { fetchCodeReview, fetchMessage, fetchOpenAiModels } from './services';

export function activate(context: vscode.ExtensionContext) {
    console.log(`Congratulations, your extension "${EXTENSION_NAME}" is now active!`);

    // Register the Generate Message command
    const generateMessageCommand = vscode.commands.registerCommand(COMMANDS.GENERATE_MESSAGE, async (data: { webviewView: vscode.WebviewView, model: string }) => {
        const { webviewView, model } = data;
        webviewView.webview.postMessage({ type: 'startLoading' });

        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const authToken = config.get(CONFIG_KEYS.AUTH_TOKEN) as string;
        const format = config.get(CONFIG_KEYS.FORMAT) as string;
        const commitType = config.get(CONFIG_KEYS.COMMIT_TYPE) as string;
        const maxLenInLine = config.get(CONFIG_KEYS.MAX_LENGTH_IN_LINE) as number;
        const apiKey = config.get(CONFIG_KEYS.API_KEY) as string;
        const prompt = config.get(CONFIG_KEYS.PROMPT) as string;

        const generateCommitMessageEndpoint = getBackendUrl(END_POINTS.GENERATE.COMMIT_MESSAGE);

        let finalDiff: string;
        try {
            const result = getStagedDiffOrShowError();
            if (!result) {
                webviewView.webview.postMessage({ type: 'stopLoading' });
                return;
            };
            finalDiff = result.diff.trim();
        } catch (error) {
            webviewView.webview.postMessage({ type: 'stopLoading' });
            vscode.window.showErrorMessage(`Failed to get Git diff: ${error}`);
            return;
        }

        try {
            const message = await fetchMessage({ url: generateCommitMessageEndpoint, authToken, format, commitType, length: maxLenInLine, apiKey, prompt, model, diff: finalDiff });
            webviewView.webview.postMessage({ type: 'updateInput', value: message });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch message: ${error}`);
        } finally {
            webviewView.webview.postMessage({ type: 'stopLoading' });
        }
    });

    // Register the Commit Action command
    const commitActionCommand = vscode.commands.registerCommand(COMMANDS.COMMIT_ACTION, async (data: { action: string, message: string }, webviewView?: vscode.WebviewView) => {
        webviewView?.webview.postMessage({ type: 'startLoading' });
        if (!data || !data.action || !data.message) {
            vscode.window.showErrorMessage('No commit action or message provided.');
            return;
        }

        if (webviewView) {
            webviewView.webview.postMessage({ type: 'startCommitLoading' });
        }

        try {
            execSync('git --version', { encoding: 'utf8' });
        } catch (error) {
            throw new Error('Git is not installed or not found in PATH.');
        }

        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            throw new Error('VS Code Git extension not found.');
        }
        if (!gitExtension.isActive) {
            console.log('Activating Git extension...');
            await gitExtension.activate();
        }
        const git = gitExtension.exports.getAPI(1);
        if (!git.repositories.length) {
            throw new Error('No Git repository found.');
        }
        const repository = git.repositories[0];
        console.log('Git repository:', repository.rootUri.fsPath);

        const status = await repository.status();
        const state = repository.state;
        if (!state) {
            throw new Error('Failed to retrieve repository state.');
        }
        console.log('Git repository state:', JSON.stringify(state.indexChanges, null, 2));
        console.log('Staged changes (indexChanges):', state.indexChanges.length);

        try {
            switch (data.action) {
                case SCM_ACTIONS.COMMIT:
                    if (!state.indexChanges || state.indexChanges.length === 0) {
                        throw new Error('No staged changes found. Please stage changes (git add).');
                    }
                    await repository.commit(data.message);
                    vscode.window.showInformationMessage('Changes committed.');
                    break;
                case SCM_ACTIONS.COMMIT_AND_PUSH:
                    if (!state.indexChanges || state.indexChanges.length === 0) {
                        throw new Error('No staged changes found. Please stage changes (git add).');
                    }
                    await repository.commit(data.message);
                    try {
                        await repository.push();
                        vscode.window.showInformationMessage('Changes committed and pushed.');
                    } catch (pushError) {
                        const pushErrorMessage = (pushError instanceof Error) ? pushError.message : String(pushError);
                        vscode.window.showWarningMessage(`Changes committed locally, but push failed: ${pushErrorMessage}`);
                    }
                    break;
                case SCM_ACTIONS.COMMIT_ALL:
                    await repository.add(['.']);
                    if (!state.indexChanges || state.indexChanges.length === 0) {
                        throw new Error('No changes to commit.');
                    }
                    await repository.commit(data.message);
                    vscode.window.showInformationMessage('All changes committed.');
                    break;
                default:
                    throw new Error('Unknown SCM action: ' + data.action);
            }
        } catch (error) {
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            console.error('Repository action error:', error);
            vscode.window.showErrorMessage(`SCM action failed: ${errorMessage}`);
        } finally {
            if (webviewView) {
                webviewView.webview.postMessage({ type: 'stopCommitLoading' });
            }
        }
    });

    // Register the Get Code Review command
    const getCodeReviewCommand = vscode.commands.registerCommand(COMMANDS.GET_CODE_REVIEW, async (data: { webviewView: vscode.WebviewView, model: string }) => {
        const { webviewView, model } = data;
        webviewView.webview.postMessage({ type: 'startLoading' });

        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const apiKey = config.get(CONFIG_KEYS.API_KEY) as string;
        const authToken = config.get(CONFIG_KEYS.AUTH_TOKEN) as string;

        const codeReviewApiEndpoint = getBackendUrl(END_POINTS.GENERATE.CODE_REVIEW);
        if (!codeReviewApiEndpoint) {
            vscode.window.showErrorMessage(`Code review API endpoint not found in configuration for key: ${END_POINTS.GENERATE.CODE_REVIEW}`);
            webviewView.webview.postMessage({ type: 'stopLoading' });
            return;
        }

        let finalDiff: string;
        try {
            const result = getStagedDiffOrShowError();
            if (!result) {
                webviewView.webview.postMessage({ type: 'stopLoading' });
                return;
            };
        
            finalDiff = result.diff.trim();
        } catch (error) {
            webviewView.webview.postMessage({ type: 'stopLoading' });
            vscode.window.showErrorMessage(`Failed to get Git diff: ${error}`);
            return;
        }

        try {
            const review = await fetchCodeReview({url: codeReviewApiEndpoint, authToken, apiKey, model, diff: finalDiff});
            webviewView.webview.postMessage({ type: 'showCodeReview', review });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch code review: ${error}`);
        } finally {
            webviewView.webview.postMessage({ type: 'stopLoading' });
        }
    });

    context.subscriptions.push(generateMessageCommand, commitActionCommand, getCodeReviewCommand);

    // Register the Webview View Provider
    const provider = new HelloWorldViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_IDS.VIEW, provider)
    );

    console.log('Webview view initialized');
}

class HelloWorldViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        webviewView.webview.html = this._getWebviewContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                console.log('Received webview message:', message);
                switch (message.type) {
                    case 'generateMessage':
                        await vscode.commands.executeCommand(COMMANDS.GENERATE_MESSAGE, { webviewView, model: message.model });
                        break;
                    case 'commitAction':
                        await vscode.commands.executeCommand(COMMANDS.COMMIT_ACTION, { action: message.action, message: message.message }, webviewView);
                        break;
                    case 'getCodeReview':
                        await vscode.commands.executeCommand(COMMANDS.GET_CODE_REVIEW, { webviewView, model: message.model });
                        break;
                    case 'showErrorMessage':
                        vscode.window.showErrorMessage(message.value);
                        break;
                    case 'requestConfirmation':
                        const result = await vscode.window.showInformationMessage(message.value, { modal: true }, 'Confirm');
                        webviewView.webview.postMessage({
                            type: 'confirmationResponse',
                            confirmed: result === 'Confirm'
                        });
                        break;
                    case 'fetchModels':
                        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                        const authToken = config.get(CONFIG_KEYS.AUTH_TOKEN) as string;
                        const apiKey = config.get(CONFIG_KEYS.API_KEY) as string;

                        const backendUrlWithModels = getBackendUrl(END_POINTS.GET_MODELS);

                        try {
                            webviewView.webview.postMessage({ type: 'startModelLoading' });
                            const models = await fetchOpenAiModels(backendUrlWithModels, authToken, apiKey);
                            webviewView.webview.postMessage({ type: 'updateModelDropdown', models });
                        } catch (error) {
                            const errorMessage = (error instanceof Error) ? error.message : String(error);
                            vscode.window.showErrorMessage(`Failed to fetch OpenAI models: ${errorMessage}`);
                        } finally {
                            webviewView.webview.postMessage({ type: 'stopModelLoading' });
                        }
                        break;
                }
            },
            undefined,
            []
        );
    }

    private _getWebviewContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const nonce = getNonce();

        return /*html*/ `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link href="${styleUri}" rel="stylesheet">
                <title>Hello Auto Generate Commit</title>
            </head>
            <body>
                <h1>Auto Generate Commit</h1>
                <div class="tab-container">
                    <button class="tab-button active" data-tab="generate-commit">Generate & Commit</button>
                    <button class="tab-button" data-tab="code-review">Code Review</button>
                </div>
                <div class="tab-content active" id="generate-commit">
                    <div id="loader" class="loader">Processing...</div>
                    <select id="modelDropdownGenerate" class="model-dropdown">
                        <option value="">Select OpenAI Model</option>
                    </select>
                    <textarea id="messageInput" class="commit-message" placeholder="Message will appear here"></textarea>
                    <div class="action-container">
                        <button id="generateButton">Generate Message</button>
                        <select id="commitDropdown">
                            <option value="">Select SCM Action</option>
                            <option value="${SCM_ACTIONS.COMMIT}">Commit</option>
                            <option value="${SCM_ACTIONS.COMMIT_AND_PUSH}">Commit and Push</option>
                            <option value="${SCM_ACTIONS.COMMIT_ALL}">Commit All</option>
                        </select>
                    </div>
                </div>
                <div class="tab-content" id="code-review">
                    <select id="modelDropdownReview" class="model-dropdown">
                        <option value="">Select OpenAI Model</option>
                    </select>
                    <button id="codeReviewButton">Get Code Review</button>
                </div>
                <div id="reviewDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h2>Code Review</h2>
                        <pre id="reviewContent" readonly></pre>
                        <button id="closeDialog">Close</button>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
}

export function deactivate() { }