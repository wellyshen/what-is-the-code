import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import { CodeAnalysisResult, CodeType, ComplexityLevel, RiskAssessment, CommitInfo, MainPurposeCategory } from '../types';
import { getClaudeApiKey } from '../extension';
import { withRetry, withTimeout } from '../utils/retry';
import { MAX_CODE_LENGTH_FOR_AI, CLAUDE_API_TIMEOUT_MS, API_MAX_RETRIES, ErrorMessages } from '../utils/constants';

export class CodeAnalyzer {
    private anthropic: Anthropic | null = null;
    private lastApiKey: string = '';

    private async getClient(): Promise<Anthropic | null> {
        // Use secure storage first, fallback to settings
        const apiKey = await getClaudeApiKey();
        
        if (!apiKey) {
            return null;
        }

        // Recreate client if API key changed
        if (!this.anthropic || this.lastApiKey !== apiKey) {
            this.anthropic = new Anthropic({ apiKey });
            this.lastApiKey = apiKey;
        }
        return this.anthropic;
    }

    async analyze(code: string, filePath: string, commits?: CommitInfo[]): Promise<CodeAnalysisResult> {
        const client = await this.getClient();
        
        if (client) {
            try {
                // Use retry logic for transient failures
                return await withRetry(
                    () => this.analyzeWithClaude(client, code, filePath, commits),
                    {
                        maxAttempts: API_MAX_RETRIES,
                        onRetry: (error, attempt) => {
                            console.log(`Claude API retry attempt ${attempt}: ${error.message}`);
                        }
                    }
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                console.error('Claude analysis failed, falling back to static analysis:', errorMsg);
                vscode.window.showWarningMessage(`${ErrorMessages.CLAUDE_API_FAILED} (${errorMsg})`);
                return this.analyzeStatic(code, filePath);
            }
        } else {
            const action = await vscode.window.showInformationMessage(
                'Claude API key not configured. Set it securely for AI-powered analysis.',
                'Set API Key',
                'Use Static Analysis'
            );
            if (action === 'Set API Key') {
                vscode.commands.executeCommand('whatIsTheCode.setClaudeApiKey');
            }
            return this.analyzeStatic(code, filePath);
        }
    }

    private async analyzeWithClaude(
        client: Anthropic, 
        code: string, 
        filePath: string,
        commits?: CommitInfo[]
    ): Promise<CodeAnalysisResult> {
        const config = vscode.workspace.getConfiguration('whatIsTheCode');
        const model = config.get<string>('claudeModel', 'claude-sonnet-4-20250514');
        
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath);
        
        // Prepare commit context
        const commitContext = commits && commits.length > 0 
            ? `\n\nRecent commit history (showing why this code evolved):\n${commits.slice(0, 10).map(c => 
                `- ${c.shortHash}: "${c.message}" by ${c.author} on ${c.date}`
            ).join('\n')}`
            : '';

        const prompt = `Analyze this code and provide a detailed understanding of it. Return your analysis as a JSON object.

File: ${fileName} (${ext})
${commitContext}

Code to analyze:
\`\`\`
${code.substring(0, MAX_CODE_LENGTH_FOR_AI)}
\`\`\`

Provide your analysis as a JSON object with this exact structure:
{
    "purpose": "A clear 1-2 sentence summary of what this code does and why it exists",
    "mainPurposeCategory": "Choose the most appropriate category from the list below",
    "codeType": "one of: function, class, component, module, configuration, test, utility, api, unknown",
    "complexity": "one of: low, medium, high, very-high",
    "dependencies": ["list of imports/dependencies used"],
    "exports": ["list of exported functions/classes/variables"],
    "potentialPurposes": [
        "Primary business/technical purpose",
        "Secondary purpose if any",
        "Any UX purposes"
    ],
    "whyItExists": "Explain why this code likely exists - what business need, UX requirement, or technical necessity it addresses.",
    "risks": [
        {
            "level": "one of: low, medium, high, critical",
            "description": "What could go wrong if this code is changed",
            "recommendation": "How to safely modify this code"
        }
    ],
    "suggestedTests": [
        {
            "type": "one of: unit, integration, e2e, manual",
            "description": "Specific test case or validation step to ensure this code works correctly",
            "priority": "one of: high, medium, low",
            "reason": "Why this test type is the best choice (e.g., 'Unit test is ideal for isolated pure function logic', 'Integration test needed to verify API interaction', 'E2E test required for critical user flow')"
        }
    ]
}

TEST TYPE SELECTION GUIDE - Choose the most appropriate test type:
- "unit": Best for pure functions, utilities, data transformations, isolated logic with no external dependencies
- "integration": Best for code that interacts with APIs, databases, external services, or multiple modules together
- "e2e": Best for critical user journeys, UI workflows, multi-step processes that span the entire application
- "manual": Best for visual verification, UX review, accessibility checks, or scenarios hard to automate
}

CATEGORIES - Choose the SINGLE most appropriate mainPurposeCategory:

Core Application:
- "business-logic": Core business rules, domain logic, workflows
- "ui-ux": User interface, components, styling, UX
- "data-access": Database, API calls, data fetching, ORM
- "state-management": Redux, Zustand, context, global state
- "routing": Navigation, URL handling, route guards

User & Access:
- "authentication": Login, logout, session, OAuth, SSO
- "authorization": Permissions, roles, access control, RBAC

Data Processing:
- "validation": Input validation, schema validation, sanitization
- "data-transform": Parsing, serialization, mapping, formatting
- "search": Search, indexing, filtering, pagination

Communication:
- "api-client": API wrappers, HTTP clients, SDK integrations
- "real-time": WebSocket, SSE, live updates, chat
- "notification": Emails, push, SMS, in-app alerts
- "event-system": Event emitters, pub/sub, message queues

AI & Intelligence:
- "ai-ml": AI, ML, LLM, embeddings, recommendations

Commerce:
- "payment": Payments, billing, subscriptions, checkout
- "analytics": Tracking, metrics, reporting, dashboards

Media & Files:
- "file-handling": Upload, download, file/image/video processing

UI Enhancements:
- "animation": Animations, transitions, motion design
- "theming": Themes, dark mode, design tokens
- "accessibility": A11y, ARIA, keyboard nav, screen readers
- "localization": i18n, translations, RTL, date/currency formats

Infrastructure:
- "infrastructure": Config, build tools, Docker, CI/CD
- "middleware": Express middleware, interceptors, pipes
- "observability": Logging, monitoring, error tracking, debugging
- "scheduling": Cron jobs, timers, background tasks, workers
- "migration": Database migrations, data migrations

Security:
- "security": Encryption, CSRF, XSS, security headers
- "rate-limiting": Throttling, debouncing, DDoS protection

Code Quality & Meta:
- "testing": Unit tests, integration tests, e2e, mocks
- "utility": Helper functions, shared utilities, libs
- "performance": Optimization, caching, lazy loading, memoization
- "feature-flag": Feature toggles, A/B testing, experiments
- "legacy": Deprecated code, tech debt, needs refactoring

Other:
- "geolocation": Maps, GPS, location services
- "unknown": Cannot determine purpose

Be specific and practical. Focus on helping a developer understand:
1. What this code actually does (not just syntax)
2. Why it was likely written (business/UX/technical reasons)
3. What could break if it's changed
4. Who should be consulted before changes

Return ONLY the JSON object, no markdown formatting or additional text.`;

        // Wrap the API call with timeout
        const response = await withTimeout(
            client.messages.create({
                model,
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }]
            }),
            CLAUDE_API_TIMEOUT_MS,
            'Claude API request timed out'
        );

        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type');
        }

        // Parse the JSON response
        let analysis;
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Claude response:', content.text);
            throw new Error('Failed to parse Claude analysis');
        }

        // Map to our types with validation
        return {
            purpose: analysis.purpose || 'Unable to determine purpose',
            mainPurposeCategory: this.validateMainPurposeCategory(analysis.mainPurposeCategory),
            codeType: this.validateCodeType(analysis.codeType),
            complexity: this.validateComplexity(analysis.complexity),
            dependencies: Array.isArray(analysis.dependencies) ? analysis.dependencies : [],
            exports: Array.isArray(analysis.exports) ? analysis.exports : [],
            potentialPurposes: Array.isArray(analysis.potentialPurposes) ? analysis.potentialPurposes : [],
            whyItExists: analysis.whyItExists || undefined,
            risks: this.validateRisks(analysis.risks),
            suggestedTests: this.validateSuggestedTests(analysis.suggestedTests)
        };
    }

    private validateMainPurposeCategory(category: string): MainPurposeCategory {
        const validCategories: MainPurposeCategory[] = [
            'business-logic', 'ui-ux', 'data-access', 'state-management', 'routing',
            'authentication', 'authorization',
            'validation', 'data-transform', 'search',
            'api-client', 'real-time', 'notification', 'event-system',
            'ai-ml',
            'payment', 'analytics',
            'file-handling',
            'animation', 'theming', 'accessibility', 'localization',
            'infrastructure', 'middleware', 'observability', 'scheduling', 'migration',
            'security', 'rate-limiting',
            'testing', 'utility', 'performance', 'feature-flag', 'legacy',
            'geolocation', 'unknown'
        ];
        return validCategories.includes(category as MainPurposeCategory) ? category as MainPurposeCategory : 'unknown';
    }

    private validateCodeType(type: string): CodeType {
        const validTypes: CodeType[] = ['function', 'class', 'component', 'module', 'configuration', 'test', 'utility', 'api', 'unknown'];
        return validTypes.includes(type as CodeType) ? type as CodeType : 'unknown';
    }

    private validateComplexity(complexity: string): ComplexityLevel {
        const validLevels: ComplexityLevel[] = ['low', 'medium', 'high', 'very-high'];
        return validLevels.includes(complexity as ComplexityLevel) ? complexity as ComplexityLevel : 'medium';
    }

    private validateRisks(risks: any[]): RiskAssessment[] {
        if (!Array.isArray(risks)) {
            return [{
                level: 'low',
                description: 'No specific risks identified',
                recommendation: 'Standard testing practices should be sufficient'
            }];
        }

        return risks.map(risk => ({
            level: ['low', 'medium', 'high', 'critical'].includes(risk.level) ? risk.level : 'medium',
            description: risk.description || 'Risk identified',
            recommendation: risk.recommendation || 'Review carefully before changes'
        }));
    }

    private validateSuggestedTests(tests: any[]): { type: 'unit' | 'integration' | 'e2e' | 'manual'; description: string; priority: 'high' | 'medium' | 'low'; reason?: string }[] {
        if (!Array.isArray(tests)) {
            return [];
        }

        const validTypes = ['unit', 'integration', 'e2e', 'manual'];
        const validPriorities = ['high', 'medium', 'low'];
        const priorityOrder = { high: 0, medium: 1, low: 2 };

        const validatedTests = tests.map(test => ({
            type: validTypes.includes(test.type) ? test.type : 'unit',
            description: test.description || 'Test case',
            priority: validPriorities.includes(test.priority) ? test.priority : 'medium',
            reason: test.reason || undefined
        })) as { type: 'unit' | 'integration' | 'e2e' | 'manual'; description: string; priority: 'high' | 'medium' | 'low'; reason?: string }[];

        // Remove duplicates based on type and normalized description
        const seen = new Set<string>();
        const uniqueTests = validatedTests.filter(test => {
            const key = `${test.type}:${test.description.toLowerCase().trim()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

        // Sort by priority (high -> medium -> low)
        return uniqueTests.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }

    // Fallback static analysis (original implementation)
    private analyzeStatic(code: string, filePath: string): CodeAnalysisResult {
        const codeType = this.detectCodeType(code, filePath);
        const complexity = this.calculateComplexity(code);
        const dependencies = this.extractDependencies(code);
        const exports = this.extractExports(code);
        const potentialPurposes = this.inferPurposes(code, filePath, codeType);
        const risks = this.assessRisks(code, complexity, dependencies);
        const purpose = this.generatePurposeSummary(codeType, potentialPurposes);
        const mainPurposeCategory = this.inferMainPurposeCategory(code, filePath, codeType);

        return {
            purpose,
            mainPurposeCategory,
            codeType,
            complexity,
            dependencies,
            exports,
            potentialPurposes,
            risks
        };
    }

    private inferMainPurposeCategory(code: string, filePath: string, codeType: CodeType): MainPurposeCategory {
        const fileName = path.basename(filePath).toLowerCase();
        const lowerCode = code.toLowerCase();

        // Testing
        if (codeType === 'test' || fileName.includes('test') || fileName.includes('spec') || 
            fileName.includes('mock') || fileName.includes('fixture')) {
            return 'testing';
        }

        // Authentication
        if (lowerCode.includes('auth') || lowerCode.includes('login') || lowerCode.includes('password') ||
            lowerCode.includes('token') || lowerCode.includes('session') || lowerCode.includes('oauth') ||
            fileName.includes('auth') || fileName.includes('login')) {
            return 'authentication';
        }

        // Security
        if (lowerCode.includes('encrypt') || lowerCode.includes('csrf') || lowerCode.includes('xss') ||
            lowerCode.includes('sanitize') || lowerCode.includes('security')) {
            return 'security';
        }

        // Infrastructure/Config
        if (codeType === 'configuration' || fileName.includes('config') || fileName.includes('webpack') ||
            fileName.includes('babel') || fileName.includes('eslint') || fileName.includes('docker') ||
            fileName.includes('ci') || fileName.includes('env')) {
            return 'infrastructure';
        }

        // UI/UX
        if (codeType === 'component' || lowerCode.includes('render') || lowerCode.includes('style') ||
            lowerCode.includes('animation') || lowerCode.includes('css') || lowerCode.includes('theme') ||
            fileName.includes('component') || fileName.includes('view') || fileName.includes('page') ||
            fileName.includes('style') || fileName.includes('ui')) {
            return 'ui-ux';
        }

        // Data Access
        if (lowerCode.includes('fetch') || lowerCode.includes('axios') || lowerCode.includes('query') ||
            lowerCode.includes('database') || lowerCode.includes('repository') || lowerCode.includes('api') ||
            lowerCode.includes('graphql') || lowerCode.includes('prisma') || lowerCode.includes('mongoose') ||
            fileName.includes('api') || fileName.includes('service') || fileName.includes('repository')) {
            return 'data-access';
        }

        // API Client / Integrations
        if (lowerCode.includes('webhook') || lowerCode.includes('stripe') || lowerCode.includes('aws') ||
            lowerCode.includes('firebase') || lowerCode.includes('twilio') || lowerCode.includes('slack') ||
            fileName.includes('integration') || fileName.includes('plugin')) {
            return 'api-client';
        }

        // Performance
        if (lowerCode.includes('cache') || lowerCode.includes('memo') || lowerCode.includes('lazy') ||
            lowerCode.includes('debounce') || lowerCode.includes('throttle') || lowerCode.includes('optimize')) {
            return 'performance';
        }

        // Legacy indicators
        if (lowerCode.includes('deprecated') || lowerCode.includes('todo:') || lowerCode.includes('fixme') ||
            lowerCode.includes('hack') || lowerCode.includes('workaround') || lowerCode.includes('legacy') ||
            code.includes('var ')) {
            return 'legacy';
        }

        // Utility
        if (codeType === 'utility' || fileName.includes('util') || fileName.includes('helper') ||
            fileName.includes('common') || fileName.includes('shared')) {
            return 'utility';
        }

        // Business Logic (default for complex logic)
        if (codeType === 'class' || codeType === 'function' || codeType === 'module') {
            return 'business-logic';
        }

        return 'unknown';
    }

    private detectCodeType(code: string, filePath: string): CodeType {
        const fileName = path.basename(filePath).toLowerCase();

        if (fileName.includes('.test.') || fileName.includes('.spec.') || 
            fileName.includes('_test.') || code.includes('describe(') && code.includes('it(')) {
            return 'test';
        }

        const configPatterns = ['config', '.rc', 'settings', '.json', '.yaml', '.yml', '.toml'];
        if (configPatterns.some(p => fileName.includes(p))) {
            return 'configuration';
        }

        if (code.includes('React') || code.includes('jsx') || code.includes('<template>') ||
            code.includes('@Component') || code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*return\s*\(/)) {
            return 'component';
        }

        if (code.match(/class\s+\w+/)) {
            return 'class';
        }

        if (code.includes('router.') || code.includes('app.get') || code.includes('app.post') ||
            code.includes('@Get') || code.includes('@Post') || code.includes('fetch(') ||
            code.includes('axios') || code.includes('http.')) {
            return 'api';
        }

        if (code.match(/^(export\s+)?(const|function)\s+\w+/m) && !code.includes('class ')) {
            const functionCount = (code.match(/function\s+\w+|const\s+\w+\s*=\s*(\([^)]*\)|[^=]+)\s*=>/g) || []).length;
            if (functionCount > 0 && functionCount <= 3) {
                return 'utility';
            }
        }

        if (code.includes('module.exports') || code.includes('export default') || code.includes('export {')) {
            return 'module';
        }

        if (code.match(/^(async\s+)?function\s+\w+/m) || code.match(/^const\s+\w+\s*=\s*(async\s+)?\(/m)) {
            return 'function';
        }

        return 'unknown';
    }

    private calculateComplexity(code: string): ComplexityLevel {
        let complexity = 0;

        const controlStructures = (code.match(/\b(if|else|for|while|switch|case|try|catch)\b/g) || []).length;
        complexity += controlStructures * 1;

        const maxNesting = this.calculateMaxNesting(code);
        complexity += maxNesting * 2;

        const functions = (code.match(/function\s+\w+|\w+\s*=\s*(\([^)]*\)|[^=]+)\s*=>/g) || []).length;
        complexity += functions * 0.5;

        const logicalOps = (code.match(/&&|\|\||\?.*:/g) || []).length;
        complexity += logicalOps * 0.5;

        const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
        complexity += lines * 0.1;

        if (complexity < 10) return 'low';
        if (complexity < 25) return 'medium';
        if (complexity < 50) return 'high';
        return 'very-high';
    }

    private calculateMaxNesting(code: string): number {
        let maxDepth = 0;
        let currentDepth = 0;

        for (const char of code) {
            if (char === '{') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === '}') {
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }

        return maxDepth;
    }

    private extractDependencies(code: string): string[] {
        const dependencies: Set<string> = new Set();

        const importMatches = code.matchAll(/import\s+(?:(?:\{[^}]+\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
            dependencies.add(match[1]);
        }

        const requireMatches = code.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of requireMatches) {
            dependencies.add(match[1]);
        }

        return Array.from(dependencies);
    }

    private extractExports(code: string): string[] {
        const exports: Set<string> = new Set();

        const namedExportMatches = code.matchAll(/export\s+(?:const|let|var|function|class|async function)\s+(\w+)/g);
        for (const match of namedExportMatches) {
            exports.add(match[1]);
        }

        const exportListMatch = code.match(/export\s+\{([^}]+)\}/);
        if (exportListMatch) {
            const names = exportListMatch[1].split(',').map(s => s.trim().split(' ')[0]);
            names.forEach(n => exports.add(n));
        }

        if (code.includes('export default')) {
            exports.add('default');
        }

        const moduleExportsMatch = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
        if (moduleExportsMatch) {
            const names = moduleExportsMatch[1].split(',').map(s => s.trim().split(':')[0].trim());
            names.forEach(n => exports.add(n));
        }

        return Array.from(exports);
    }

    private inferPurposes(code: string, filePath: string, codeType: CodeType): string[] {
        const purposes: string[] = [];
        const fileName = path.basename(filePath).toLowerCase();

        switch (codeType) {
            case 'test':
                purposes.push('Testing and quality assurance');
                break;
            case 'configuration':
                purposes.push('Application or tool configuration');
                break;
            case 'component':
                purposes.push('UI component for user interface');
                break;
            case 'api':
                purposes.push('API endpoint or data fetching');
                break;
            case 'utility':
                purposes.push('Reusable utility function(s)');
                break;
        }

        if (code.includes('authentication') || code.includes('login') || code.includes('auth')) {
            purposes.push('User authentication/authorization');
        }
        if (code.includes('validate') || code.includes('validation') || code.includes('schema')) {
            purposes.push('Data validation');
        }
        if (code.includes('database') || code.includes('query') || code.includes('mongoose') || code.includes('prisma')) {
            purposes.push('Database operations');
        }
        if (code.includes('cache') || code.includes('memo')) {
            purposes.push('Performance optimization/caching');
        }
        if (code.includes('error') || code.includes('catch') || code.includes('throw')) {
            purposes.push('Error handling');
        }

        return [...new Set(purposes)];
    }

    private assessRisks(code: string, complexity: ComplexityLevel, dependencies: string[]): RiskAssessment[] {
        const risks: RiskAssessment[] = [];

        if (complexity === 'high' || complexity === 'very-high') {
            risks.push({
                level: complexity === 'very-high' ? 'high' : 'medium',
                description: 'High code complexity makes changes error-prone',
                recommendation: 'Consider refactoring into smaller, more focused functions'
            });
        }

        if (dependencies.length > 10) {
            risks.push({
                level: 'medium',
                description: `High number of dependencies (${dependencies.length})`,
                recommendation: 'Changes may have cascading effects. Review import usage carefully.'
            });
        }

        if (code.includes('window.') || code.includes('global.') || code.includes('globalThis.')) {
            risks.push({
                level: 'high',
                description: 'Modifies global state',
                recommendation: 'Global state changes can cause hard-to-debug issues.'
            });
        }

        if (code.includes('eval(') || code.includes('innerHTML')) {
            risks.push({
                level: 'critical',
                description: 'Potential security vulnerability (eval/innerHTML)',
                recommendation: 'These patterns can lead to XSS attacks. Use safer alternatives.'
            });
        }

        if (risks.length === 0) {
            risks.push({
                level: 'low',
                description: 'No significant risks detected',
                recommendation: 'Standard testing practices should be sufficient for changes.'
            });
        }

        return risks.sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.level] - order[b.level];
        });
    }

    private generatePurposeSummary(codeType: CodeType, purposes: string[]): string {
        const typeDescriptions: Record<CodeType, string> = {
            function: 'A function',
            class: 'A class',
            component: 'A UI component',
            module: 'A module',
            configuration: 'Configuration code',
            test: 'Test code',
            utility: 'Utility code',
            api: 'API-related code',
            unknown: 'Code'
        };

        const baseDesc = typeDescriptions[codeType];
        
        if (purposes.length === 0) {
            return `${baseDesc} with general functionality.`;
        }

        if (purposes.length === 1) {
            return `${baseDesc} that handles ${purposes[0].toLowerCase()}.`;
        }

        const mainPurpose = purposes[0].toLowerCase();
        const otherPurposes = purposes.slice(1, 3).map(p => p.toLowerCase()).join(' and ');
        
        return `${baseDesc} primarily for ${mainPurpose}, also involving ${otherPurposes}.`;
    }
}
