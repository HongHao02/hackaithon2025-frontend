import * as vscode from 'vscode';
import { CommitResponse } from "../types/base.types";

// Fetch commit message
export async function fetchMessage(config: {
    url: string,
    authToken: string,
    format: string,
    commitType: string,
    length: number,
    apiKey: string,
    prompt: string,
    model: string,
    diff: string
}): Promise<string> {
    const { url, authToken, format, commitType, length: maxLen, apiKey, prompt, model, diff } = config;
    try {
        const response = await fetch(url, {
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

// Fetch OpenAI models
export async function fetchOpenAiModels(url: string, authToken: string, apiKey: string): Promise<string[]> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json() as string[];
        return data || ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']; // Fallback models
    } catch (error) {
        throw new Error(`Failed to fetch OpenAI models: ${error}`);
    }
}

// Fetch code review
export async function fetchCodeReview(config: {
    url: string,
    authToken: string,
    apiKey: string,
    model: string,
    diff: string
}): Promise<string> {
    const { url, authToken, apiKey, model, diff } = config;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                diff,
                model,
                apiKey
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json() as CommitResponse;

        if (!data || !data.message) {
            throw new Error('No review message returned from the server.');
        }
        if (data.message.length > 10000) {
            vscode.window.showWarningMessage('Code review message is too long, truncating to 10000 characters.');
            return data.message.substring(0, 10000);
        }

        return data.message || '';
    } catch (error) {
        throw new Error(`Fetch review code message failed: ${error}`);
    }
}