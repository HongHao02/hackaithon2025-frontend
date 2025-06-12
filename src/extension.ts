import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { COMMANDS, CONFIG_KEYS, SCM_ACTIONS, EXTENSION_NAME, VIEW_IDS } from './constants';
import { CommitResponse } from './types/base.types';
import path from 'path';
import * as fs from 'fs';


const execPromise = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    console.log(`Congratulations, your extension "${EXTENSION_NAME}" is now active!`);

    // Register the Generate Message command
    const generateMessageCommand = vscode.commands.registerCommand(COMMANDS.GENERATE_MESSAGE, async (webviewView: vscode.WebviewView) => {
        // Start loading state
        webviewView.webview.postMessage({ type: 'startLoading' });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate a delay for demonstration purposes

        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const backendUrl = config.get(CONFIG_KEYS.BACKEND_URL) as string;
        const authToken = config.get(CONFIG_KEYS.AUTH_TOKEN) as string;
        const format = config.get(CONFIG_KEYS.FORMAT) as string;
        const commitType = config.get(CONFIG_KEYS.COMMIT_TYPE) as string;
        const maxLen = config.get(CONFIG_KEYS.MAX_LEN) as number;
        const apiKey = config.get(CONFIG_KEYS.API_KEY) as string;
        const prompt = config.get(CONFIG_KEYS.PROMPT) as string;
        const model = config.get(CONFIG_KEYS.MODEL) as string;

        // Get the diff
        let finalDiff: string;
        try {
            // finalDiff = await getDiffFromWorkSpace();
            const result = getStagedDiffOrShowError();
            if (!result) {
                return; // If there's an error, exit the command
            }
            const { cwd, diff } = result;
            finalDiff = result.diff.trim();

        } catch (error) {
            webviewView.webview.postMessage({ type: 'stopLoading' });
            vscode.window.showErrorMessage(`Failed to get Git diff: ${error}`);
            return;
        }

        try {
            const message = await fetchMessage({ backendUrl, authToken, format, commitType, maxLen, apiKey, prompt, model, diff: finalDiff });
            webviewView.webview.postMessage({ type: 'updateInput', value: message });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch message: ${error}`);
        } finally {
            // Stop loading state
            webviewView.webview.postMessage({ type: 'stopLoading' });
        }
    });

    // Register the Commit Action command
    // const commitActionCommand = vscode.commands.registerCommand(COMMANDS.COMMIT_ACTION, async (action: string) => {
    //     try {
    //         switch (action) {
    //             case SCM_ACTIONS.COMMIT:
    //                 await vscode.commands.executeCommand('git.commit');
    //                 vscode.window.showInformationMessage('Changes committed.');
    //                 break;
    //             case SCM_ACTIONS.COMMIT_AND_PUSH:
    //                 await vscode.commands.executeCommand('git.commit');
    //                 await vscode.commands.executeCommand('git.push');
    //                 vscode.window.showInformationMessage('Changes committed and pushed.');
    //                 break;
    //             case SCM_ACTIONS.COMMIT_ALL:
    //                 await vscode.commands.executeCommand('git.commitAll');
    //                 vscode.window.showInformationMessage('All changes committed.');
    //                 break;
    //             default:
    //                 vscode.window.showErrorMessage('Unknown SCM action.');
    //         }
    //     } catch (error) {
    //         vscode.window.showErrorMessage(`SCM action failed: ${error}`);
    //     }
    // });

    // In the activate function, replace the commitActionCommand definition:
    const commitActionCommand = vscode.commands.registerCommand(COMMANDS.COMMIT_ACTION, async (data: { action: string, message: string }, webviewView?: vscode.WebviewView) => {
    if (!data || !data.action || !data.message) {
        vscode.window.showErrorMessage('No commit action or message provided.');
        return;
    }

    // Send startLoading message for commit button
    if (webviewView) {
        webviewView.webview.postMessage({ type: 'startCommitLoading' });
    }

    try {
        // Validate Git installation
        try {
            execSync('git --version', { encoding: 'utf8' });
        } catch (error) {
            throw new Error('Git is not installed or not found in PATH. Please install Git and ensure it’s accessible.');
        }

        // Access Git API
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            throw new Error('VS Code Git extension not found. Please enable it.');
        }
        if (!gitExtension.isActive) {
            console.log('Activating Git extension...');
            await gitExtension.activate();
        }
        const git = gitExtension.exports.getAPI(1);
        if (!git.repositories.length) {
            throw new Error('No Git repository found. Please initialize a repository (git init).');
        }
        const repository = git.repositories[0];
        console.log('Git repository:', repository.rootUri.fsPath);

        // Check repository state
        // NOTICE: Please do not delete this line, it is necessary to ensure the repository is ready for getting the state
        const status = await repository.status();
        const state = repository.state;
        if (!state) {
            throw new Error('Failed to retrieve repository state. Ensure the repository is valid and try again.');
        }
        console.log('Git repository state:', JSON.stringify(state.indexChanges, null, 2));
        console.log('Staged changes (indexChanges):', state.indexChanges.length);

        switch (data.action) {
            case SCM_ACTIONS.COMMIT:
                // Check for staged changes
                if (!state.indexChanges || state.indexChanges.length === 0) {
                    throw new Error('No staged changes found. Please stage changes (git add).');
                }
                await repository.commit(data.message);
                vscode.window.showInformationMessage('Changes committed.');
                break;
            case SCM_ACTIONS.COMMIT_AND_PUSH:
                // Check for staged changes
                if (!repository.indexChanges || repository.indexChanges.length === 0) {
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
                // Stage all changes
                await repository.add(['.']);
                if (!repository.indexChanges || repository.indexChanges.length === 0) {
                    throw new Error('No changes to commit. Please make changes and try again.');
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
        // Send stopLoading message for commit button
        if (webviewView) {
            webviewView.webview.postMessage({ type: 'stopCommitLoading' });
        }
    }
});

    // Register the Get Code Review command
    const getCodeReviewCommand = vscode.commands.registerCommand(COMMANDS.GET_CODE_REVIEW, async (webviewView: vscode.WebviewView) => {
        const codeReviewApiEndpoint = vscode.workspace.getConfiguration(EXTENSION_NAME).get(CONFIG_KEYS.CODE_REVIEW_API_ENDPOINT) as string;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open a file to review.');
            return;
        }
        const codeContent = editor.document.getText();
        try {
            const review = await fetchCodeReview(codeReviewApiEndpoint, codeContent);
            await vscode.window.showInformationMessage(review, { modal: true }, 'Close');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch code review: ${error}`);
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

// Fetch commit message using the fetch API
async function fetchMessage(config: {
    backendUrl: string,
    authToken: string,
    format: string,
    commitType: string,
    maxLen: number,
    apiKey: string,
    prompt: string,
    model: string,
    diff: string
}): Promise<string> {
    const { backendUrl, authToken, format, commitType, maxLen, apiKey, prompt, model, diff } = config;
    try {
        const response = await fetch(`${backendUrl}/commit-messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                diff,
                prompt,
                model,
                format,
                commitType,
                maxLength: maxLen,
                apiKey
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json() as CommitResponse;
        return data.message || 'Default commit message';
    } catch (error) {
        throw new Error(`Fetch failed: ${error}`);
    }
}

// Mock API call for code review (using https, can be updated to fetch if needed)
async function fetchCodeReview(apiEndpoint: string, code: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ code });
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = require('https').request(apiEndpoint, options, (res: any) => {
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.review || 'Mock code review: Looks good!');
                } catch {
                    resolve('Mock code review: Please check syntax.');
                }
            });
        });
        req.on('error', (err: Error) => {
            reject(err.message);
        });
        req.write(postData);
        req.end();
    });
}

// Get Git diff from workspace
const getDiffFromWorkSpace = async (): Promise<string> => {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return '';
        }

        const cwd = workspaceFolders[0].uri.fsPath;

        let diff = '';
        // Get untracked files
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);

        for (const file of untrackedFiles) {
            const filePath = path.join(cwd, file);
            if (fs.existsSync(filePath)) {
                const content = await fs.promises.readFile(filePath, 'utf8');
                diff += `\n\n--- New file: ${file} --\n${content}`;
            }
        }

        // Include unstaged changes only
        try {
            const { stdout: gitDiff } = await execPromise('git diff', { cwd, encoding: 'utf8' });
            if (gitDiff) {
                diff += `\n${gitDiff}`;
            }
        } catch (error) {
            console.warn('Failed to get unstaged changes:', error);
        }

        if (!diff.trim()) {
            vscode.window.showWarningMessage('No unstaged or untracked changes found in working directory.');
            return '';
        }
        return diff.trim();
    } catch (error) {
        vscode.window.showWarningMessage(`Failed to get changes: ${error}`);
        return '';
    }
};

function getStagedDiffOrShowError(): { cwd: string; diff: string } | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return null;
    }

    const cwd = workspaceFolders[0].uri.fsPath;
    const diff = execSync('git diff --staged', { cwd, encoding: 'utf-8' });

    if (!diff.trim()) {
        vscode.window.showWarningMessage('No staged changes found. Stage your changes first.');
        return null;
    }

    return { cwd, diff };
}

class HelloWorldViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
    webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
    };

    webviewView.webview.html = this._getWebviewContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
            async (message) => {
                console.log('Received webview message:', message);
                switch (message.type) {
                    case 'generateMessage':
                        await vscode.commands.executeCommand(COMMANDS.GENERATE_MESSAGE, webviewView);
                        break;
                    case 'commitAction':
                        await vscode.commands.executeCommand(COMMANDS.COMMIT_ACTION, { action: message.action, message: message.message }, webviewView);
                        break;
                    case 'getCodeReview':
                        await vscode.commands.executeCommand(COMMANDS.GET_CODE_REVIEW, webviewView);
                        break;
                    case 'showErrorMessage':
                        vscode.window.showErrorMessage(message.value);
                        break;
                }
            },
            undefined,
            []
        );
    }

    // private _getWebviewContent(webview: vscode.Webview): string {
    //     const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'index.js'));
    //     const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
    //     const nonce = getNonce();

    //     return /*html*/ `
	// 		<!DOCTYPE html>
	// 		<html lang="en">
	// 		<head>
	// 			<meta charset="UTF-8">
	// 			<meta name="viewport" content="width=device-width, initial-scale=1.0">
	// 			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	// 			<link href="${styleUri}" rel="stylesheet">
	// 			<title>Hello World View</title>
	// 		</head>
	// 		<body>
	// 			<h1>Hello World</h1>
	// 			<textarea id="messageInput" class="commit-message" placeholder="Message will appear here" contenteditable="true"></textarea>
	// 			<button id="generateButton">Generate Message</button>
    //             <div id="loader" style="display: none;">Loading...</div>
	// 			<select id="commitDropdown">
	// 				<option value="">Select SCM Action</option>
	// 				<option value="${SCM_ACTIONS.COMMIT}">Commit</option>
	// 				<option value="${SCM_ACTIONS.COMMIT_AND_PUSH}">Commit and Push</option>
	// 				<option value="${SCM_ACTIONS.COMMIT_ALL}">Commit All</option>
	// 			</select>
	// 			<button id="commitButton" disabled>Execute Commit</button>
	// 			<button id="codeReviewButton">Get Code Review</button>
	// 			<script nonce="${nonce}" src="${scriptUri}"></script>
	// 		</body>
	// 		</html>
	// 	`;
    // }

    // In the HelloWorldViewProvider class, replace _getWebviewContent:
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
                <title>Hello World View</title>
            </head>
            <body>
                <h1>Hello World</h1>
                <textarea id="messageInput" class="commit-message" placeholder="Message will appear here" contenteditable="true"></textarea>
                <button id="generateButton">Generate Message</button>
                <div id="loader" class="loader">Generating...</div>
                <select id="commitDropdown">
                    <option value="">Select SCM Action</option>
                    <option value="${SCM_ACTIONS.COMMIT}">Commit</option>
                    <option value="${SCM_ACTIONS.COMMIT_AND_PUSH}">Commit and Push</option>
                    <option value="${SCM_ACTIONS.COMMIT_ALL}">Commit All</option>
                </select>
                <button id="commitButton" disabled>Execute Commit</button>
                <button id="codeReviewButton">Get Code Review</button>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
}

// Helper function for nonce generation
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function deactivate() { }