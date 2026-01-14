// Types for What is the Code extension

export interface AnalysisResult {
    filePath: string;
    startLine: number;
    endLine: number;
    code: string;
    codeAnalysis: CodeAnalysisResult;
    gitAnalysis: GitAnalysisResult;
    githubAnalysis: GitHubAnalysisResult;
    analyzedAt: string;
    fromCache?: boolean;
    cacheAge?: number;
}

export interface CodeAnalysisResult {
    purpose: string;
    mainPurposeCategory: MainPurposeCategory;
    codeType: CodeType;
    complexity: ComplexityLevel;
    dependencies: string[];
    exports: string[];
    potentialPurposes: string[];
    whyItExists?: string;
    risks: RiskAssessment[];
    suggestedTests?: SuggestedTest[];
}

export interface SuggestedTest {
    type: 'unit' | 'integration' | 'e2e' | 'manual';
    description: string;
    priority: 'high' | 'medium' | 'low';
    reason?: string; // Why this test method is best suited for this case
}

export type MainPurposeCategory = 
    // Core Application Logic
    | 'business-logic'      // Core business rules, domain logic, workflows
    | 'ui-ux'               // User interface, components, styling, UX
    | 'data-access'         // Database, API calls, data fetching, ORM
    | 'state-management'    // Redux, Zustand, context, global state
    | 'routing'             // Navigation, URL handling, route guards
    
    // User & Access
    | 'authentication'      // Login, logout, session, OAuth, SSO
    | 'authorization'       // Permissions, roles, access control, RBAC
    
    // Data Processing
    | 'validation'          // Input validation, schema validation, sanitization
    | 'data-transform'      // Parsing, serialization, mapping, formatting
    | 'search'              // Search, indexing, filtering, pagination
    
    // Communication
    | 'api-client'          // API wrappers, HTTP clients, SDK integrations
    | 'real-time'           // WebSocket, SSE, live updates, chat
    | 'notification'        // Emails, push, SMS, in-app alerts
    | 'event-system'        // Event emitters, pub/sub, message queues
    
    // AI & Intelligence
    | 'ai-ml'               // AI, ML, LLM, embeddings, recommendations
    
    // Commerce
    | 'payment'             // Payments, billing, subscriptions, checkout
    | 'analytics'           // Tracking, metrics, reporting, dashboards
    
    // Media & Files
    | 'file-handling'       // Upload, download, file/image/video processing
    
    // UI Enhancements
    | 'animation'           // Animations, transitions, motion design
    | 'theming'             // Themes, dark mode, design tokens
    | 'accessibility'       // A11y, ARIA, keyboard nav, screen readers
    | 'localization'        // i18n, translations, RTL, date/currency formats
    
    // Infrastructure
    | 'infrastructure'      // Config, setup, build tools, bundling
    | 'middleware'          // Express middleware, interceptors, pipes
    | 'observability'       // Logging, monitoring, error tracking, debugging
    | 'scheduling'          // Cron jobs, timers, background tasks, workers
    | 'migration'           // Database migrations, data migrations
    
    // Security
    | 'security'            // Encryption, CSRF, XSS, security headers
    | 'rate-limiting'       // Throttling, debouncing, DDoS protection
    
    // Code Quality & Meta
    | 'testing'             // Unit tests, integration tests, e2e, mocks
    | 'utility'             // Helper functions, shared utilities, libs
    | 'performance'         // Optimization, caching, lazy loading, memoization
    | 'feature-flag'        // Feature toggles, A/B testing, experiments
    | 'legacy'              // Deprecated code, tech debt, needs refactoring
    
    // Other
    | 'geolocation'         // Maps, GPS, location services
    | 'unknown';

export type CodeType = 
    | 'function'
    | 'class'
    | 'component'
    | 'module'
    | 'configuration'
    | 'test'
    | 'utility'
    | 'api'
    | 'unknown';

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'very-high';

export interface RiskAssessment {
    level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
}

export interface GitAnalysisResult {
    commits: CommitInfo[];
    owners: CodeOwner[];
    lastModified: string;
    createdAt: string;
    totalChanges: number;
    changeFrequency: string;
}

export interface CommitInfo {
    hash: string;
    shortHash: string;
    author: string;
    authorEmail: string;
    date: string;
    message: string;
    linesChanged: number;
}

export interface CodeOwner {
    name: string;
    email: string;
    commits: number;
    linesChanged: number;
    percentage: number;
    lastContribution: string;
}

export interface GitHubAnalysisResult {
    repoUrl: string | null;
    pullRequests: PullRequestInfo[];
    error?: string;
}

export interface PullRequestInfo {
    number: number;
    title: string;
    url: string;
    author: string;
    state: 'open' | 'closed' | 'merged';
    createdAt: string;
    mergedAt: string | null;
    description: string;
    labels: string[];
}
