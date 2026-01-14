/**
 * Constants and configuration for the extension
 */

// API configuration
export const CLAUDE_API_TIMEOUT_MS = 60000; // 60 seconds for Claude API
export const GITHUB_API_TIMEOUT_MS = 10000; // 10 seconds for GitHub API

// Retry configuration
export const API_MAX_RETRIES = 3;

// Limits
export const MAX_CODE_LENGTH_FOR_AI = 8000; // Max characters to send to Claude
export const MAX_COMMITS_TO_SEARCH_PRS = 20; // Max commits to search for PRs
export const PR_BATCH_SIZE = 5; // Number of parallel PR requests

// Secret storage keys
export const SECRET_KEY_CLAUDE_API = 'whatIsTheCode.claudeApiKey';
export const SECRET_KEY_GITHUB_TOKEN = 'whatIsTheCode.githubToken';

// Error messages
export const ErrorMessages = {
    NO_EDITOR: 'No active editor found',
    NO_ACTIVE_EDITOR: 'No active editor found',
    NO_SELECTION: 'Please select some code to analyze',
    NO_GIT_REMOTE: 'No git remote found',
    NOT_GITHUB_REPO: 'Not a GitHub repository',
    INVALID_GITHUB_TOKEN: 'Invalid GitHub token',
    RATE_LIMIT_EXCEEDED: 'API rate limit exceeded or insufficient permissions',
    CLAUDE_API_FAILED: 'Claude analysis failed. Using static analysis instead.',
    ANALYSIS_FAILED: 'Analysis failed',
    REQUEST_TIMEOUT: 'Request timeout',
    PARSE_FAILED: 'Failed to parse response',
    NO_PREVIOUS_ANALYSIS: 'No previous analysis to refresh. Please analyze code first.',
} as const;

// Success messages
export const SuccessMessages = {
    API_KEY_SAVED: 'Claude API key saved securely!',
    GITHUB_TOKEN_SAVED: 'GitHub token saved securely!',
    CACHE_CLEARED: (count: number) => `Cleared ${count} cached analysis result${count !== 1 ? 's' : ''}.`,
    SHOWING_CACHED: 'Showing cached analysis result. Use "What is the Code: Refresh" for fresh analysis.',
} as const;
