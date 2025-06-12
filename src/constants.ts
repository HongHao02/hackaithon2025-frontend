export const EXTENSION_NAME = 'hn02-hello-world-extension';

export const COMMANDS = {
    GENERATE_MESSAGE: `${EXTENSION_NAME}.generateMessage`,
    COMMIT_ACTION: `${EXTENSION_NAME}.commitAction`,
    GET_CODE_REVIEW: `${EXTENSION_NAME}.getCodeReview`
};

export const CONFIG_KEYS = {
    BACKEND_URL: `backendUrl`,
    AUTH_TOKEN: `authToken`,
    FORMAT: `format`,
    COMMIT_TYPE: `commitType`,
    MAX_LEN: `maxLen`,
    API_KEY: `apiKey`,
    PROMPT: `customPrompt`,
    MODEL: `model`,
    CODE_REVIEW_API_ENDPOINT: `codeReviewApiEndpoint`
};

export const DEFAULT_CONFIG = {
    BACKEND_URL: 'http://localhost:3001/generate',
    AUTH_TOKEN: '',
    FORMAT: 'conventional',
    COMMIT_TYPE: 'feat',
    MAX_LEN: 100,
    API_KEY: '',
    PROMPT: 'Generate a concise commit message',
    MODEL: 'gpt-3.5-turbo',
    GENERATE_COMMIT_MESSAGE_ENDPOINT: 'http://localhost:3001/generate/commit-messages',
    CODE_REVIEW_API_ENDPOINT: 'http://localhost:3001/generate/review-comments'
};

export const VIEW_IDS = {
    CONTAINER: 'helloWorldContainer',
    VIEW: 'helloWorldView'
};

export const SCM_ACTIONS = {
    COMMIT: 'commit',
    COMMIT_AND_PUSH: 'commitAndPush',
    COMMIT_ALL: 'commitAll'
};