import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { CodeAnalyzer } from './analyzer/codeAnalyzer';
import { GitAnalyzer } from './analyzer/gitAnalyzer';
import { GitHubAnalyzer } from './analyzer/githubAnalyzer';
import { ReportPanel } from './webview/reportPanel';
import { AnalysisResult } from './types';
import { 
    SECRET_KEY_CLAUDE_API, 
    SECRET_KEY_GITHUB_TOKEN, 
    ErrorMessages,
    SuccessMessages 
} from './utils/constants';

// Global secret storage reference
let secretStorage: vscode.SecretStorage;

// Helper functions for secure credential access
export async function getClaudeApiKey(): Promise<string | undefined> {
    // First check secret storage
    const secretKey = await secretStorage.get(SECRET_KEY_CLAUDE_API);
    if (secretKey) return secretKey;
    
    // Fallback to settings for backward compatibility
    const config = vscode.workspace.getConfiguration('whatIsTheCode');
    return config.get<string>('claudeApiKey') || undefined;
}

export async function getGithubToken(): Promise<string | undefined> {
    // First check secret storage
    const secretToken = await secretStorage.get(SECRET_KEY_GITHUB_TOKEN);
    if (secretToken) return secretToken;
    
    // Fallback to settings for backward compatibility
    const config = vscode.workspace.getConfiguration('whatIsTheCode');
    return config.get<string>('githubToken') || undefined;
}

// Cache for analysis results
interface CacheEntry {
    result: AnalysisResult;
    codeHash: string;
    timestamp: number;
}

const analysisCache = new Map<string, CacheEntry>();

// Get cache TTL from settings or use default
function getCacheTtlMs(): number {
    const config = vscode.workspace.getConfiguration('whatIsTheCode');
    const minutes = config.get<number>('cacheTtlMinutes', 30);
    return minutes * 60 * 1000;
}

// Track last analysis for refresh
let lastAnalysis: { filePath: string; startLine: number; endLine: number; code: string } | null = null;

// Track if analysis is in progress (for cancellation)
let analysisInProgress = false;
let analysisCancelled = false;

function getCacheKey(filePath: string, startLine: number, endLine: number): string {
    return `${filePath}:${startLine}:${endLine}`;
}

function getCodeHash(code: string): string {
    return crypto.createHash('md5').update(code).digest('hex');
}

function getCachedResult(filePath: string, startLine: number, endLine: number, code: string): AnalysisResult | null {
    const key = getCacheKey(filePath, startLine, endLine);
    const entry = analysisCache.get(key);
    
    if (!entry) {
        return null;
    }
    
    const codeHash = getCodeHash(code);
    const isExpired = Date.now() - entry.timestamp > getCacheTtlMs();
    const codeChanged = entry.codeHash !== codeHash;
    
    if (isExpired || codeChanged) {
        analysisCache.delete(key);
        return null;
    }
    
    return entry.result;
}

function setCachedResult(filePath: string, startLine: number, endLine: number, code: string, result: AnalysisResult): void {
    const key = getCacheKey(filePath, startLine, endLine);
    analysisCache.set(key, {
        result,
        codeHash: getCodeHash(code),
        timestamp: Date.now()
    });
}

export function clearCache(): void {
    const count = analysisCache.size;
    analysisCache.clear();
    vscode.window.showInformationMessage(SuccessMessages.CACHE_CLEARED(count));
}

export function activate(context: vscode.ExtensionContext) {
    console.log('What is the Code extension is now active!');

    // Initialize secret storage
    secretStorage = context.secrets;

    const gitAnalyzer = new GitAnalyzer();
    const githubAnalyzer = new GitHubAnalyzer();
    const codeAnalyzer = new CodeAnalyzer();

    // Command to set Claude API key securely
    const setClaudeApiKeyCommand = vscode.commands.registerCommand('whatIsTheCode.setClaudeApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Claude API Key',
            password: true,
            placeHolder: 'sk-ant-... or sk-...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) return 'API key is required';
                if (!value.startsWith('sk-')) return 'Invalid API key format (should start with sk-)';
                return null;
            }
        });
        
        if (apiKey) {
            await secretStorage.store(SECRET_KEY_CLAUDE_API, apiKey);
            vscode.window.showInformationMessage(SuccessMessages.API_KEY_SAVED);
        }
    });

    // Command to set GitHub token securely
    const setGithubTokenCommand = vscode.commands.registerCommand('whatIsTheCode.setGithubToken', async () => {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) return 'Token is required';
                return null;
            }
        });
        
        if (token) {
            await secretStorage.store(SECRET_KEY_GITHUB_TOKEN, token);
            vscode.window.showInformationMessage(SuccessMessages.GITHUB_TOKEN_SAVED);
        }
    });

    // Command to analyze selected code
    const analyzeCommand = vscode.commands.registerCommand('whatIsTheCode.analyze', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(ErrorMessages.NO_ACTIVE_EDITOR);
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage(ErrorMessages.NO_SELECTION);
            return;
        }

        const selectedText = editor.document.getText(selection);
        const filePath = editor.document.uri.fsPath;
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;

        await analyzeCode(context, filePath, startLine, endLine, selectedText, gitAnalyzer, githubAnalyzer, codeAnalyzer, false);
    });

    // Command to analyze entire file
    const analyzeFileCommand = vscode.commands.registerCommand('whatIsTheCode.analyzeFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(ErrorMessages.NO_ACTIVE_EDITOR);
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const content = editor.document.getText();
        const lineCount = editor.document.lineCount;

        await analyzeCode(context, filePath, 1, lineCount, content, gitAnalyzer, githubAnalyzer, codeAnalyzer, false);
    });

    // Command to clear cache
    const clearCacheCommand = vscode.commands.registerCommand('whatIsTheCode.clearCache', () => {
        clearCache();
    });

    // Command to refresh (bypass cache) - uses last analysis info
    const refreshCommand = vscode.commands.registerCommand('whatIsTheCode.refresh', async () => {
        if (!lastAnalysis) {
            vscode.window.showErrorMessage(ErrorMessages.NO_PREVIOUS_ANALYSIS);
            return;
        }

        // Try to get fresh content from the file
        let code = lastAnalysis.code;
        try {
            const doc = await vscode.workspace.openTextDocument(lastAnalysis.filePath);
            if (lastAnalysis.startLine === 1 && lastAnalysis.endLine === doc.lineCount) {
                // Full file analysis - get fresh content
                code = doc.getText();
            } else {
                // Selection analysis - get the same range
                const range = new vscode.Range(lastAnalysis.startLine - 1, 0, lastAnalysis.endLine, 0);
                code = doc.getText(range);
            }
        } catch {
            // Use cached code if file can't be opened
        }

        await analyzeCode(context, lastAnalysis.filePath, lastAnalysis.startLine, lastAnalysis.endLine, code, gitAnalyzer, githubAnalyzer, codeAnalyzer, true);
    });

    context.subscriptions.push(analyzeCommand, analyzeFileCommand, clearCacheCommand, refreshCommand, setClaudeApiKeyCommand, setGithubTokenCommand);
}

