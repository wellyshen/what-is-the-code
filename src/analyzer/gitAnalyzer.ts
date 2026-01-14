import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { GitAnalysisResult, CommitInfo, CodeOwner } from '../types';

const execAsync = promisify(exec);

export class GitAnalyzer {
    
    async analyze(filePath: string, startLine: number, endLine: number): Promise<GitAnalysisResult> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!workspaceFolder) {
            return this.getEmptyResult();
        }

        const repoRoot = workspaceFolder.uri.fsPath;
        const relativePath = path.relative(repoRoot, filePath);

        try {
            // Check if it's a git repository
            await this.execGit(repoRoot, 'rev-parse --git-dir');
        } catch {
            return this.getEmptyResult();
        }

        const config = vscode.workspace.getConfiguration('whatIsTheCode');
        const maxCommits = config.get<number>('maxCommitHistory', 50);

        const commits = await this.getCommits(repoRoot, relativePath, startLine, endLine, maxCommits);
        const owners = this.calculateOwnership(commits);
        
        const lastModified = commits.length > 0 ? commits[0].date : 'Unknown';
        const createdAt = commits.length > 0 ? commits[commits.length - 1].date : 'Unknown';
        const changeFrequency = this.calculateChangeFrequency(commits);

        return {
            commits,
            owners,
            lastModified,
            createdAt,
            totalChanges: commits.length,
            changeFrequency
        };
    }

    private async getCommits(
        repoRoot: string, 
        relativePath: string, 
        startLine: number, 
        endLine: number,
        maxCommits: number
    ): Promise<CommitInfo[]> {
        try {
            // Get commits for the specific line range using git log with -L
            const lineRange = `${startLine},${endLine}`;
            // Use --numstat to get line change stats in a single command (fixes N+1 issue)
            const format = '%H|%h|%an|%ae|%aI|%s';
            
            let output: string;
            try {
                // Try to get line-specific history with stats
                const result = await this.execGit(
                    repoRoot,
                    `log -L ${lineRange}:"${relativePath}" --format="${format}" -n ${maxCommits} --no-patch`
                );
                output = result;
            } catch {
                // Fallback to file-level history with numstat (single command for all stats)
                const result = await this.execGit(
                    repoRoot,
                    `log --format="COMMIT_START${format}" --numstat -n ${maxCommits} -- "${relativePath}"`
                );
                output = result;
            }

            if (!output.trim()) {
                return [];
            }

            const commits: CommitInfo[] = [];
            
            // Check if output contains COMMIT_START (numstat format)
            if (output.includes('COMMIT_START')) {
                // Parse numstat format: each commit block starts with COMMIT_START
                const commitBlocks = output.split('COMMIT_START').filter(b => b.trim());
                
                for (const block of commitBlocks) {
                    const lines = block.trim().split('\n');
                    const headerLine = lines[0];
                    
                    if (!headerLine.includes('|')) continue;
                    
                    const [hash, shortHash, author, authorEmail, date, message] = headerLine.split('|');
                    
                    // Sum up line changes from numstat lines (format: additions\tdeletions\tfilename)
                    let linesChanged = 0;
                    for (let i = 1; i < lines.length; i++) {
                        const statLine = lines[i].trim();
                        if (statLine && !statLine.startsWith('-')) {
                            const parts = statLine.split('\t');
                            if (parts.length >= 2) {
                                const additions = parseInt(parts[0]) || 0;
                                const deletions = parseInt(parts[1]) || 0;
                                linesChanged += additions + deletions;
                            }
                        }
                    }
                    
                    if (hash && shortHash) {
                        commits.push({
                            hash: hash.trim(),
                            shortHash: shortHash.trim(),
                            author: author?.trim() || 'Unknown',
                            authorEmail: authorEmail?.trim() || '',
                            date: date?.trim() || '',
                            message: message?.trim() || '',
                            linesChanged
                        });
                    }
                }
            } else {
                // Parse simple format (from -L line range)
                const lines = output.trim().split('\n').filter(line => line.includes('|'));

                for (const line of lines) {
                    const [hash, shortHash, author, authorEmail, date, message] = line.split('|');
                    if (hash && shortHash) {
                        commits.push({
                            hash,
                            shortHash,
                            author: author || 'Unknown',
                            authorEmail: authorEmail || '',
                            date: date || '',
                            message: message || '',
                            linesChanged: 0 // Line-specific history doesn't need per-commit stats
                        });
                    }
                }
            }

            return commits;
        } catch (error) {
            console.error('Error getting commits:', error);
            return [];
        }
    }

    private calculateOwnership(commits: CommitInfo[]): CodeOwner[] {
        const ownerMap = new Map<string, {
            name: string;
            email: string;
            commits: number;
            linesChanged: number;
            lastContribution: string;
        }>();

        for (const commit of commits) {
            const key = commit.authorEmail || commit.author;
            const existing = ownerMap.get(key);
            
            if (existing) {
                existing.commits++;
                existing.linesChanged += commit.linesChanged;
                if (commit.date > existing.lastContribution) {
                    existing.lastContribution = commit.date;
                }
            } else {
                ownerMap.set(key, {
                    name: commit.author,
                    email: commit.authorEmail,
                    commits: 1,
                    linesChanged: commit.linesChanged,
                    lastContribution: commit.date
                });
            }
        }

        const totalCommits = commits.length;
        const owners: CodeOwner[] = Array.from(ownerMap.values())
            .map(owner => ({
                ...owner,
                percentage: Math.round((owner.commits / totalCommits) * 100)
            }))
            .sort((a, b) => b.commits - a.commits);

        return owners;
    }

    private calculateChangeFrequency(commits: CommitInfo[]): string {
        if (commits.length < 2) {
            return 'Rarely changed';
        }

        const firstCommit = new Date(commits[commits.length - 1].date);
        const lastCommit = new Date(commits[0].date);
        const daysDiff = Math.max(1, (lastCommit.getTime() - firstCommit.getTime()) / (1000 * 60 * 60 * 24));
        
        const changesPerMonth = (commits.length / daysDiff) * 30;

        if (changesPerMonth > 10) {
            return 'Very frequently changed (>10 times/month)';
        } else if (changesPerMonth > 5) {
            return 'Frequently changed (5-10 times/month)';
        } else if (changesPerMonth > 1) {
            return 'Occasionally changed (1-5 times/month)';
        } else if (changesPerMonth > 0.25) {
            return 'Rarely changed (few times/year)';
        } else {
            return 'Very stable (rarely changes)';
        }
    }

    private async execGit(cwd: string, command: string): Promise<string> {
        const { stdout } = await execAsync(`git ${command}`, { 
            cwd, 
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000
        });
        return stdout;
    }

    private getEmptyResult(): GitAnalysisResult {
        return {
            commits: [],
            owners: [],
            lastModified: 'Unknown',
            createdAt: 'Unknown',
            totalChanges: 0,
            changeFrequency: 'Unknown'
        };
    }

    async getRemoteUrl(filePath: string): Promise<string | null> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!workspaceFolder) {
            return null;
        }

        try {
            const result = await this.execGit(workspaceFolder.uri.fsPath, 'remote get-url origin');
            return result.trim();
        } catch {
            return null;
        }
    }
}
