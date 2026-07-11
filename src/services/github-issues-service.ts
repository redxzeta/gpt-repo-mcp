import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubIssueCommentInput, GitHubIssueCreateInput, GitHubIssuesInput, GitHubPullRequestCommentInput } from "../contracts/github.contract.js";

const execFileAsync = promisify(execFile);

type GitHubIssue = {
  number: number;
  title: string;
  state: string;
  labels?: Array<{ name?: string }>;
  author?: { login?: string };
  updatedAt?: string;
  url: string;
  body?: string;
};

export class GitHubIssuesService {
  constructor(private readonly root: string) {}

  async listIssues(options: Omit<GitHubIssuesInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, issues: [], count: 0, warnings };
    }
    const maxResults = Math.min(options.max_results ?? 25, 100);
    const args = [
      "issue",
      "list",
      "--repo",
      repository,
      "--state",
      options.state ?? "open",
      "--limit",
      String(maxResults),
      "--json",
      "number,title,state,labels,author,updatedAt,url,body"
    ];
    for (const label of options.labels ?? []) {
      args.push("--label", label);
    }
    if (options.query) {
      args.push("--search", options.query);
    }

    try {
      const { stdout } = await execFileAsync("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      const parsed = JSON.parse(String(stdout)) as GitHubIssue[];
      const issues = parsed.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: (issue.labels ?? []).map((label) => label.name).filter((label): label is string => Boolean(label)),
        author: issue.author?.login,
        updated_at: issue.updatedAt,
        url: issue.url,
        body_excerpt: excerpt(issue.body)
      }));
      return { repository, issues, count: issues.length, warnings };
    } catch {
      warnings.push("GH_ISSUE_LIST_FAILED");
      return { repository, issues: [], count: 0, warnings };
    }
  }

  async createIssue(options: Omit<GitHubIssueCreateInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, title: options.title, dry_run: Boolean(options.dry_run), warnings };
    }
    const args = [
      "issue",
      "create",
      "--repo",
      repository,
      "--title",
      options.title
    ];
    if (options.body) {
      args.push("--body", options.body);
    }
    for (const label of options.labels ?? []) {
      args.push("--label", label);
    }
    for (const assignee of options.assignees ?? []) {
      args.push("--assignee", assignee);
    }
    if (options.milestone) {
      args.push("--milestone", options.milestone);
    }

    if (options.dry_run) {
      return {
        repository,
        title: options.title,
        dry_run: true,
        warnings
      };
    }

    try {
      const { stdout } = await execFileAsync("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      const url = String(stdout).trim();
      return {
        repository,
        issue_number: parseIssueNumber(url),
        title: options.title,
        url: url || undefined,
        dry_run: false,
        warnings
      };
    } catch {
      warnings.push("GH_ISSUE_CREATE_FAILED");
      return {
        repository,
        title: options.title,
        dry_run: false,
        warnings
      };
    }
  }

  async commentOnIssue(options: Omit<GitHubIssueCommentInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, dry_run: Boolean(options.dry_run), warnings };
    }
    const args = ["issue", "comment", String(options.issue_number), "--repo", repository, "--body", options.body];
    if (options.dry_run) {
      return { repository, dry_run: true, target_number: options.issue_number, warnings };
    }
    try {
      await execFileAsync("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024
      });
      return { repository, dry_run: false, target_number: options.issue_number, warnings };
    } catch {
      warnings.push("GH_ISSUE_COMMENT_FAILED");
      return { repository, dry_run: false, target_number: options.issue_number, warnings };
    }
  }

  async commentOnPullRequest(options: Omit<GitHubPullRequestCommentInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, dry_run: Boolean(options.dry_run), warnings };
    }
    const args = ["pr", "comment", String(options.pr_number), "--repo", repository, "--body", options.body];
    if (options.dry_run) {
      return { repository, dry_run: true, target_number: options.pr_number, warnings };
    }
    try {
      await execFileAsync("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024
      });
      return { repository, dry_run: false, target_number: options.pr_number, warnings };
    } catch {
      warnings.push("GH_PR_COMMENT_FAILED");
      return { repository, dry_run: false, target_number: options.pr_number, warnings };
    }
  }

  private async detectGitHubRepository(warnings: string[]): Promise<string | undefined> {
    let remote = "";
    try {
      const result = await execFileAsync("git", ["remote", "get-url", "origin"], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 64 * 1024
      });
      remote = String(result.stdout).trim();
    } catch {
      warnings.push("GIT_ORIGIN_UNAVAILABLE");
      return undefined;
    }

    const repository = parseGitHubRemote(remote);
    if (!repository) {
      warnings.push("GITHUB_ORIGIN_UNSUPPORTED");
    }
    return repository;
  }
}

function parseGitHubRemote(remote: string): string | undefined {
  const https = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (https) {
    return `${https[1]}/${https[2]}`;
  }
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (ssh) {
    return `${ssh[1]}/${ssh[2]}`;
  }
  return undefined;
}

function excerpt(body: string | undefined): string | undefined {
  const compact = body?.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 500) : undefined;
}

function parseIssueNumber(url: string): number | undefined {
  const match = /\/issues\/(\d+)(?:\b|\/|$)/.exec(url);
  return match ? Number.parseInt(match[1], 10) : undefined;
}
