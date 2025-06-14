export const EXTENSION_NAME = 'ptn-ai-commit-generator';

export const COMMANDS = {
    GENERATE_MESSAGE: `${EXTENSION_NAME}.generateMessage`,
    COMMIT_ACTION: `${EXTENSION_NAME}.commitAction`,
    GET_CODE_REVIEW: `${EXTENSION_NAME}.getCodeReview`
};

export const CONFIG_KEYS = {
    BACKEND_URL: `backendBaseUrl`,
    AUTH_TOKEN: `authToken`,
    FORMAT: `format`,
    MAX_LENGTH_IN_LINE: `maxLengthInLine`,
    API_KEY: `apiKey`,
    PROMPT: `customPrompt`,
};

export const END_POINTS = {
    GENERATE: {
        COMMIT_MESSAGE: '/generate/commit-messages',
        CODE_REVIEW: '/generate/review-comments'
    },
    GET_MODELS: '/models',
};

export const VIEW_IDS = {
    CONTAINER: 'AutoCommiterContainer',
    VIEW: 'AutoCommiterView'
};

export const SCM_ACTIONS = {
    COMMIT: 'commit',
    COMMIT_AND_PUSH: 'commitAndPush',
    COMMIT_ALL: 'commitAll'
};