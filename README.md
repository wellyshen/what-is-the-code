# What is the Code

A powerful VS Code/Cursor extension that helps developers understand unfamiliar code instantly. Get AI-powered insights about what code does, why it exists, who owns it, and the risks of changing it.

![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![Cursor](https://img.shields.io/badge/Cursor-Compatible-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🤖 AI-Powered Code Analysis
- **What it does** - Claude AI analyzes code to explain its purpose in plain language
- **Why it exists** - Understand the business need, UX requirement, or technical necessity
- **Purpose Categories** - Auto-categorized into 35+ categories (Authentication, UI/UX, Data Access, etc.)
- **Suggested Tests** - AI recommends appropriate test types (unit, integration, e2e, manual)

### 👥 Code Ownership
- See who contributed to the code and their ownership percentage
- View contribution history with commit counts
- Identify the right person to ask about changes

### ⚠️ Risk Assessment
- Visual risk meter (Low → Critical)
- Specific risks identified with descriptions
- Actionable recommendations for safe modifications

### 🔗 GitHub Integration
- Related pull requests linked to the code
- PR titles, authors, labels, and merge status
- Direct links to view PRs on GitHub

### 📊 Beautiful Dashboard
- Clean, modern UI with dark theme
- Collapsible sections for easy navigation
- Quick stats overview (lines, contributors, commits, PRs)
- Copy summary to clipboard or export for AI chat
- Keyboard shortcuts for power users

### ⚡ Smart Caching
- Results cached for 30 minutes (configurable)
- Auto-invalidates when code changes
- Refresh button for fresh analysis

### 🌐 Multi-Language Support
Syntax highlighting for 25+ languages including:
- JavaScript/TypeScript, PHP, Python, Ruby, Go, Rust
- Swift, Kotlin, Java, C/C++, C#
- HTML, CSS/SCSS/LESS, Vue, Svelte
- SQL, Shell/Bash, YAML, GraphQL, Docker, and more

---

## 📦 Installation

### Option 1: Install from VSIX (Recommended)

1. Download the `.vsix` file
2. Open VS Code or Cursor
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type **"Install from VSIX"** and select it
5. Browse to the downloaded `.vsix` file
6. Reload when prompted

### Option 2: Build from Source

```bash
# Clone the repository
git clone <repository-url>
cd what-is-the-code

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as VSIX
npm run package
```

---

## ⚙️ Setup

### 1. Set Claude API Key (Required for AI Analysis)

The extension uses Claude AI for intelligent code analysis. Without an API key, it falls back to basic static analysis.

**Secure Setup (Recommended):**
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **"What is the Code: Set Claude API Key"**
3. Paste your API key (stored securely in VS Code's credential store)

**Get an API Key:**
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Click "Create Key"
5. Copy the key (starts with `sk-`)

### 2. Set GitHub Token (Optional, for PR Features)

To see related pull requests, you need a GitHub Personal Access Token.

**Secure Setup (Recommended):**
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **"What is the Code: Set GitHub Token"**
3. Paste your token (stored securely)

**Create a Token:**
1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a name like "What is the Code - VS Code"
4. Select scopes:
   - `public_repo` - for public repositories
   - `repo` - for private repositories (if needed)
5. Click "Generate token" and copy it

> **Note:** The extension only **reads** PR information. It cannot create, modify, or delete anything.

---

## 🚀 Usage

### Analyze Selected Code
1. Select some code in the editor
2. Either:
   - Right-click → **"What is the Code: Analyze Selection"**
   - Press `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Windows/Linux)
3. View the analysis in the dashboard panel

### Analyze Entire File
1. Open a file
2. Either:
   - Right-click → **"What is the Code: Analyze Current File"**
   - Press `Cmd+Shift+Alt+A` (Mac) / `Ctrl+Shift+Alt+A` (Windows/Linux)

### Dashboard Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `R` | Refresh analysis |
| `C` | Toggle code preview |
| `1-6` | Jump to section |
| `?` | Show shortcuts help |

### Commands
| Command | Description |
|---------|-------------|
| `What is the Code: Analyze Selection` | Analyze selected code |
| `What is the Code: Analyze Current File` | Analyze the entire file |
| `What is the Code: Set Claude API Key` | Securely store Claude API key |
| `What is the Code: Set GitHub Token` | Securely store GitHub token |
| `What is the Code: Clear Cache` | Clear all cached analysis results |
| `What is the Code: Refresh` | Re-analyze with fresh data |

---

## 🔧 Configuration

Open VS Code Settings (`Cmd+,` / `Ctrl+,`) and search for "What is the Code":

| Setting | Description | Default |
|---------|-------------|---------|
| `whatIsTheCode.claudeModel` | Claude model for analysis | `claude-sonnet-4-20250514` |
| `whatIsTheCode.maxCommitHistory` | Max commits to analyze | `50` |
| `whatIsTheCode.maxPRsToShow` | Max PRs to display | `10` |
| `whatIsTheCode.cacheTtlMinutes` | Cache duration in minutes | `30` |

### Available Claude Models
- `claude-sonnet-4-20250514` - Best balance of speed and capability (default)
- `claude-opus-4-20250514` - Most capable model
- `claude-3-7-sonnet-20250219` - Enhanced reasoning

---

## 📖 Understanding the Dashboard

### Purpose Category
The extension categorizes code into one of 35+ purpose categories:

**Core Application Logic**
| Category | Description |
|----------|-------------|
| 💼 Business Logic | Core business rules, domain logic, workflows |
| 🎨 UI/UX | User interface, components, styling |
| 🗄️ Data Access | Database, API calls, data fetching, ORM |
| 🔀 State Management | Redux, Zustand, context, global state |
| 🧭 Routing | Navigation, URL handling, route guards |

**User & Access**
| Category | Description |
|----------|-------------|
| 🔐 Authentication | Login, logout, session, OAuth, SSO |
| 🛡️ Authorization | Permissions, roles, access control, RBAC |

**Data Processing**
| Category | Description |
|----------|-------------|
| ✅ Validation | Input validation, schema validation, sanitization |
| 🔄 Data Transform | Parsing, serialization, mapping, formatting |
| 🔍 Search | Search, indexing, filtering, pagination |

**Communication**
| Category | Description |
|----------|-------------|
| 🔌 API Client | API wrappers, HTTP clients, SDK integrations |
| ⚡ Real-time | WebSocket, SSE, live updates, chat |
| 📬 Notification | Emails, push, SMS, in-app alerts |
| 📡 Event System | Event emitters, pub/sub, message queues |

**AI & Commerce**
| Category | Description |
|----------|-------------|
| 🤖 AI/ML | AI, ML, LLM, embeddings, recommendations |
| 💳 Payment | Payments, billing, subscriptions, checkout |
| 📊 Analytics | Tracking, metrics, reporting, dashboards |

**Media & UI Enhancements**
| Category | Description |
|----------|-------------|
| 📁 File Handling | Upload, download, file/image/video processing |
| ✨ Animation | Animations, transitions, motion design |
| 🎭 Theming | Themes, dark mode, design tokens |
| ♿ Accessibility | A11y, ARIA, keyboard nav, screen readers |
| 🌍 Localization | i18n, translations, RTL, date/currency formats |

**Infrastructure & Security**
| Category | Description |
|----------|-------------|
| ⚙️ Infrastructure | Config, setup, build tools, bundling |
| 🔗 Middleware | Express middleware, interceptors, pipes |
| 👁️ Observability | Logging, monitoring, error tracking, debugging |
| ⏰ Scheduling | Cron jobs, timers, background tasks, workers |
| 📦 Migration | Database migrations, data migrations |
| 🔒 Security | Encryption, CSRF, XSS, security headers |
| 🚦 Rate Limiting | Throttling, debouncing, DDoS protection |

**Code Quality & Other**
| Category | Description |
|----------|-------------|
| 🧪 Testing | Unit tests, integration tests, e2e, mocks |
| 🛠️ Utility | Helper functions, shared utilities, libs |
| 🚀 Performance | Optimization, caching, lazy loading, memoization |
| 🚩 Feature Flag | Feature toggles, A/B testing, experiments |
| 📜 Legacy | Deprecated code, tech debt, needs refactoring |
| 📍 Geolocation | Maps, GPS, location services |

### Risk Levels
| Level | Meaning |
|-------|---------|
| ✓ Low | Safe to modify with standard testing |
| ! Medium | Proceed with caution, review carefully |
| !! High | Review carefully, consult code owners |
| ⚠ Critical | Major impact possible, thorough review needed |

### Suggested Test Types
| Type | When to Use |
|------|-------------|
| Unit | Pure functions, isolated logic |
| Integration | API interactions, multiple modules |
| E2E | Critical user journeys, UI workflows |
| Manual | Visual verification, UX review |

---

## 🛠️ Troubleshooting

### "Claude API key not configured"
Run **"What is the Code: Set Claude API Key"** from the Command Palette and enter your API key.

### "GitHub token not configured"
Run **"What is the Code: Set GitHub Token"** from the Command Palette. This is optional but required for PR features.

### "No related PRs found"
- Ensure you have a valid GitHub token set
- The file must be in a git repository with a GitHub remote
- PRs are found by matching commit SHAs

### Analysis is slow
- Large files take longer to analyze
- Claude API response time varies
- Results are cached for 30 minutes by default

### Cache issues
Run **"What is the Code: Clear Cache"** to clear all cached results and force fresh analysis.

---

## 📋 Requirements

- **VS Code** 1.85.0+ or **Cursor** (latest version)
- **Git** repository (for history and ownership features)
- **Claude API key** (required for AI-powered analysis)
- **GitHub token** (optional, for PR features)

---

## 📄 License

MIT
