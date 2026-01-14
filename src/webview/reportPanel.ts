import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AnalysisResult, MainPurposeCategory } from '../types';

export class ReportPanel {
    public static currentPanel: ReportPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, result: AnalysisResult) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ReportPanel.currentPanel) {
            ReportPanel.currentPanel._panel.reveal(column);
            ReportPanel.currentPanel._update(result);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'whatIsTheCode',
            'Code Analysis Report',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ReportPanel.currentPanel = new ReportPanel(panel, extensionUri, result);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, result: AnalysisResult) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update(result);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        vscode.commands.executeCommand('whatIsTheCode.refresh');
                        return;
                    case 'clearCache':
                        vscode.commands.executeCommand('whatIsTheCode.clearCache');
                        return;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'whatIsTheCode');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        ReportPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(result: AnalysisResult) {
        this._panel.webview.html = this._getHtmlForWebview(result);
    }

    private _getHtmlForWebview(result: AnalysisResult): string {
        const { codeAnalysis, gitAnalysis, githubAnalysis } = result;
        const categoryInfo = this._getCategoryInfo(codeAnalysis.mainPurposeCategory);
        const { displayPath, fileName, parentFolder } = this._getFilePathInfo(result.filePath);
        const nonce = this._getNonce();
        const risks = codeAnalysis.risks || [];
        const riskCount = risks.filter((r: any) => r.level !== 'low').length;
        const prCount = (githubAnalysis.pullRequests || []).length;
        const ownerCount = (gitAnalysis.owners || []).length;
        const commitCount = (gitAnalysis.commits || []).length;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https://github.com https://avatars.githubusercontent.com https://www.gravatar.com data:;">
    <title>Code Analysis Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
            --bg: #0d1117;
            --bg-card: #161b22;
            --bg-elevated: #21262d;
            --border: #30363d;
            --text: #e6edf3;
            --text-muted: #8b949e;
            --text-subtle: #6e7681;
            --blue: #58a6ff;
            --green: #3fb950;
            --yellow: #d29922;
            --orange: #db6d28;
            --red: #f85149;
            --purple: #a371f7;
            --pink: #db61a2;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.5;
            padding: 0;
            font-size: 14px;
        }
        
        /* Animations */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-in {
            animation: fadeIn 0.3s ease-out forwards;
        }
        
        /* Navigation */
        .nav {
            position: sticky;
            top: 0;
            z-index: 100;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            padding: 12px 24px;
            backdrop-filter: blur(8px);
        }
        
        .nav-inner {
            max-width: 1000px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            padding: 4px 0;
        }
        
        .nav-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            color: var(--text-muted);
            font-size: 12px;
            text-decoration: none;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.15s;
        }
        
        .nav-item:hover {
            background: var(--bg-elevated);
            color: var(--text);
        }
        
        .nav-item.active {
            background: var(--bg-elevated);
            border-color: var(--border);
            color: var(--blue);
        }
        
        .dashboard {
            max-width: 1000px;
            margin: 0 auto;
            padding: 24px;
        }
        
        /* Scroll margin for navigation */
        [id] { scroll-margin-top: 60px; }
        
        /* Hero Section */
        .hero {
            text-align: center;
            padding: 32px 24px;
            background: linear-gradient(135deg, ${categoryInfo.color}15, ${categoryInfo.color}05);
            border: 1px solid ${categoryInfo.color}40;
            border-radius: 16px;
            margin-bottom: 24px;
        }
        
        .hero-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
        
        .hero-category {
            font-size: 24px;
            font-weight: 600;
            color: ${categoryInfo.color};
            margin-bottom: 4px;
        }
        
        .hero-description {
            color: var(--text-muted);
            font-size: 14px;
            margin-bottom: 16px;
        }
        
        .hero-file {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: var(--bg-elevated);
            padding: 8px 16px;
            border-radius: 20px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 12px;
            color: var(--text-muted);
            cursor: default;
            position: relative;
        }
        
        .hero-file[title]:hover::after {
            content: attr(title);
            position: absolute;
            bottom: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            white-space: normal;
            max-width: min(400px, 90vw);
            word-break: break-word;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .file-path-parent {
            color: var(--text-subtle);
        }
        
        .file-path-name {
            color: var(--text);
            font-weight: 500;
        }
        
        .file-path-lines {
            color: var(--blue);
        }
        
        /* Quick Stats */
        .stats-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }
        
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 28px;
            font-weight: 600;
            color: var(--blue);
        }
        
        .stat-label {
            font-size: 11px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 4px;
        }
        
        /* Cards */
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 16px;
            overflow: hidden;
        }
        
        .card-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 20px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
            overflow: hidden;
        }

        .card-header-icon {
            font-size: 18px;
            flex-shrink: 0;
        }

        .card-header-content {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }

        .card-header-title {
            white-space: nowrap;
            flex-shrink: 0;
        }

        .card-header-subtitle {
            font-size: 12px;
            font-weight: normal;
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
            flex: 1;
        }
        
        .card-body {
            padding: 20px;
        }
        
        /* Summary Box */
        .summary-box {
            background: var(--bg-elevated);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }
        
        .summary-box p {
            color: var(--text);
            font-size: 15px;
            line-height: 1.6;
        }
        
        .ai-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: var(--purple);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        /* Tags */
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 12px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 16px;
            font-size: 12px;
            color: var(--text-muted);
        }
        
        .tag.type { border-color: var(--blue); color: var(--blue); }
        .tag.complexity-low { border-color: var(--green); color: var(--green); }
        .tag.complexity-medium { border-color: var(--yellow); color: var(--yellow); }
        .tag.complexity-high { border-color: var(--orange); color: var(--orange); }
        .tag.complexity-very-high { border-color: var(--red); color: var(--red); }
        
        /* Two Column Layout */
        .two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }
        
        @media (max-width: 700px) {
            .two-col { grid-template-columns: 1fr; }
            .stats-row { grid-template-columns: repeat(2, 1fr); }
        }
        
        /* Shared list item styles */
        .list-item {
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
        }
        .list-item:last-child { border-bottom: none; }
        .meta { font-size: 12px; color: var(--text-muted); }
        
        /* Owner List */
        .owner-item {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .owner-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--bg-elevated);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            color: var(--blue);
            overflow: hidden;
            flex-shrink: 0;
        }
        
        .owner-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .owner-avatar .fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        }
        
        .owner-info { flex: 1; }
        .owner-name { font-weight: 500; }
        
        .owner-percentage {
            font-size: 18px;
            font-weight: 600;
            color: var(--green);
        }
        
        /* Risk List */
        .risk-item {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 8px;
            border-left: 3px solid;
        }
        
        .risk-item:last-child { margin-bottom: 0; }
        
        .risk-item.critical { background: ${this._hexToRgba('#f85149', 0.1)}; border-color: var(--red); }
        .risk-item.high { background: ${this._hexToRgba('#db6d28', 0.1)}; border-color: var(--orange); }
        .risk-item.medium { background: ${this._hexToRgba('#d29922', 0.1)}; border-color: var(--yellow); }
        .risk-item.low { background: ${this._hexToRgba('#3fb950', 0.1)}; border-color: var(--green); }
        
        .risk-level {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        
        .risk-item.critical .risk-level { background: var(--red); color: white; }
        .risk-item.high .risk-level { background: var(--orange); color: white; }
        .risk-item.medium .risk-level { background: var(--yellow); color: black; }
        .risk-item.low .risk-level { background: var(--green); color: white; }
        
        .risk-desc { margin-bottom: 4px; }
        .risk-rec { font-style: italic; }
        
        /* PR List */
        .pr-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        
        .pr-number { color: var(--text-muted); font-size: 13px; }
        
        .pr-title {
            color: var(--blue);
            text-decoration: none;
            font-weight: 500;
        }
        
        .pr-title:hover { text-decoration: underline; }
        
        .pr-state {
            margin-left: auto;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        
        .pr-state.merged { background: var(--purple); color: white; }
        .pr-state.open { background: var(--green); color: white; }
        .pr-state.closed { background: var(--red); color: white; }
        
        /* Commit List */
        .commit-item {
            display: flex;
            gap: 12px;
            padding: 10px 0;
        }
        
        .commit-hash {
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 12px;
            color: var(--yellow);
            background: var(--bg-elevated);
            padding: 2px 8px;
            border-radius: 4px;
            white-space: nowrap;
        }
        
        .commit-info { flex: 1; min-width: 0; }
        .commit-msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        /* Dependencies */
        .dep-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .dep-item {
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
            padding: 4px 10px;
            background: var(--bg-elevated);
            border-radius: 4px;
            color: var(--text-muted);
        }
        
        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 32px;
            color: var(--text-subtle);
        }
        
        .empty-state-icon { font-size: 32px; margin-bottom: 8px; }
        
        /* Error */
        .error-msg {
            background: ${this._hexToRgba('#f85149', 0.1)};
            border: 1px solid var(--red);
            color: var(--red);
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
        }
        
        /* Footer */
        .footer {
            text-align: center;
            padding: 24px;
            color: var(--text-subtle);
            font-size: 12px;
        }
        
        /* Action buttons in nav */
        .nav-actions {
            margin-left: auto;
            display: flex;
            gap: 8px;
        }
        
        .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text-muted);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        
        .nav-btn:hover {
            background: var(--border);
            color: var(--text);
        }
        
        .nav-btn.primary {
            background: var(--blue);
            border-color: var(--blue);
            color: white;
        }
        
        .nav-btn.primary:hover {
            opacity: 0.9;
        }
        
        .cache-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: var(--yellow);
            color: black;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        
        /* TL;DR Section */
        .tldr {
            background: linear-gradient(135deg, var(--purple), var(--blue));
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 24px;
            position: relative;
            overflow: hidden;
        }
        
        .tldr::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 200px;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1));
        }
        
        .tldr-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.8;
            margin-bottom: 8px;
        }
        
        .tldr-text {
            font-size: 18px;
            font-weight: 500;
            line-height: 1.4;
        }
        
        .tldr-actions {
            margin-top: 12px;
            display: flex;
            gap: 8px;
        }
        
        .tldr-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            background: rgba(255,255,255,0.2);
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.15s;
        }
        
        .tldr-btn:hover {
            background: rgba(255,255,255,0.3);
        }
        
        /* Risk Meter */
        .risk-meter {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 16px;
        }
        
        .risk-gauge {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            position: relative;
        }
        
        .risk-gauge::before {
            content: '';
            position: absolute;
            inset: 3px;
            border-radius: 50%;
            background: var(--bg-card);
        }
        
        .risk-gauge span {
            position: relative;
            z-index: 1;
        }
        
        .risk-gauge.low { background: conic-gradient(var(--green) 0deg, var(--green) 90deg, var(--border) 90deg); }
        .risk-gauge.medium { background: conic-gradient(var(--yellow) 0deg, var(--yellow) 180deg, var(--border) 180deg); }
        .risk-gauge.high { background: conic-gradient(var(--orange) 0deg, var(--orange) 270deg, var(--border) 270deg); }
        .risk-gauge.critical { background: conic-gradient(var(--red) 0deg, var(--red) 360deg, var(--border) 360deg); }
        
        .risk-gauge.low span { color: var(--green); }
        .risk-gauge.medium span { color: var(--yellow); }
        .risk-gauge.high span { color: var(--orange); }
        .risk-gauge.critical span { color: var(--red); }
        
        .risk-summary { flex: 1; }
        .risk-summary-title { font-weight: 600; font-size: 16px; margin-bottom: 4px; }
        .risk-summary-text { color: var(--text-muted); font-size: 13px; }
        
        /* Code Preview */
        .code-preview {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 16px;
            overflow: hidden;
        }
        
        .code-preview-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: var(--bg-elevated);
            cursor: pointer;
            user-select: none;
        }
        
        .code-preview-header:hover {
            background: var(--border);
        }
        
        .code-preview-toggle {
            transition: transform 0.2s;
        }
        
        .code-preview.open .code-preview-toggle {
            transform: rotate(90deg);
        }
        
        .code-preview-body {
            display: none;
            max-height: 300px;
            overflow: auto;
        }
        
        .code-preview.open .code-preview-body {
            display: block;
        }
        
        .code-preview pre {
            margin: 0;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        
        /* Card hover effect */
        .card {
            transition: border-color 0.15s, box-shadow 0.15s;
        }

        .card:hover {
            border-color: var(--text-subtle);
        }
        
        /* Toast notification */
        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--text);
            color: var(--bg);
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            opacity: 0;
            transition: all 0.3s;
            z-index: 1000;
        }
        
        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        
        /* Focus styles for accessibility */
        .nav-item:focus-visible,
        .nav-btn:focus-visible,
        .tldr-btn:focus-visible,
        .empty-state-action:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
        }

        a:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
            border-radius: 4px;
        }

        .code-preview-header:focus-visible {
            outline: none;
            background: var(--bg-elevated);
            box-shadow: inset 0 0 0 2px var(--blue);
        }
        
        .skip-link {
            position: absolute;
            top: -100px;
            left: 16px;
            background: var(--blue);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            z-index: 200;
            text-decoration: none;
            font-weight: 500;
        }
        
        .skip-link:focus {
            top: 8px;
        }
        
        /* Collapsible sections */
        .card-header.collapsible {
            cursor: pointer;
            user-select: none;
            position: relative;
        }

        .card-header.collapsible:hover {
            background: var(--bg-elevated);
        }

        .card-header.collapsible:focus-visible {
            outline: none;
            background: var(--bg-elevated);
        }

        .card-header.collapsible:focus-visible::before {
            content: '';
            position: absolute;
            inset: 4px;
            border: 2px solid var(--blue);
            border-radius: 6px;
            pointer-events: none;
        }
        
        .card-header .collapse-icon {
            margin-left: auto;
            transition: transform 0.2s;
            font-size: 12px;
            color: var(--text-muted);
            flex-shrink: 0;
        }
        
        .card.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }
        
        .card.collapsed .card-body {
            display: none;
        }
        
        /* Navigation badge */
        .nav-badge {
            background: var(--bg-elevated);
            color: var(--text-muted);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
        }
        
        .nav-badge.warning {
            background: var(--orange);
            color: white;
        }
        
        .nav-badge.danger {
            background: var(--red);
            color: white;
        }
        
        /* Syntax highlighting */
        .hl-keyword { color: var(--purple); font-weight: 500; }
        .hl-string { color: var(--green); }
        .hl-comment { color: var(--text-subtle); font-style: italic; }
        .hl-number { color: var(--yellow); }
        .hl-function { color: var(--blue); }
        
        /* Better empty states */
        .empty-state-title {
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 4px;
        }
        
        .empty-state-hint {
            font-size: 12px;
            color: var(--text-subtle);
            margin-bottom: 12px;
        }
        
        .empty-state-action {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--blue);
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .empty-state-action:hover {
            background: var(--border);
        }
        
        /* Keyboard shortcut hints */
        .kbd {
            display: inline-block;
            padding: 2px 6px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 10px;
            color: var(--text-muted);
            margin-left: 4px;
        }
        
        /* Print styles */
        @media print {
            .nav, .nav-actions, .skip-link, .tldr-actions {
                display: none !important;
            }
            
            body {
                background: white;
                color: black;
            }
            
            .dashboard {
                max-width: 100%;
            }
            
            .card, .hero, .tldr, .risk-meter {
                break-inside: avoid;
                border: 1px solid #ccc;
                background: white;
            }
            
            .code-preview-body {
                display: block !important;
                max-height: none !important;
            }
        }
    </style>
