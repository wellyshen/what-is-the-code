import * as vscode from 'vscode';
import * as https from 'https';
import { GitHubAnalysisResult, PullRequestInfo, CommitInfo } from '../types';
import { GitAnalyzer } from './gitAnalyzer';
import { getGithubToken } from '../extension';
import { withRetry } from '../utils/retry';
import { GITHUB_API_TIMEOUT_MS, API_MAX_RETRIES, MAX_COMMITS_TO_SEARCH_PRS, PR_BATCH_SIZE, ErrorMessages } from '../utils/constants';

export class GitHubAnalyzer {
    private gitAnalyzer = new GitAnalyzer();

    async analyze(filePath: string, commits: CommitInfo[]): Promise<GitHubAnalysisResult> {
        const remoteUrl = await this.gitAnalyzer.getRemoteUrl(filePath);
        
        if (!remoteUrl) {
            return {
                repoUrl: null,
                pullRequests: [],
                error: ErrorMessages.NO_GIT_REMOTE
            };
        }

        const repoInfo = this.parseGitHubUrl(remoteUrl);
        if (!repoInfo) {
            return {
                repoUrl: remoteUrl,
                pullRequests: [],
                error: ErrorMessages.NOT_GITHUB_REPO
            };
        }

        const config = vscode.workspace.getConfiguration('whatIsTheCode');
        const token = await getGithubToken();
        const maxPRs = config.get<number>('maxPRsToShow', 10);

        if (!token) {
            return {
                repoUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
                pullRequests: [],
                error: 'GitHub token not configured. Use "What is the Code: Set GitHub Token" command to enable PR fetching.'
            };
        }

        try {
            const pullRequests = await this.getPullRequestsForCommits(
                repoInfo.owner,
                repoInfo.repo,
                commits.slice(0, MAX_COMMITS_TO_SEARCH_PRS),
                token,
                maxPRs
            );

            return {
                repoUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
                pullRequests
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                repoUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
                pullRequests: [],
                error: `Failed to fetch PRs: ${errorMessage}`
            };
        }
    }

    private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
        // Handle SSH URLs: git@github.com:owner/repo.git
        const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)(\.git)?/);
        if (sshMatch) {
            return { owner: sshMatch[1], repo: sshMatch[2] };
        }

        // Handle HTTPS URLs: https://github.com/owner/repo.git
        const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+)(\.git)?/);
        if (httpsMatch) {
            return { owner: httpsMatch[1], repo: httpsMatch[2] };
        }

        return null;
    }

    private async getPullRequestsForCommits(
        owner: string,
        repo: string,
        commits: CommitInfo[],
        token: string,
        maxPRs: number
    ): Promise<PullRequestInfo[]> {
        const prsMap = new Map<number, PullRequestInfo>();

        // Fetch PRs for each commit (in parallel with rate limiting)
        for (let i = 0; i < commits.length && prsMap.size < maxPRs; i += PR_BATCH_SIZE) {
            const batch = commits.slice(i, i + PR_BATCH_SIZE);
            const promises = batch.map(commit => 
                this.getPRsForCommit(owner, repo, commit.hash, token)
            );

            const results = await Promise.allSettled(promises);
            
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    for (const pr of result.value) {
                        if (!prsMap.has(pr.number) && prsMap.size < maxPRs) {
                            prsMap.set(pr.number, pr);
                        }
                    }
                }
            }
        }

        return Array.from(prsMap.values()).sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    private async getPRsForCommit(
        owner: string,
        repo: string,
        commitSha: string,
        token: string
    ): Promise<PullRequestInfo[]> {
        const url = `/repos/${owner}/${repo}/commits/${commitSha}/pulls`;
        
        try {
            // Use retry for transient failures
            const data = await withRetry(
                () => this.makeGitHubRequest(url, token),
                {
                    maxAttempts: API_MAX_RETRIES,
                    retryableErrors: (error) => {
                        const msg = error.message.toLowerCase();
                        return msg.includes('timeout') || msg.includes('rate limit') || msg.includes('503');
                    }
                }
            );
            
            if (!Array.isArray(data)) {
                return [];
            }

            return data.map((pr: any) => ({
                number: pr.number,
                title: pr.title,
                url: pr.html_url,
                author: pr.user?.login || 'Unknown',
                state: pr.merged_at ? 'merged' : pr.state,
                createdAt: pr.created_at,
                mergedAt: pr.merged_at,
                description: this.truncateDescription(pr.body || ''),
                labels: (pr.labels || []).map((l: any) => l.name)
            }));
        } catch {
            return [];
        }
    }

    private truncateDescription(description: string): string {
        const maxLength = 500;
        if (description.length <= maxLength) {
            return description;
        }
        return description.substring(0, maxLength) + '...';
    }

    private makeGitHubRequest(path: string, token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'what-is-the-code-vscode-extension',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Failed to parse response'));
                        }
                    } else if (res.statusCode === 404) {
                        resolve([]);
                    } else if (res.statusCode === 401) {
                        reject(new Error('Invalid GitHub token'));
                    } else if (res.statusCode === 403) {
                        reject(new Error('API rate limit exceeded or insufficient permissions'));
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (e) => {
                reject(e);
            });

            req.setTimeout(GITHUB_API_TIMEOUT_MS, () => {
                req.destroy();
                reject(new Error(ErrorMessages.REQUEST_TIMEOUT));
            });

            req.end();
        });
    }
}
