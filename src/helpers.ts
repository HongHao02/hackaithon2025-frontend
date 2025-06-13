import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

import { CONFIG_KEYS, EXTENSION_NAME } from './constants';

const execPromise = promisify(exec);

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getBackendUrl(endPoint: string): string {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const backendUrl = config.get(CONFIG_KEYS.BACKEND_URL) as string;

    if (!endPoint) {
        throw new Error(`Endpoint ${endPoint} invalid.`);
    }

    if (!backendUrl) {
        throw new Error(`Backend URL not found in configuration for key: ${CONFIG_KEYS.BACKEND_URL}`);
    }

    return `${backendUrl}${endPoint}`;
}

export function getStagedDiffOrShowError(): { cwd: string, diff: string } | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }

    const cwd = workspaceFolders[0].uri.fsPath;
    const diff = execSync('git diff --staged', { cwd, encoding: 'utf-8' });

    if (!diff.trim()) {
        vscode.window.showWarningMessage('No staged changes found. Stage your changes first.');
        return;
    }

    return { cwd, diff };
}

// Get Git diff
const getDiffFromWorkSpace = async (): Promise<string> => {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return '';
        }

        const cwd = workspaceFolders[0].uri.fsPath;
        let diff = '';
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);

        for (const file of untrackedFiles) {
            const filePath = path.join(cwd, file);
            if (fs.existsSync(filePath)) {
                const content = await fs.promises.readFile(filePath, 'utf8');
                diff += `\n\n--- New file: ${file} --\n${content}`;
            }
        }

        try {
            const { stdout: gitDiff } = await execPromise('git diff', { cwd, encoding: 'utf8' });
            if (gitDiff) {
                diff += `\n${gitDiff}`;
            };
        } catch (error) {
            console.warn('Failed to get unstaged changes:', error);
        }

        if (!diff.trim()) {
            vscode.window.showWarningMessage('No unstaged or untracked changes found.');
            return '';
        }
        return diff.trim();
    } catch (error) {
        vscode.window.showWarningMessage(`Failed to get changes: ${error}`);
        return '';
    }
};