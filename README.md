# AI Commit Generator

Generate AI-powered Git commit messages directly from Visual Studio Code using OpenAI ChatGPT Models.

## 🚀 Features

- Automatically generate commit messages from staged changes
- Supports custom commit message format
- Supports custom prompt for generate commit message
- Enforces max length per line
- Able to generate commit message by your given custom prompt
- Configurable via extension settings
- Backend powered by your own OpenAI API key

## ⚙️ Extension Settings
- `ptn-ai-commit-generator.backendBaseUrl`: URL of your backend API that generates commit messages
- `ptn-ai-commit-generator.authToken`: **Authorization token** (AUTH_SECRET) for security
- `ptn-ai-commit-generator.format`: Format of the commit message (e.g., `{type}: {message}`)
- `ptn-ai-commit-generator.customPrompt`: Allowed custom prompt
- `ptn-ai-commit-generator.maxLengthInLine`: Max length of commit message per line
- `ptn-ai-commit-generator.apiKey`: Using your own API Key

## 🧪 How to Use

1. Stage your Git changes
2. Click on the PTN AI Commit Generator icon in the left side bar
3. Select `OpenAI Model` to be used
4. Click on `Generate Message` button
4. Review and Edit the message
5. `Select SCM Action` to action with your message