</head>
<body>
    <!-- Skip link for accessibility -->
    <a href="#overview" class="skip-link">Skip to content</a>
    
    <!-- Toast notification -->
    <div class="toast" id="toast" role="alert" aria-live="polite"></div>
    
    <!-- Navigation -->
    <nav class="nav" role="navigation" aria-label="Report sections">
        <div class="nav-inner">
            <a href="#overview" class="nav-item">📊 Overview</a>
            <a href="#what-why" class="nav-item">💡 What & Why</a>
            <a href="#owners" class="nav-item">👥 Owners ${ownerCount > 0 ? `<span class="nav-badge">${ownerCount}</span>` : ''}</a>
            <a href="#risks" class="nav-item">⚠️ Risks ${riskCount > 0 ? `<span class="nav-badge ${riskCount >= 2 ? 'danger' : 'warning'}">${riskCount}</span>` : ''}</a>
            <a href="#tests" class="nav-item">🧪 Tests ${(codeAnalysis.suggestedTests || []).length > 0 ? `<span class="nav-badge">${(codeAnalysis.suggestedTests || []).length}</span>` : ''}</a>
            <a href="#history" class="nav-item">📜 History ${commitCount > 0 ? `<span class="nav-badge">${Math.min(commitCount, 99)}${commitCount > 99 ? '+' : ''}</span>` : ''}</a>
            <a href="#prs" class="nav-item">🔗 PRs ${prCount > 0 ? `<span class="nav-badge">${prCount}</span>` : ''}</a>
            ${codeAnalysis.dependencies.length > 0 || codeAnalysis.exports.length > 0 ? `<a href="#deps" class="nav-item">📦 Deps <span class="nav-badge">${codeAnalysis.dependencies.length}</span></a>` : ''}
            <a href="#code" class="nav-item">💻 Code</a>
            <div class="nav-actions">
                ${result.fromCache ? `<span class="cache-badge" role="status">📦 Cached ${this._formatCacheAge(result.cacheAge || 0)}</span>` : ''}
                <button class="nav-btn primary" id="refresh-btn" title="Refresh analysis (R)">🔄 Refresh<span class="kbd">R</span></button>
            </div>
        </div>
    </nav>
    
    <div class="dashboard">
        <!-- TL;DR Summary -->
        <div class="tldr animate-in" id="overview" style="animation-delay: 0.05s">
            <div class="tldr-label">TL;DR</div>
            <div class="tldr-text">${this._escapeHtml(this._generateTldr(codeAnalysis, categoryInfo))}</div>
            <div class="tldr-actions">
                <button class="tldr-btn" id="copy-summary-btn">📋 Copy Summary</button>
                <button class="tldr-btn" id="copy-ai-btn" title="Copy comprehensive context for AI assistants">🤖 Copy for AI Chat</button>
            </div>
        </div>

        <!-- Hero: Main Purpose -->
        <div class="hero animate-in" style="animation-delay: 0.1s">
            <div class="hero-icon">${categoryInfo.icon}</div>
            <div class="hero-category">${categoryInfo.label}</div>
            <div class="hero-description">${categoryInfo.description}</div>
            <div class="hero-file" title="${this._escapeHtml(result.filePath)}">
                <span>📄</span>
                <span class="file-path-parent">${parentFolder ? this._escapeHtml(parentFolder) + '/' : ''}</span><span class="file-path-name">${this._escapeHtml(fileName)}</span>
                <span>•</span>
                <span class="file-path-lines">L${result.startLine}${result.startLine !== result.endLine ? '-L' + result.endLine : ''}</span>
            </div>
        </div>
        
        <!-- Risk Meter -->
        <div class="risk-meter animate-in" style="animation-delay: 0.15s">
            <div class="risk-gauge ${this._getOverallRiskLevel(codeAnalysis.risks)}">
                <span>${this._getRiskEmoji(this._getOverallRiskLevel(codeAnalysis.risks))}</span>
            </div>
            <div class="risk-summary">
                <div class="risk-summary-title">${this._getRiskTitle(this._getOverallRiskLevel(codeAnalysis.risks))}</div>
                <div class="risk-summary-text">${codeAnalysis.risks.length} risk${codeAnalysis.risks.length !== 1 ? 's' : ''} identified • ${codeAnalysis.complexity} complexity</div>
            </div>
        </div>
        
        <!-- Quick Stats -->
        <div class="stats-row animate-in" style="animation-delay: 0.2s">
            <div class="stat-card">
                <div class="stat-value">${result.endLine - result.startLine + 1}</div>
                <div class="stat-label">Lines</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${gitAnalysis.owners.length}</div>
                <div class="stat-label">Contributors</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${gitAnalysis.totalChanges}</div>
                <div class="stat-label">Commits</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${githubAnalysis.pullRequests.length}</div>
                <div class="stat-label">PRs</div>
            </div>
        </div>
        
        <!-- What & Why -->
        <div class="card animate-in" id="what-why" style="animation-delay: 0.25s">
            <div class="card-header">
                <span class="card-header-icon">💡</span>
                <div class="card-header-content">
                    <span class="card-header-title">What & Why</span>
                </div>
            </div>
            <div class="card-body">
                <div class="summary-box">
                    <span class="ai-badge">🤖 AI Analysis</span>
                    <p>${this._escapeHtml(codeAnalysis.purpose)}</p>
                </div>
                
                ${codeAnalysis.whyItExists ? `
                <div class="summary-box" style="background: ${this._hexToRgba(categoryInfo.color, 0.1)}; border: 1px solid ${categoryInfo.color}40;">
                    <p style="color: var(--text-muted);"><strong style="color: var(--text);">Why it exists:</strong> ${this._escapeHtml(codeAnalysis.whyItExists)}</p>
                </div>
                ` : ''}
                
                <div class="tags">
                    <span class="tag type">📦 ${codeAnalysis.codeType}</span>
                    <span class="tag complexity-${codeAnalysis.complexity}">📊 ${codeAnalysis.complexity} complexity</span>
                </div>
                
                ${codeAnalysis.potentialPurposes.length > 0 ? `
                <div style="margin-top: 16px;">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Related purposes:</div>
                    <div class="tags">
                        ${codeAnalysis.potentialPurposes.map(p => `<span class="tag">${this._escapeHtml(p)}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
        
        <div class="two-col">
            <!-- Code Owners -->
            <div class="card" id="owners">
                <div class="card-header collapsible" tabindex="0" role="button" aria-expanded="true">
                    <span class="card-header-icon">👥</span>
                    <div class="card-header-content">
                        <span class="card-header-title">Code Owners</span>
                    </div>
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="card-body">
                    ${gitAnalysis.owners.length > 0 ? `
                        ${gitAnalysis.owners.slice(0, 5).map(owner => `
                        <div class="list-item owner-item">
                            <div class="owner-avatar" title="${this._escapeHtml(owner.email || owner.name)}">
                                ${owner.email ? `
                                    <img src="https://www.gravatar.com/avatar/${this._md5(owner.email.toLowerCase().trim())}?s=72&d=identicon" 
                                         alt="${this._escapeHtml(owner.name)}" 
                                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                    <span class="fallback" style="display: none;">${owner.name.charAt(0).toUpperCase()}</span>
                                ` : `
                                    <span class="fallback">${owner.name.charAt(0).toUpperCase()}</span>
                                `}
                            </div>
                            <div class="owner-info">
                                <div class="owner-name">${this._escapeHtml(owner.name)}</div>
                                <div class="meta">${owner.commits} commits • Last: ${this._formatDate(owner.lastContribution)}</div>
                            </div>
                            <div class="owner-percentage">${owner.percentage}%</div>
                        </div>
                        `).join('')}
                    ` : `
                        <div class="empty-state">
                            <div class="empty-state-icon">👤</div>
                            <div class="empty-state-title">No Ownership Data</div>
                            <div class="empty-state-hint">This file may not be tracked by git yet</div>
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Risks -->
            <div class="card" id="risks">
                <div class="card-header collapsible" tabindex="0" role="button" aria-expanded="true">
                    <span class="card-header-icon">⚠️</span>
                    <div class="card-header-content">
                        <span class="card-header-title">Change Risks</span>
                    </div>
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="card-body">
                    ${(codeAnalysis.risks && codeAnalysis.risks.length > 0) ? this._sortRisksByLevel(codeAnalysis.risks).map(risk => `
                    <div class="risk-item ${risk.level}">
                        <span class="risk-level">${risk.level}</span>
                        <div class="risk-desc">${this._escapeHtml(risk.description)}</div>
                        <div class="meta risk-rec">💡 ${this._escapeHtml(risk.recommendation)}</div>
                    </div>
                    `).join('') : `
                    <div class="empty-state">
                        <div class="empty-state-icon">✅</div>
                        <div class="empty-state-title">No Risks Identified</div>
                        <div class="empty-state-hint">This code appears safe to modify</div>
                    </div>
                    `}
                </div>
            </div>
        </div>
        
        <!-- Suggested Tests -->
        <div class="card" id="tests">
            <div class="card-header collapsible" tabindex="0" role="button" aria-expanded="true">
                <span class="card-header-icon">🧪</span>
                <div class="card-header-content">
                    <span class="card-header-title">Suggested Tests</span>
                    <span class="card-header-subtitle">${(codeAnalysis.suggestedTests || []).length} tests</span>
                </div>
                <span class="collapse-icon">▼</span>
            </div>
            <div class="card-body">
                ${(codeAnalysis.suggestedTests && codeAnalysis.suggestedTests.length > 0) ? codeAnalysis.suggestedTests.map(test => `
                <div class="list-item" style="display: flex; gap: 10px; align-items: center;">
                    <span style="flex-shrink: 0; background: ${this._getTestTypeColor(test.type)}; color: white; text-transform: uppercase; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px;">${test.type}</span>
                    <span style="flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: ${test.priority === 'high' ? 'var(--red)' : test.priority === 'medium' ? 'var(--yellow)' : 'var(--green)'};" title="${test.priority} priority"></span>
                    <span style="color: var(--text);">${this._escapeHtml(test.description)}</span>
                </div>
                `).join('') : `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">No Specific Tests Suggested</div>
                    <div class="empty-state-hint">Standard testing practices should be sufficient</div>
                </div>
                `}
            </div>
        </div>
        
        <!-- History -->
        <div class="card" id="history">
            <div class="card-header collapsible" tabindex="0" role="button" aria-expanded="true">
                <span class="card-header-icon">📜</span>
                <div class="card-header-content">
                    <span class="card-header-title">History</span>
                    <span class="card-header-subtitle">${gitAnalysis.changeFrequency}</span>
                </div>
                <span class="collapse-icon">▼</span>
            </div>
            <div class="card-body">
                ${gitAnalysis.commits.length > 0 ? `
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--bg-elevated); border-radius: 8px; font-size: 13px; color: var(--text-muted);">
                        Created <strong style="color: var(--text);">${this._formatDate(gitAnalysis.createdAt)}</strong> • 
                        Last modified <strong style="color: var(--text);">${this._formatDate(gitAnalysis.lastModified)}</strong>
                    </div>
                    ${gitAnalysis.commits.slice(0, 5).map(commit => `
                    <div class="list-item commit-item">
                        <span class="commit-hash">${commit.shortHash}</span>
                        <div class="commit-info">
                            <div class="commit-msg">${this._escapeHtml(commit.message)}</div>
                            <div class="meta">${this._escapeHtml(commit.author)} • ${this._formatDate(commit.date)}</div>
                        </div>
                    </div>
                    `).join('')}
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-title">No Git History</div>
                        <div class="empty-state-hint">This file is not tracked by git or has no commits yet</div>
                    </div>
                `}
            </div>
        </div>
        
        <!-- GitHub PRs -->
        <div class="card" id="prs">
            <div class="card-header collapsible" tabindex="0" role="button" aria-expanded="true">
                <span class="card-header-icon">🔗</span>
                <div class="card-header-content">
                    <span class="card-header-title">Related Pull Requests</span>
                    ${githubAnalysis.repoUrl ? `
                    <a href="${githubAnalysis.repoUrl}" target="_blank" style="font-size: 12px; color: var(--blue); text-decoration: none;" class="github-link">
                        View on GitHub →
                    </a>
                    ` : ''}
                </div>
                <span class="collapse-icon">▼</span>
            </div>
            <div class="card-body">
                ${githubAnalysis.error ? `
                    <div class="error-msg">⚠️ ${this._escapeHtml(githubAnalysis.error)}</div>
                    ${githubAnalysis.error.includes('token') ? `
                    <div style="text-align: center; margin-top: 12px;">
                        <button class="empty-state-action" id="settings-btn">⚙️ Configure GitHub Token</button>
                    </div>
                    ` : ''}
                ` : ''}
                
                ${githubAnalysis.pullRequests.length > 0 ? `
                    ${githubAnalysis.pullRequests.map(pr => `
                    <div class="list-item">
                        <div class="pr-header">
                            <span class="pr-number">#${pr.number}</span>
                            <a href="${pr.url}" class="pr-title" target="_blank">${this._escapeHtml(pr.title)}</a>
                            <span class="pr-state ${pr.state}">${pr.state}</span>
                        </div>
                        <div class="meta">
                            by ${this._escapeHtml(pr.author)} • ${this._formatDate(pr.mergedAt || pr.createdAt)}
                        </div>
                    </div>
                    `).join('')}
                ` : (!githubAnalysis.error ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-title">No Related PRs Found</div>
                        <div class="empty-state-hint">No pull requests are linked to the commits in this code</div>
                    </div>
                ` : '')}
            </div>
        </div>
        
        <!-- Dependencies -->
        ${codeAnalysis.dependencies.length > 0 || codeAnalysis.exports.length > 0 ? `
        <div class="two-col" id="deps">
            <div class="card">
                <div class="card-header">
                    <span class="card-header-icon">📥</span>
                    <div class="card-header-content">
                        <span class="card-header-title">Dependencies (${codeAnalysis.dependencies.length})</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="dep-list">
                        ${codeAnalysis.dependencies.length > 0 
                            ? codeAnalysis.dependencies.map(d => `<span class="dep-item">${this._escapeHtml(d)}</span>`).join('')
                            : '<span style="color: var(--text-subtle);">None</span>'
                        }
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <span class="card-header-icon">📤</span>
                    <div class="card-header-content">
                        <span class="card-header-title">Exports (${codeAnalysis.exports.length})</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="dep-list">
                        ${codeAnalysis.exports.length > 0 
                            ? codeAnalysis.exports.map(e => `<span class="dep-item">${this._escapeHtml(e)}</span>`).join('')
                            : '<span style="color: var(--text-subtle);">None</span>'
                        }
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        
        <!-- Code Preview -->
        <div class="code-preview" id="code">
            <div class="code-preview-header" tabindex="0" role="button" aria-expanded="false" aria-controls="code-body">
                <span class="code-preview-toggle">▶</span>
                <span>💻 Analyzed Code</span>
                <span style="margin-left: auto; font-size: 12px; color: var(--text-muted);">${result.endLine - result.startLine + 1} lines<span class="kbd">C</span></span>
            </div>
            <div class="code-preview-body" id="code-body">
                <pre><code>${this._highlightCode(result.code, result.filePath)}</code></pre>
            </div>
        </div>
        
        <div class="footer">
            Generated by What is the Code • ${new Date(result.analyzedAt).toLocaleString()}${result.fromCache ? ' (from cache)' : ''}
            <br><span style="font-size: 11px;">Keyboard: <span class="kbd">R</span> Refresh • <span class="kbd">C</span> Toggle Code • <span class="kbd">?</span> Shortcuts</span>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const summaryText = ${JSON.stringify(this._generateFullSummary(result, codeAnalysis, categoryInfo))};
        const aiContextText = ${JSON.stringify(this._generateAIContext(result, codeAnalysis, gitAnalysis, githubAnalysis, categoryInfo))};
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function toggleCodePreview() {
            const preview = document.querySelector('.code-preview');
            const isOpen = preview.classList.toggle('open');
            const header = preview.querySelector('.code-preview-header');
            header.setAttribute('aria-expanded', isOpen);
        }
        
        function toggleSection(header) {
            const card = header.closest('.card');
            const isCollapsed = card.classList.toggle('collapsed');
            header.setAttribute('aria-expanded', !isCollapsed);
        }
        
        function copySummary() {
            navigator.clipboard.writeText(summaryText).then(() => {
                showToast('Summary copied to clipboard!');
            });
        }
        
        function copyForAI() {
            navigator.clipboard.writeText(aiContextText).then(() => {
                showToast('AI context copied! Paste into your AI chat.');
            });
        }
        
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
        
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        }
        
        function showShortcuts() {
            showToast('Shortcuts: R=Refresh, C=Code, 1-6=Jump to section');
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key.toLowerCase()) {
                case 'r':
                    e.preventDefault();
                    refresh();
                    break;
                case 'c':
                    e.preventDefault();
                    toggleCodePreview();
                    break;
                case '?':
                    e.preventDefault();
                    showShortcuts();
                    break;
                case '1':
                    document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '2':
                    document.getElementById('what-why')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '3':
                    document.getElementById('owners')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '4':
                    document.getElementById('risks')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '5':
                    document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '6':
                    document.getElementById('prs')?.scrollIntoView({ behavior: 'smooth' });
                    break;
            }
        });
        
        // Add click handlers for collapsible sections (CSP-compliant)
        document.querySelectorAll('.card-header.collapsible').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't collapse if clicking a link
                if (e.target.closest('a')) return;
                toggleSection(header);
            });
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSection(header);
                }
            });
        });
        
        // Add click handler for code preview
        document.querySelector('.code-preview-header')?.addEventListener('click', toggleCodePreview);
        document.querySelector('.code-preview-header')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCodePreview();
            }
        });
        
        // Add button click handlers (CSP-compliant)
        document.getElementById('refresh-btn')?.addEventListener('click', refresh);
        document.getElementById('copy-summary-btn')?.addEventListener('click', copySummary);
        document.getElementById('copy-ai-btn')?.addEventListener('click', copyForAI);
        document.getElementById('settings-btn')?.addEventListener('click', openSettings);
        
        // Stop propagation on GitHub link in PRs header
        document.querySelectorAll('.github-link').forEach(link => {
            link.addEventListener('click', (e) => e.stopPropagation());
        });
    </script>
</body>
</html>`;
    }

    private _generateTldr(codeAnalysis: any, categoryInfo: any): string {
        const purpose = codeAnalysis.purpose.split('.')[0]; // First sentence
        return `${categoryInfo.icon} ${purpose}`;
    }

    private _generateFullSummary(result: any, codeAnalysis: any, categoryInfo: any): string {
        const fileName = result.filePath.split('/').pop() || result.filePath;
        return `## ${fileName} (Lines ${result.startLine}-${result.endLine})

**Category:** ${categoryInfo.label}
**Purpose:** ${codeAnalysis.purpose}
${codeAnalysis.whyItExists ? `**Why it exists:** ${codeAnalysis.whyItExists}` : ''}
**Complexity:** ${codeAnalysis.complexity}
**Risks:** ${codeAnalysis.risks.length > 0 ? codeAnalysis.risks.map((r: any) => `${r.level}: ${r.description}`).join('; ') : 'None identified'}

Generated by What is the Code`;
    }

    private _generateAIContext(result: any, codeAnalysis: any, gitAnalysis: any, githubAnalysis: any, categoryInfo: any): string {
        const { fileName, parentFolder } = this._getFilePathInfo(result.filePath);
        const displayPath = parentFolder ? `${parentFolder}/${fileName}` : fileName;
        
        // Sort risks by level
        const sortedRisks = this._sortRisksByLevel(codeAnalysis.risks);
        
        let context = `# Code Context: ${displayPath}

## Overview
- **File:** \`${result.filePath}\`
- **Lines:** ${result.startLine}-${result.endLine} (${result.endLine - result.startLine + 1} lines)
- **Category:** ${categoryInfo.label} ${categoryInfo.icon}
- **Code Type:** ${codeAnalysis.codeType}
- **Complexity:** ${codeAnalysis.complexity}

## Purpose
${codeAnalysis.purpose}

${codeAnalysis.whyItExists ? `## Why This Code Exists
${codeAnalysis.whyItExists}
` : ''}
## Key Purposes
${codeAnalysis.potentialPurposes.map((p: string) => `- ${p}`).join('\n')}

## Change Risks
${sortedRisks.length > 0 ? sortedRisks.map((r: any) => `- **[${r.level.toUpperCase()}]** ${r.description}
  - 💡 ${r.recommendation}`).join('\n') : '- No significant risks identified'}
`;

        // Dependencies and exports
        if (codeAnalysis.dependencies.length > 0 || codeAnalysis.exports.length > 0) {
            context += `
## Dependencies & Exports
`;
            if (codeAnalysis.dependencies.length > 0) {
                context += `**Imports:** ${codeAnalysis.dependencies.map((d: string) => `\`${d}\``).join(', ')}
`;
            }
            if (codeAnalysis.exports.length > 0) {
                context += `**Exports:** ${codeAnalysis.exports.map((e: string) => `\`${e}\``).join(', ')}
`;
            }
        }

        // Git history
        if (gitAnalysis.commits.length > 0) {
            context += `
## Git History
- **Last Modified:** ${this._formatDate(gitAnalysis.lastModified)}
- **Created:** ${this._formatDate(gitAnalysis.createdAt)}
- **Total Changes:** ${gitAnalysis.totalChanges} commits
- **Change Frequency:** ${gitAnalysis.changeFrequency}

### Code Owners
${gitAnalysis.owners.slice(0, 5).map((o: any) => `- ${o.name} (${o.percentage}% ownership, ${o.commits} commits)`).join('\n')}

### Recent Commits
${gitAnalysis.commits.slice(0, 5).map((c: any) => `- \`${c.shortHash}\` ${c.message} — ${c.author} (${this._formatDate(c.date)})`).join('\n')}
`;
        }

        // GitHub PRs
        if (githubAnalysis.pullRequests && githubAnalysis.pullRequests.length > 0) {
            context += `
## Related Pull Requests
${githubAnalysis.pullRequests.slice(0, 5).map((pr: any) => `- [#${pr.number}](${pr.url}) ${pr.title} (${pr.state}) by @${pr.author}`).join('\n')}
`;
        }

        // The actual code
        context += `
## Code
\`\`\`${this._getLanguageFromPath(result.filePath)}
${result.code}
\`\`\`
`;

        return context;
    }

    private _getLanguageFromPath(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            'ts': 'typescript', 'tsx': 'tsx', 'js': 'javascript', 'jsx': 'jsx',
            'py': 'python', 'rb': 'ruby', 'go': 'go', 'rs': 'rust',
            'java': 'java', 'kt': 'kotlin', 'swift': 'swift', 'cs': 'csharp',
            'cpp': 'cpp', 'c': 'c', 'h': 'c', 'hpp': 'cpp',
            'php': 'php', 'vue': 'vue', 'svelte': 'svelte',
            'html': 'html', 'css': 'css', 'scss': 'scss', 'less': 'less',
            'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml',
            'md': 'markdown', 'sql': 'sql', 'sh': 'bash', 'bash': 'bash',
            'dockerfile': 'dockerfile', 'graphql': 'graphql', 'prisma': 'prisma'
        };
        return langMap[ext] || ext;
    }

    private _getOverallRiskLevel(risks: any[]): string {
        if (risks.some(r => r.level === 'critical')) return 'critical';
        if (risks.some(r => r.level === 'high')) return 'high';
        if (risks.some(r => r.level === 'medium')) return 'medium';
        return 'low';
    }

    private _getRiskEmoji(level: string): string {
        const emojis: Record<string, string> = {
            'low': '✓',
            'medium': '!',
            'high': '!!',
            'critical': '⚠'
        };
        return emojis[level] || '?';
    }

    private _getRiskTitle(level: string): string {
        const titles: Record<string, string> = {
            'low': 'Low Risk - Safe to modify',
            'medium': 'Medium Risk - Proceed with caution',
            'high': 'High Risk - Review carefully',
            'critical': 'Critical Risk - Major impact possible'
        };
        return titles[level] || 'Unknown Risk';
    }

    private _getCategoryInfo(category: MainPurposeCategory): { icon: string; label: string; color: string; description: string } {
        const categories: Record<MainPurposeCategory, { icon: string; label: string; color: string; description: string }> = {
            // Core Application Logic
            'business-logic': { icon: '💼', label: 'Business Logic', color: '#58a6ff', description: 'Core business rules and domain logic' },
            'ui-ux': { icon: '🎨', label: 'UI / UX', color: '#db61a2', description: 'User interface and experience' },
            'data-access': { icon: '🗄️', label: 'Data Access', color: '#3fb950', description: 'Database, API calls, data fetching' },
            'state-management': { icon: '🔄', label: 'State Management', color: '#bc8cff', description: 'Redux, Zustand, global state' },
            'routing': { icon: '🧭', label: 'Routing', color: '#1f6feb', description: 'Navigation, URL handling' },
            
            // User & Access
            'authentication': { icon: '🔐', label: 'Authentication', color: '#f0883e', description: 'Login, logout, session management' },
            'authorization': { icon: '🛡️', label: 'Authorization', color: '#da3633', description: 'Permissions, roles, access control' },
            
            // Data Processing
            'validation': { icon: '✅', label: 'Validation', color: '#56d364', description: 'Input validation, data sanitization' },
            'data-transform': { icon: '🔀', label: 'Data Transform', color: '#79c0ff', description: 'Parsing, serialization, mapping' },
            'search': { icon: '🔍', label: 'Search', color: '#7ee787', description: 'Search functionality, indexing' },
            
            // Communication
            'api-client': { icon: '🔌', label: 'API Client', color: '#db6d28', description: 'API wrappers, HTTP clients, SDK integrations' },
            'real-time': { icon: '📡', label: 'Real-time', color: '#8957e5', description: 'WebSocket, SSE, live updates' },
            'notification': { icon: '🔔', label: 'Notification', color: '#f9826c', description: 'Emails, push notifications, alerts' },
            'event-system': { icon: '📢', label: 'Event System', color: '#bf4b8a', description: 'Event emitters, pub/sub, message queues' },
            
            // AI & Intelligence
            'ai-ml': { icon: '🤖', label: 'AI / ML', color: '#a371f7', description: 'AI, machine learning, LLM integrations' },
            
            // Commerce
            'payment': { icon: '💳', label: 'Payment', color: '#238636', description: 'Payments, billing, subscriptions' },
            'analytics': { icon: '📊', label: 'Analytics', color: '#39d353', description: 'Tracking, metrics, reporting' },
            
            // Media & Files
            'file-handling': { icon: '📁', label: 'File Handling', color: '#54aeff', description: 'Upload, download, file processing' },
            
            // UI Enhancements
            'animation': { icon: '✨', label: 'Animation', color: '#f778ba', description: 'Animations, transitions, motion design' },
            'theming': { icon: '🌓', label: 'Theming', color: '#6e40c9', description: 'Themes, dark mode, design tokens' },
            'accessibility': { icon: '♿', label: 'Accessibility', color: '#2ea043', description: 'A11y, ARIA, keyboard navigation' },
            'localization': { icon: '🌐', label: 'Localization', color: '#0969da', description: 'i18n, translations, date/currency formats' },
            
            // Infrastructure
            'infrastructure': { icon: '⚙️', label: 'Infrastructure', color: '#8b949e', description: 'Configuration, DevOps, build tools' },
            'middleware': { icon: '🔗', label: 'Middleware', color: '#768390', description: 'Express middleware, interceptors, pipes' },
            'observability': { icon: '📈', label: 'Observability', color: '#f85149', description: 'Logging, monitoring, error tracking' },
            'scheduling': { icon: '⏰', label: 'Scheduling', color: '#d29922', description: 'Cron jobs, timers, background tasks' },
            'migration': { icon: '📦', label: 'Migration', color: '#986ee2', description: 'Database migrations, data migrations' },
            
            // Security
            'security': { icon: '🔒', label: 'Security', color: '#f85149', description: 'Encryption, CSRF, XSS protection' },
            'rate-limiting': { icon: '🚦', label: 'Rate Limiting', color: '#e3b341', description: 'Throttling, debouncing, DDoS protection' },
            
            // Code Quality & Meta
            'testing': { icon: '🧪', label: 'Testing', color: '#58a6ff', description: 'Tests, mocks, fixtures' },
            'utility': { icon: '🛠️', label: 'Utility', color: '#d29922', description: 'Helper functions, shared utilities' },
            'performance': { icon: '⚡', label: 'Performance', color: '#a371f7', description: 'Optimization, caching, lazy loading' },
            'feature-flag': { icon: '🚩', label: 'Feature Flag', color: '#cf222e', description: 'Feature toggles, A/B testing' },
            'legacy': { icon: '📜', label: 'Legacy Code', color: '#6e7681', description: 'Old code, may need refactoring' },
            
            // Other
            'geolocation': { icon: '📍', label: 'Geolocation', color: '#1a7f37', description: 'Maps, GPS, location services' },
            'unknown': { icon: '❓', label: 'Unknown', color: '#6e7681', description: 'Purpose could not be determined' }
        };
        return categories[category] || categories['unknown'];
    }

    private _escapeHtml(text: string): string {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    private _getTestTypeColor(type: string): string {
        const colors: Record<string, string> = {
            'unit': '#3fb950',      // green
            'integration': '#58a6ff', // blue
            'e2e': '#a371f7',       // purple
            'manual': '#d29922'     // yellow
        };
        return colors[type] || '#6e7681';
    }

    private _getFilePathInfo(filePath: string): { displayPath: string; fileName: string; parentFolder: string } {
        const parts = filePath.split('/').filter(p => p);
        const fileName = parts.pop() || filePath;
        const parentFolder = parts.pop() || '';
        
        // Create a display path that shows the last 2-3 meaningful parts
        const displayParts = [parentFolder, fileName].filter(p => p);
        const displayPath = displayParts.join('/');
        
        return { displayPath, fileName, parentFolder };
    }

    private _sortRisksByLevel(risks: { level: string; description: string; recommendation: string }[]): { level: string; description: string; recommendation: string }[] {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return [...risks].sort((a, b) => (order[a.level] ?? 4) - (order[b.level] ?? 4));
    }

    private _formatDate(dateStr: string): string {
        if (!dateStr || dateStr === 'Unknown') return 'Unknown';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return dateStr; }
    }

    private _hexToRgba(hex: string, alpha: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    private _formatCacheAge(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    }

    // Simple MD5 implementation for Gravatar
    private _md5(str: string): string {
        return crypto.createHash('md5').update(str).digest('hex');
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _highlightCode(code: string, filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const fileName = filePath.split('/').pop()?.toLowerCase() || '';
        const fullFileName = fileName; // For multi-extension files like .blade.php
        
        // Language detection
        const isJsTs = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext);
        const isPython = ext === 'py';
        const isRust = ext === 'rs';
        const isGo = ext === 'go';
        const isPhp = ext === 'php' && !fullFileName.endsWith('.blade.php');
        const isRuby = ['rb', 'rake', 'gemspec'].includes(ext) || fileName === 'gemfile' || fileName === 'rakefile';
        const isJava = ext === 'java';
        const isKotlin = ['kt', 'kts'].includes(ext);
        const isSwift = ext === 'swift';
        const isObjC = ['m', 'mm'].includes(ext);
        const isCpp = ['cpp', 'cc', 'cxx', 'c', 'hpp', 'hxx', 'h'].includes(ext);
        const isCSharp = ext === 'cs';
        const isScss = ['scss', 'sass'].includes(ext);
        const isCss = ext === 'css' || isScss;
        const isLess = ext === 'less';
        const isSql = ext === 'sql';
        const isShell = ['sh', 'bash', 'zsh'].includes(ext) || fileName === '.bashrc' || fileName === '.zshrc';
        const isYaml = ['yaml', 'yml'].includes(ext);
        const isHtml = ['html', 'htm', 'twig'].includes(ext) || fullFileName.endsWith('.blade.php') || fullFileName.endsWith('.twig');
        const isVue = ext === 'vue';
        const isSvelte = ext === 'svelte';
        const isGraphQL = ['graphql', 'gql'].includes(ext);
        const isDocker = fileName === 'dockerfile' || ext === 'dockerfile';
        const isElixir = ['ex', 'exs'].includes(ext);
        const isScala = ['scala', 'sc'].includes(ext);
        
        let escaped = this._escapeHtml(code);
        
        // Highlight comments (language-aware)
        if (!isCss && !isLess && !isScss) {
            escaped = escaped.replace(/(\s*\/\/.*$)/gm, '<span class="hl-comment">$1</span>');
        }
        escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
        if (isPython || isRuby || isShell || isYaml || isElixir) {
            escaped = escaped.replace(/(#.*$)/gm, '<span class="hl-comment">$1</span>');
        }
        if (isSql) {
            escaped = escaped.replace(/(--.*$)/gm, '<span class="hl-comment">$1</span>');
        }
        if (isHtml) {
            escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');
        }
        
        // Highlight strings
        escaped = escaped.replace(/(&quot;[^&]*?&quot;|&#039;[^&]*?&#039;|`[^`]*`)/g, '<span class="hl-string">$1</span>');
        
        // Highlight keywords based on language
        let keywords: string[] = [];
        if (isJsTs || isVue || isSvelte) {
            keywords = ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'import', 'export', 'from', 'default', 'new', 'this', 'try', 'catch', 'throw', 'finally', 'switch', 'case', 'break', 'continue', 'typeof', 'instanceof', 'interface', 'type', 'enum', 'implements', 'private', 'public', 'protected', 'static', 'readonly', 'abstract', 'as', 'is', 'of', 'in', 'null', 'undefined', 'true', 'false', 'void', 'never', 'any', 'unknown', 'keyof', 'infer', 'satisfies', 'declare', 'module', 'namespace', 'get', 'set', 'constructor', 'super', 'yield', 'delete', 'debugger', 'with'];
        } else if (isPython) {
            keywords = ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'lambda', 'yield', 'raise', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await', 'global', 'nonlocal', 'assert', 'del', 'exec', 'print', 'match', 'case', 'type'];
        } else if (isRust) {
            keywords = ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'return', 'if', 'else', 'match', 'for', 'while', 'loop', 'break', 'continue', 'async', 'await', 'self', 'Self', 'where', 'type', 'dyn', 'move', 'ref', 'static', 'unsafe', 'extern', 'crate', 'super', 'as', 'in', 'true', 'false', 'None', 'Some', 'Ok', 'Err', 'Box', 'Vec', 'String', 'Option', 'Result'];
        } else if (isGo) {
            keywords = ['func', 'var', 'const', 'type', 'struct', 'interface', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go', 'defer', 'select', 'chan', 'map', 'make', 'new', 'package', 'import', 'nil', 'true', 'false', 'fallthrough', 'goto', 'iota', 'error', 'string', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64', 'bool', 'byte', 'rune', 'any'];
        } else if (isPhp) {
            keywords = ['function', 'class', 'abstract', 'interface', 'trait', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'final', 'const', 'var', 'new', 'return', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'use', 'namespace', 'require', 'require_once', 'include', 'include_once', 'echo', 'print', 'array', 'null', 'true', 'false', 'and', 'or', 'xor', 'as', 'instanceof', 'global', 'isset', 'unset', 'empty', 'die', 'exit', 'list', 'callable', 'iterable', 'void', 'mixed', 'never', 'self', 'parent', 'match', 'fn', 'readonly', 'enum', 'clone', 'insteadof', 'yield', 'from'];
        } else if (isRuby) {
            keywords = ['def', 'end', 'class', 'module', 'if', 'elsif', 'else', 'unless', 'case', 'when', 'while', 'until', 'for', 'do', 'begin', 'rescue', 'ensure', 'raise', 'return', 'yield', 'break', 'next', 'redo', 'retry', 'self', 'super', 'nil', 'true', 'false', 'and', 'or', 'not', 'in', 'then', 'alias', 'defined', 'require', 'require_relative', 'include', 'extend', 'prepend', 'attr_reader', 'attr_writer', 'attr_accessor', 'private', 'protected', 'public', 'lambda', 'proc', 'new', 'initialize'];
        } else if (isJava) {
            keywords = ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'enum', 'extends', 'implements', 'new', 'this', 'super', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'short', 'byte', 'float', 'double', 'boolean', 'char', 'null', 'true', 'false', 'instanceof', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'assert', 'var', 'record', 'sealed', 'permits', 'non-sealed', 'yield'];
        } else if (isKotlin) {
            keywords = ['fun', 'val', 'var', 'class', 'object', 'interface', 'enum', 'sealed', 'data', 'open', 'abstract', 'override', 'private', 'protected', 'public', 'internal', 'companion', 'init', 'constructor', 'return', 'if', 'else', 'when', 'for', 'while', 'do', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'import', 'package', 'as', 'is', 'in', 'out', 'null', 'true', 'false', 'this', 'super', 'it', 'suspend', 'inline', 'crossinline', 'noinline', 'reified', 'lateinit', 'by', 'where', 'typealias', 'annotation', 'expect', 'actual'];
        } else if (isSwift) {
            keywords = ['func', 'var', 'let', 'class', 'struct', 'enum', 'protocol', 'extension', 'import', 'return', 'if', 'else', 'guard', 'switch', 'case', 'default', 'for', 'while', 'repeat', 'break', 'continue', 'fallthrough', 'in', 'where', 'try', 'catch', 'throw', 'throws', 'rethrows', 'do', 'defer', 'as', 'is', 'nil', 'true', 'false', 'self', 'Self', 'super', 'init', 'deinit', 'get', 'set', 'willSet', 'didSet', 'subscript', 'static', 'class', 'mutating', 'nonmutating', 'override', 'final', 'required', 'convenience', 'dynamic', 'lazy', 'optional', 'weak', 'unowned', 'private', 'fileprivate', 'internal', 'public', 'open', 'inout', 'async', 'await', 'actor', 'isolated', 'nonisolated', 'some', 'any'];
        } else if (isObjC) {
            keywords = ['@interface', '@implementation', '@end', '@property', '@synthesize', '@dynamic', '@class', '@protocol', '@optional', '@required', '@public', '@private', '@protected', '@package', '@selector', '@encode', '@synchronized', '@try', '@catch', '@finally', '@throw', '@autoreleasepool', 'self', 'super', 'nil', 'Nil', 'NULL', 'YES', 'NO', 'true', 'false', 'id', 'Class', 'SEL', 'IMP', 'BOOL', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'typedef', 'struct', 'enum', 'union', 'const', 'static', 'extern', 'inline', 'volatile', 'register', 'sizeof', 'typeof', 'instancetype', 'nullable', 'nonnull', 'NS_ASSUME_NONNULL_BEGIN', 'NS_ASSUME_NONNULL_END'];
        } else if (isCpp) {
            keywords = ['auto', 'break', 'case', 'catch', 'class', 'const', 'constexpr', 'continue', 'default', 'delete', 'do', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'for', 'friend', 'goto', 'if', 'inline', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator', 'private', 'protected', 'public', 'register', 'return', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while', 'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'wchar_t', 'char16_t', 'char32_t', 'size_t', 'nullptr_t', 'decltype', 'concept', 'requires', 'co_await', 'co_return', 'co_yield', 'consteval', 'constinit'];
        } else if (isCSharp) {
            keywords = ['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while', 'async', 'await', 'var', 'dynamic', 'yield', 'record', 'init', 'required', 'with', 'when', 'where', 'select', 'from', 'orderby', 'group', 'into', 'join', 'let', 'ascending', 'descending', 'on', 'equals', 'by'];
        } else if (isCss || isLess) {
            keywords = ['important', 'inherit', 'initial', 'unset', 'revert', 'none', 'auto', 'block', 'inline', 'flex', 'grid', 'absolute', 'relative', 'fixed', 'sticky', 'static', 'hidden', 'visible', 'scroll', 'transparent', 'currentColor', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'center', 'left', 'right', 'top', 'bottom', 'start', 'end', 'stretch', 'baseline', 'normal', 'bold', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize', 'nowrap', 'wrap', 'column', 'row', 'space-between', 'space-around', 'space-evenly'];
        } else if (isScss) {
            keywords = ['mixin', 'include', 'extend', 'import', 'use', 'forward', 'function', 'return', 'if', 'else', 'each', 'for', 'while', 'true', 'false', 'null', 'and', 'or', 'not', 'in', 'from', 'through', 'to', 'default', 'global', 'content', 'at-root', 'debug', 'warn', 'error'];
        } else if (isSql) {
            keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'AS', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'UNIQUE', 'CHECK', 'CASCADE', 'RESTRICT', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'WHILE', 'DECLARE', 'CURSOR', 'FETCH', 'CLOSE', 'OPEN', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'VARCHAR', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'BOOLEAN', 'TEXT', 'BLOB', 'JSON', 'JSONB', 'ARRAY', 'SERIAL', 'AUTO_INCREMENT', 'RETURNING', 'WITH', 'RECURSIVE', 'CTE', 'PARTITION', 'OVER', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE', 'NTILE'];
        } else if (isShell) {
            keywords = ['if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until', 'do', 'done', 'in', 'function', 'return', 'exit', 'break', 'continue', 'local', 'export', 'readonly', 'declare', 'typeset', 'unset', 'shift', 'source', 'alias', 'unalias', 'set', 'shopt', 'trap', 'eval', 'exec', 'wait', 'true', 'false', 'test', 'echo', 'printf', 'read', 'cd', 'pwd', 'pushd', 'popd', 'dirs', 'let', 'expr', 'getopts', 'select', 'time', 'coproc', 'mapfile', 'readarray'];
        } else if (isYaml) {
            keywords = ['true', 'false', 'null', 'yes', 'no', 'on', 'off'];
        } else if (isHtml) {
            keywords = ['html', 'head', 'body', 'div', 'span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'img', 'video', 'audio', 'canvas', 'svg', 'path', 'script', 'style', 'link', 'meta', 'title', 'header', 'footer', 'nav', 'main', 'section', 'article', 'aside', 'figure', 'figcaption', 'template', 'slot', 'iframe', 'br', 'hr', 'pre', 'code', 'blockquote', 'strong', 'em', 'small', 'mark', 'del', 'ins', 'sub', 'sup'];
        } else if (isGraphQL) {
            keywords = ['query', 'mutation', 'subscription', 'fragment', 'on', 'type', 'interface', 'union', 'enum', 'scalar', 'input', 'directive', 'extend', 'schema', 'implements', 'true', 'false', 'null', 'Int', 'Float', 'String', 'Boolean', 'ID'];
        } else if (isDocker) {
            keywords = ['FROM', 'AS', 'RUN', 'CMD', 'ENTRYPOINT', 'EXPOSE', 'ENV', 'ARG', 'ADD', 'COPY', 'VOLUME', 'WORKDIR', 'USER', 'LABEL', 'MAINTAINER', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL', 'NONE'];
        } else if (isElixir) {
            keywords = ['def', 'defp', 'defmodule', 'defmacro', 'defmacrop', 'defstruct', 'defprotocol', 'defimpl', 'defexception', 'defdelegate', 'defguard', 'defguardp', 'do', 'end', 'fn', 'if', 'else', 'unless', 'case', 'cond', 'with', 'for', 'receive', 'after', 'try', 'catch', 'rescue', 'raise', 'throw', 'exit', 'spawn', 'send', 'import', 'require', 'alias', 'use', 'quote', 'unquote', 'true', 'false', 'nil', 'and', 'or', 'not', 'in', 'when', 'is_atom', 'is_binary', 'is_boolean', 'is_float', 'is_function', 'is_integer', 'is_list', 'is_map', 'is_nil', 'is_number', 'is_pid', 'is_port', 'is_reference', 'is_tuple'];
        } else if (isScala) {
            keywords = ['abstract', 'case', 'catch', 'class', 'def', 'do', 'else', 'extends', 'false', 'final', 'finally', 'for', 'forSome', 'if', 'implicit', 'import', 'lazy', 'match', 'new', 'null', 'object', 'override', 'package', 'private', 'protected', 'return', 'sealed', 'super', 'this', 'throw', 'trait', 'true', 'try', 'type', 'val', 'var', 'while', 'with', 'yield', 'given', 'using', 'then', 'enum', 'export', 'derives', 'end', 'inline', 'opaque', 'open', 'transparent', 'as'];
        } else {
            keywords = ['function', 'class', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'const', 'let', 'var', 'new', 'this', 'try', 'catch', 'throw', 'true', 'false', 'null', 'undefined'];
        }
        
        for (const kw of keywords) {
            const regex = new RegExp(`\\b(${kw})\\b`, isSql ? 'gi' : 'g');
            escaped = escaped.replace(regex, '<span class="hl-keyword">$1</span>');
        }
        
        // Highlight numbers
        escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');
        
        // Highlight function calls (except for CSS/HTML)
        if (!isCss && !isHtml && !isYaml && !isLess && !isScss) {
            escaped = escaped.replace(/(\w+)(?=\s*\()/g, '<span class="hl-function">$1</span>');
        }
        
        return escaped;
    }
}
