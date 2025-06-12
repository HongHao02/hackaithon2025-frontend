import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { COMMANDS, CONFIG_KEYS, SCM_ACTIONS, EXTENSION_NAME, VIEW_IDS } from '../constants';
import { CommitResponse } from '../types/base.types';
import path from 'path';
import * as fs from 'fs';

const execPromise = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    console.log(`Congratulations, your extension "${EXTENSION_NAME}" is now active!`);

    // Register the Generate Message command
    const generateMessageCommand = vscode.commands.registerCommand(COMMANDS.GENERATE_MESSAGE, async (webviewView: vscode.WebviewView) => {
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
        let diff: string;
        try {
            diff = await getDiffFromWorkSpace();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get Git diff: ${error}`);
            return;
        }

        try {
            const message = await fetchMessage({ backendUrl, authToken, format, commitType, maxLen, apiKey, prompt, model, diff });
            webviewView.webview.postMessage({ type: 'updateInput', value: message });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch message: ${error}`);
        }
    });

    // Register the Commit Action command
    const commitActionCommand = vscode.commands.registerCommand(COMMANDS.COMMIT_ACTION, async (action: string) => {
        try {
            switch (action) {
                case SCM_ACTIONS.COMMIT:
                    await vscode.commands.executeCommand('git.commit');
                    vscode.window.showInformationMessage('Changes committed.');
                    break;
                case SCM_ACTIONS.COMMIT_AND_PUSH:
                    await vscode.commands.executeCommand('git.commit');
                    await vscode.commands.executeCommand('git.push');
                    vscode.window.showInformationMessage('Changes committed and pushed.');
                    break;
                case SCM_ACTIONS.COMMIT_ALL:
                    await vscode.commands.executeCommand('git.commitAll');
                    vscode.window.showInformationMessage('All changes committed.');
                    break;
                default:
                    vscode.window.showErrorMessage('Unknown SCM action.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`SCM action failed: ${error}`);
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

// Get Git diff using child_process
async function getGitDiff(): Promise<string> {
    try {
        // Check if the workspace is a Git repository
        await execPromise('git rev-parse --is-inside-work-tree');
        // If the above command succeeds, run git diff
        const { stdout } = await execPromise('git diff');
        return stdout || 'No changes detected';
    } catch (error) {
        // If not a Git repository, fall back to active editor content
        if (String(error).includes('Not a git repository')) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                return editor.document.getText() || 'No editor content available';
            }
            return 'No Git repository or active editor found';
        }
        throw new Error(`Git diff failed: ${error}`);
    }
}

const getDiffFromWorkSpace = async (): Promise<string> => {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return "";
        }

        const cwd = workspaceFolders[0].uri.fsPath;

        let diff = '';
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf-8' }).split('\n').filter(Boolean);

        for (const file of untrackedFiles) {
            const filePath = path.join(cwd, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                diff += `\n\n--- New file: ${file} ---\n${content}`;
            }
        }

        if (!diff.trim()) {
            vscode.window.showWarningMessage('No changes found in working directory.');
            return "";
        }
        return diff;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get Git diff: ${error}`);
        return '';
    }
}

class HelloWorldViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionUri);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'generateMessage':
                        await vscode.commands.executeCommand(COMMANDS.GENERATE_MESSAGE, webviewView);
                        break;
                    case 'commitAction':
                        await vscode.commands.executeCommand(COMMANDS.COMMIT_ACTION, message.action);
                        break;
                    case 'getCodeReview':
                        await vscode.commands.executeCommand(COMMANDS.GET_CODE_REVIEW, webviewView);
                        break;
                }
            },
            undefined,
            []
        );
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));

        return /*html*/ `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Hello World View</title>
            </head>
            <body>
                <h1>Hello World</h1>
                <input id="messageInput" type="text" placeholder="Message will appear here" readonly />
                <button id="generateButton">Generate Message</button>
                <select id="commitDropdown">
                    <option value="">Select SCM Action</option>
                    <option value="${SCM_ACTIONS.COMMIT}">Commit</option>
                    <option value="${SCM_ACTIONS.COMMIT_AND_PUSH}">Commit and Push</option>
                    <option value="${SCM_ACTIONS.COMMIT_ALL}">Commit All</option>
                </select>
                <button id="commitButton" disabled>Execute SCM Action</button>
                <button id="codeReviewButton">Get Code Review</button>
                <script src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
}

export function deactivate() {}