async function analyzeCode(
    context: vscode.ExtensionContext,
    filePath: string,
    startLine: number,
    endLine: number,
    code: string,
    gitAnalyzer: GitAnalyzer,
    githubAnalyzer: GitHubAnalyzer,
    codeAnalyzer: CodeAnalyzer,
    forceRefresh: boolean = false
): Promise<void> {
    // Prevent concurrent analyses
    if (analysisInProgress) {
        vscode.window.showInformationMessage('Analysis already in progress. Please wait.');
        return;
    }

    // Store last analysis info for refresh
    lastAnalysis = { filePath, startLine, endLine, code };

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cachedResult = getCachedResult(filePath, startLine, endLine, code);
        if (cachedResult) {
            // Update the result to indicate it's from cache
            const resultWithCacheInfo = {
                ...cachedResult,
                fromCache: true,
                cacheAge: Date.now() - new Date(cachedResult.analyzedAt).getTime()
            };
            ReportPanel.createOrShow(context.extensionUri, resultWithCacheInfo as AnalysisResult);
            vscode.window.showInformationMessage('Showing cached analysis result. Use "What is the Code: Refresh" for fresh analysis.');
            return;
        }
    }

    // Check for Claude API key (using secure storage)
    const claudeApiKey = await getClaudeApiKey();
    if (!claudeApiKey) {
        const action = await vscode.window.showWarningMessage(
            'Claude API key not configured. AI analysis will use basic static analysis instead.',
            'Set API Key',
            'Continue Anyway'
        );
        if (action === 'Set API Key') {
            vscode.commands.executeCommand('whatIsTheCode.setClaudeApiKey');
            return;
        }
        if (!action) {
            return; // User dismissed
        }
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing code...',
        cancellable: true
    }, async (progress, token) => {
        // Track analysis state
        analysisInProgress = true;
        analysisCancelled = false;

        // Handle cancellation
        token.onCancellationRequested(() => {
            analysisCancelled = true;
            vscode.window.showInformationMessage('Analysis cancelled.');
        });

        try {
            if (analysisCancelled) { analysisInProgress = false; return; }
            progress.report({ message: 'Fetching git history...' });
            const gitAnalysis = await gitAnalyzer.analyze(filePath, startLine, endLine);

            if (analysisCancelled) { analysisInProgress = false; return; }
            progress.report({ message: 'Analyzing code with Claude AI...' });
            const codeAnalysis = await codeAnalyzer.analyze(code, filePath, gitAnalysis.commits);

            if (analysisCancelled) { analysisInProgress = false; return; }
            progress.report({ message: 'Fetching GitHub PRs...' });
            const githubAnalysis = await githubAnalyzer.analyze(filePath, gitAnalysis.commits);

            if (analysisCancelled) { analysisInProgress = false; return; }
            progress.report({ message: 'Generating report...' });
            
            const result: AnalysisResult = {
                filePath,
                startLine,
                endLine,
                code,
                codeAnalysis,
                gitAnalysis,
                githubAnalysis,
                analyzedAt: new Date().toISOString()
            };

            // Store in cache
            setCachedResult(filePath, startLine, endLine, code, result);

            ReportPanel.createOrShow(context.extensionUri, result);
        } catch (error) {
            if (analysisCancelled) {
                // Don't show error if user cancelled
                return;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`${ErrorMessages.ANALYSIS_FAILED}: ${errorMessage}`);
        } finally {
            analysisInProgress = false;
        }
    });
}

export function deactivate() {
    // Cleanup if needed
}
