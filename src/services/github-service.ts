import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { GitHubIssueCommentInput, GitHubIssueCreateInput, GitHubIssueDeleteInput, GitHubIssueEditInput, GitHubIssuesInput, GitHubIssueReadInput, GitHubLabelCreateInput, GitHubLabelListInput, GitHubMilestoneCreateInput, GitHubMilestoneListInput, GitHubMilestoneReadInput, GitHubProjectCreateInput, GitHubProjectItemAddInput, GitHubProjectItemListInput, GitHubProjectListInput, GitHubProjectReadInput, GitHubPullRequestCommentInput, GitHubPrChecksInput, GitHubPrCreateInput, GitHubPrListInput, GitHubPrReadInput } from "../contracts/github.contract.js";
import { RepoReaderError } from "../runtime/errors.js";
import { type GhRunner, defaultGhRunner } from "./gh-runner.js";

const MUTATING_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 30_000;

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

export class GitHubService {
  private readonly runner: GhRunner;
  private readonly root: string;

  constructor(root: string, runner?: GhRunner) {
    this.root = root;
    this.runner = runner ?? defaultGhRunner;
  }

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
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const parsed = JSON.parse(stdout) as GitHubIssue[];
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
      return { created: false, repository: undefined, title: options.title, dry_run: Boolean(options.dry_run), warnings };
    }

    if (options.dry_run) {
      return {
        created: false,
        repository,
        title: options.title,
        dry_run: true,
        normalized: {
          title: options.title,
          body: Boolean(options.body),
          labels: options.labels ?? [],
          assignees: options.assignees ?? [],
          milestone: options.milestone
        },
        warnings
      };
    }

    const args = [
      "issue",
      "create",
      "--repo",
      repository,
      "--title",
      options.title
    ];

    let bodyTmpPath: string | undefined;
    try {
      if (options.body) {
        bodyTmpPath = join(tmpdir(), `gh-issue-body-${randomUUID()}.md`);
        await writeFile(bodyTmpPath, options.body, { encoding: "utf8", mode: 0o600 });
        args.push("--body-file", bodyTmpPath);
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

      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      const url = stdout.trim();
      return {
        created: true,
        repository,
        number: parseIssueNumber(url),
        title: options.title,
        url: url || undefined,
        dry_run: false,
        warnings
      };
    } catch (error) {
      throw classifyGhError(error, "GH_ISSUE_CREATE_FAILED", `Failed to create issue`);
    } finally {
      await cleanupFile(bodyTmpPath);
    }
  }

  async editIssue(options: Omit<GitHubIssueEditInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { edited: false, repository: undefined, number: options.issue_number, dry_run: Boolean(options.dry_run), warnings };
    }

    if (options.dry_run) {
      return {
        edited: false,
        repository,
        number: options.issue_number,
        dry_run: true,
        warnings
      };
    }

    const args = [
      "issue",
      "edit",
      String(options.issue_number),
      "--repo",
      repository
    ];

    if (options.title) {
      args.push("--title", options.title);
    }

    let bodyTmpPath: string | undefined;
    try {
      if (options.body !== undefined) {
        if (options.body === null) {
          args.push("--body", "");
        } else {
          bodyTmpPath = join(tmpdir(), `gh-issue-body-${randomUUID()}.md`);
          await writeFile(bodyTmpPath, options.body, { encoding: "utf8", mode: 0o600 });
          args.push("--body-file", bodyTmpPath);
        }
      }
      if (options.state) {
        args.push("--state", options.state);
      }
      if (options.add_labels && options.add_labels.length > 0) {
        args.push("--add-label", options.add_labels.join(","));
      }
      if (options.remove_labels && options.remove_labels.length > 0) {
        args.push("--remove-label", options.remove_labels.join(","));
      }
      if (options.assignees !== undefined) {
        args.push("--assignee", options.assignees.join(","));
      }
      if (options.milestone !== undefined) {
        args.push("--milestone", options.milestone === null ? "" : options.milestone);
      }

      await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      return {
        edited: true,
        repository,
        number: options.issue_number,
        dry_run: false,
        warnings
      };
    } catch (error) {
      throw classifyGhError(error, "GH_ISSUE_EDIT_FAILED", `Failed to edit issue #${options.issue_number}`);
    } finally {
      await cleanupFile(bodyTmpPath);
    }
  }

  async deleteIssue(options: Omit<GitHubIssueDeleteInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { deleted: false, repository: undefined, number: options.issue_number, dry_run: Boolean(options.dry_run), warnings };
    }

    if (!options.confirm) {
      return { deleted: false, repository, number: options.issue_number, dry_run: true, warnings: [...warnings, "CONFIRM_REQUIRED"] };
    }

    if (options.dry_run) {
      return {
        deleted: false,
        repository,
        number: options.issue_number,
        dry_run: true,
        warnings
      };
    }

    try {
      await this.runner.run("gh", [
        "issue",
        "delete",
        String(options.issue_number),
        "--repo",
        repository,
        "--yes"
      ], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      return {
        deleted: true,
        repository,
        number: options.issue_number,
        dry_run: false,
        warnings
      };
    } catch (error) {
      throw classifyGhError(error, "GH_ISSUE_DELETE_FAILED", `Failed to delete issue #${options.issue_number}`);
    }
  }

  async commentOnIssue(options: Omit<GitHubIssueCommentInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, dry_run: Boolean(options.dry_run), warnings };
    }

    if (options.dry_run) {
      return { repository, dry_run: true, target_number: options.issue_number, warnings };
    }

    let bodyTmpPath: string | undefined;
    try {
      bodyTmpPath = join(tmpdir(), `gh-issue-body-${randomUUID()}.md`);
      await writeFile(bodyTmpPath, options.body, { encoding: "utf8", mode: 0o600 });
      const args = ["issue", "comment", String(options.issue_number), "--repo", repository, "--body-file", bodyTmpPath];
      await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      return { repository, dry_run: false, target_number: options.issue_number, warnings };
    } catch (error) {
      throw classifyGhError(error, "GH_ISSUE_COMMENT_FAILED", `Failed to comment on issue #${options.issue_number}`);
    } finally {
      await cleanupFile(bodyTmpPath);
    }
  }

  async commentOnPullRequest(options: Omit<GitHubPullRequestCommentInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, dry_run: Boolean(options.dry_run), warnings };
    }

    if (options.dry_run) {
      return { repository, dry_run: true, target_number: options.pr_number, warnings };
    }

    let bodyTmpPath: string | undefined;
    try {
      bodyTmpPath = join(tmpdir(), `gh-pr-body-${randomUUID()}.md`);
      await writeFile(bodyTmpPath, options.body, { encoding: "utf8", mode: 0o600 });
      const args = ["pr", "comment", String(options.pr_number), "--repo", repository, "--body-file", bodyTmpPath];
      await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      return { repository, dry_run: false, target_number: options.pr_number, warnings };
    } catch (error) {
      throw classifyGhError(error, "GH_PR_COMMENT_FAILED", `Failed to comment on PR #${options.pr_number}`);
    } finally {
      await cleanupFile(bodyTmpPath);
    }
  }

  async readIssue(options: Omit<GitHubIssueReadInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      throw new RepoReaderError("GH_ISSUE_READ_FAILED", "No GitHub repository detected");
    }
    const args = [
      "issue",
      "view",
      String(options.issue_number),
      "--repo",
      repository,
      "--json",
      "number,title,state,body,labels,assignees,milestone,url,comments"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const issue = JSON.parse(stdout) as {
        number: number;
        title: string;
        state: string;
        body?: string;
        labels?: Array<{ name?: string }>;
        assignees?: Array<{ login?: string }>;
        milestone?: { title?: string };
        url: string;
        comments?: unknown[];
      };
      return {
        repository,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        labels: (issue.labels ?? []).map((l) => l.name).filter((n): n is string => Boolean(n)),
        assignees: (issue.assignees ?? []).map((a) => a.login).filter((l): l is string => Boolean(l)),
        milestone: issue.milestone?.title,
        url: issue.url,
        comments_count: issue.comments?.length ?? 0,
        warnings
      };
    } catch (error) {
      if (error instanceof RepoReaderError) throw error;
      throw new RepoReaderError("GH_ISSUE_READ_FAILED", `Failed to read issue #${options.issue_number}`);
    }
  }

  async listLabels(options: Omit<GitHubLabelListInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, labels: [], count: 0, warnings };
    }
    const maxResults = Math.min(options.max_results ?? 50, 100);
    const args = [
      "label",
      "list",
      "--repo",
      repository,
      "--limit",
      String(maxResults),
      "--json",
      "name,color,description"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const parsed = JSON.parse(stdout) as Array<{ name: string; color: string; description?: string }>;
      const labels = parsed.map((label) => ({
        name: label.name,
        color: label.color,
        description: label.description
      }));
      return { repository, labels, count: labels.length, warnings };
    } catch {
      warnings.push("GH_LABEL_LIST_FAILED");
      return { repository, labels: [], count: 0, warnings };
    }
  }

  async createLabel(options: Omit<GitHubLabelCreateInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { created: false, repository: undefined, name: options.name, dry_run: Boolean(options.dry_run), warnings };
    }

    if (options.dry_run) {
      return {
        created: false,
        repository,
        name: options.name,
        dry_run: true,
        warnings
      };
    }

    const args = [
      "label",
      "create",
      options.name,
      "--repo",
      repository,
      "--color",
      options.color
    ];
    if (options.description) {
      args.push("--description", options.description);
    }

    try {
      await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      const url = `https://github.com/${repository}/labels`;
      return {
        created: true,
        repository,
        name: options.name,
        url,
        dry_run: false,
        warnings
      };
    } catch (error) {
      throw classifyGhError(error, "GH_LABEL_CREATE_FAILED", `Failed to create label '${options.name}'`);
    }
  }

  async listPullRequests(options: Omit<GitHubPrListInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, prs: [], count: 0, warnings };
    }
    const maxResults = Math.min(options.max_results ?? 25, 100);
    const args = [
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      options.state ?? "open",
      "--limit",
      String(maxResults),
      "--json",
      "number,title,state,author,headRefName,baseRefName,mergeable,url"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const prs = JSON.parse(stdout) as Array<{
        number: number;
        title: string;
        state: string;
        author?: { login?: string };
        headRefName: string;
        baseRefName: string;
        mergeable?: string;
        url: string;
      }>;
      return {
        repository,
        prs: prs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.author?.login,
          head: pr.headRefName,
          base: pr.baseRefName,
          mergeable: pr.mergeable,
          url: pr.url
        })),
        count: prs.length,
        warnings
      };
    } catch {
      warnings.push("GH_PR_LIST_FAILED");
      return { repository, prs: [], count: 0, warnings };
    }
  }

  async readPullRequest(options: Omit<GitHubPrReadInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      throw new RepoReaderError("GH_PR_READ_FAILED", "No GitHub repository detected");
    }
    const args = [
      "pr",
      "view",
      String(options.pr_number),
      "--repo",
      repository,
      "--json",
      "number,title,state,body,author,headRefName,baseRefName,mergeable,url,labels,reviews"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const pr = JSON.parse(stdout) as {
        number: number;
        title: string;
        state: string;
        body?: string;
        author?: { login?: string };
        headRefName: string;
        baseRefName: string;
        mergeable?: string;
        url: string;
        labels?: Array<{ name?: string }>;
        reviews?: Array<{ author?: { login?: string } }>;
      };
      return {
        repository,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        body: pr.body,
        author: pr.author?.login,
        head: pr.headRefName,
        base: pr.baseRefName,
        mergeable: pr.mergeable,
        url: pr.url,
        labels: (pr.labels ?? []).map((l) => l.name).filter((n): n is string => Boolean(n)),
        reviewers: (pr.reviews ?? []).map((r) => r.author?.login).filter((l): l is string => Boolean(l)),
        warnings
      };
    } catch (error) {
      if (error instanceof RepoReaderError) throw error;
      throw new RepoReaderError("GH_PR_READ_FAILED", `Failed to read PR #${options.pr_number}`);
    }
  }

  async createPullRequest(options: Omit<GitHubPrCreateInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      throw new RepoReaderError("GH_PR_CREATE_FAILED", "No GitHub repository detected");
    }
    const args = [
      "pr",
      "create",
      "--repo",
      repository,
      "--title",
      options.title,
      "--head",
      options.head,
      "--base",
      options.base
    ];

    let bodyTmpPath: string | undefined;
    try {
      if (options.body) {
        bodyTmpPath = join(tmpdir(), `gh-pr-body-${randomUUID()}.md`);
        await writeFile(bodyTmpPath, options.body, { encoding: "utf8", mode: 0o600 });
        args.push("--body-file", bodyTmpPath);
      }
      if (options.draft) {
        args.push("--draft");
      }
      for (const label of options.labels ?? []) {
        args.push("--label", label);
      }
      for (const assignee of options.assignees ?? []) {
        args.push("--assignee", assignee);
      }
      for (const reviewer of options.reviewers ?? []) {
        args.push("--reviewer", reviewer);
      }

      if (options.dry_run) {
        return {
          repository,
          status: "previewed" as const,
          dry_run: true,
          warnings
        };
      }

      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      const url = stdout.trim();
      const prNumber = parsePrNumber(url);
      return {
        repository,
        pr_number: prNumber,
        url: url || undefined,
        status: "created" as const,
        dry_run: false,
        warnings
      };
    } catch {
      warnings.push("GH_PR_CREATE_FAILED");
      return {
        repository,
        status: "failed" as const,
        dry_run: false,
        warnings
      };
    } finally {
      await cleanupFile(bodyTmpPath);
    }
  }

  async prChecks(options: Omit<GitHubPrChecksInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, checks: [], overall_status: "unknown", warnings };
    }
    const args = [
      "pr",
      "checks",
      String(options.pr_number),
      "--repo",
      repository,
      "--json",
      "name,state,description,url"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const checks = JSON.parse(stdout) as Array<{
        name: string;
        state: string;
        description?: string;
        url?: string;
      }>;
      const overallStatus = checks.every((c) => c.state === "SUCCESS")
        ? "success"
        : checks.some((c) => c.state === "FAILURE")
          ? "failure"
          : "pending";
      return {
        repository,
        checks: checks.map((c) => ({
          name: c.name,
          status: c.state,
          conclusion: c.description,
          url: c.url
        })),
        overall_status: overallStatus,
        warnings
      };
    } catch {
      warnings.push("GH_PR_CHECKS_FAILED");
      return { repository, checks: [], overall_status: "unknown", warnings };
    }
  }

  async listProjects(options: Omit<GitHubProjectListInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, owner: undefined, projects: [], count: 0, warnings };
    }
    const owner = repository.split("/")[0];
    const maxResults = Math.min(options.max_results ?? 25, 100);
    const args = [
      "project",
      "list",
      "--owner",
      owner,
      "--limit",
      String(maxResults),
      "--format",
      "json"
    ];
    if (options.state === "closed") {
      args.push("--closed");
    }
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const parsed = JSON.parse(stdout) as { projects?: Array<{ number: number; title: string; state: string; url: string }> };
      const allProjects = parsed.projects ?? [];
      const filtered = options.state && options.state !== "all"
        ? allProjects.filter((p) => p.state.toLowerCase() === options.state)
        : allProjects;
      const projects = filtered.slice(0, maxResults);
      return { repository, owner, projects, count: projects.length, warnings };
    } catch {
      warnings.push("GH_PROJECT_LIST_FAILED");
      return { repository, owner, projects: [], count: 0, warnings };
    }
  }

  async readProject(options: Omit<GitHubProjectReadInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      throw new RepoReaderError("GH_PROJECT_READ_FAILED", "No GitHub repository detected");
    }
    const owner = repository.split("/")[0];
    const args = [
      "project",
      "view",
      String(options.project_number),
      "--owner",
      owner,
      "--format",
      "json"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const project = JSON.parse(stdout) as {
        number: number;
        title: string;
        state: string;
        description?: string;
        url: string;
        closed: boolean;
        public: boolean;
        short_description?: string;
      };
      return {
        repository,
        owner,
        number: project.number,
        title: project.title,
        state: project.state,
        description: project.description,
        url: project.url,
        closed: project.closed,
        public: project.public,
        short_description: project.short_description,
        warnings
      };
    } catch (error) {
      if (error instanceof RepoReaderError) throw error;
      throw new RepoReaderError("GH_PROJECT_READ_FAILED", `Failed to read project #${options.project_number}`);
    }
  }

  async createProject(options: Omit<GitHubProjectCreateInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, owner: undefined, title: options.title, dry_run: Boolean(options.dry_run), warnings };
    }
    const owner = repository.split("/")[0];
    const args = [
      "project",
      "create",
      "--owner",
      owner,
      "--title",
      options.title
    ];
    if (options.body) {
      args.push("--body", options.body);
    }
    if (options.private) {
      args.push("--private");
    }

    if (options.dry_run) {
      return { repository, owner, title: options.title, dry_run: true, warnings };
    }

    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      const url = stdout.trim();
      const projectNumber = /\/projects\/(\d+)/.exec(url)?.[1];
      return {
        repository,
        owner,
        project_number: projectNumber ? Number.parseInt(projectNumber, 10) : undefined,
        url: url || undefined,
        title: options.title,
        dry_run: false,
        warnings
      };
    } catch {
      warnings.push("GH_PROJECT_CREATE_FAILED");
      return { repository, owner, title: options.title, dry_run: false, warnings };
    }
  }

  async listProjectItems(options: Omit<GitHubProjectItemListInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, owner: undefined, project_number: options.project_number, items: [], count: 0, warnings };
    }
    const owner = repository.split("/")[0];
    const maxResults = Math.min(options.max_results ?? 25, 100);
    const args = [
      "project",
      "item-list",
      String(options.project_number),
      "--owner",
      owner,
      "--limit",
      String(maxResults),
      "--format",
      "json"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const parsed = JSON.parse(stdout) as Array<{ id: string; type: string; title?: string; url?: string }>;
      const items = parsed.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        url: item.url
      }));
      return { repository, owner, project_number: options.project_number, items, count: items.length, warnings };
    } catch {
      warnings.push("GH_PROJECT_ITEM_LIST_FAILED");
      return { repository, owner, project_number: options.project_number, items: [], count: 0, warnings };
    }
  }

  async addProjectItem(options: Omit<GitHubProjectItemAddInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, owner: undefined, project_number: options.project_number, item_url: options.url, dry_run: Boolean(options.dry_run), warnings };
    }
    const owner = repository.split("/")[0];
    const args = [
      "project",
      "item-add",
      String(options.project_number),
      "--owner",
      owner,
      "--url",
      options.url
    ];

    if (options.dry_run) {
      return { repository, owner, project_number: options.project_number, item_url: options.url, dry_run: true, warnings };
    }

    try {
      await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 256 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      return { repository, owner, project_number: options.project_number, item_url: options.url, dry_run: false, warnings };
    } catch {
      warnings.push("GH_PROJECT_ITEM_ADD_FAILED");
      return { repository, owner, project_number: options.project_number, item_url: options.url, dry_run: false, warnings };
    }
  }

  async listMilestones(options: Omit<GitHubMilestoneListInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, milestones: [], count: 0, warnings };
    }
    const maxResults = Math.min(options.max_results ?? 25, 100);
    const args = [
      "api",
      `repos/${repository}/milestones`,
      "--method",
      "GET",
      "-f",
      `state=${options.state ?? "open"}`,
      "-F",
      `per_page=${maxResults}`,
      "--jq",
      ".[] | {number, title, state, description, due_on, open_issues, closed_issues, url: .html_url}"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const lines = stdout.trim().split("\n").filter((line) => line.length > 0);
      const milestones = lines.map((line) => JSON.parse(line) as {
        number: number;
        title: string;
        state: string;
        description?: string;
        due_on?: string;
        open_issues: number;
        closed_issues: number;
        url: string;
      });
      return { repository, milestones, count: milestones.length, warnings };
    } catch {
      warnings.push("GH_MILESTONE_LIST_FAILED");
      return { repository, milestones: [], count: 0, warnings };
    }
  }

  async readMilestone(options: Omit<GitHubMilestoneReadInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      throw new RepoReaderError("GH_MILESTONE_READ_FAILED", "No GitHub repository detected");
    }
    const args = [
      "api",
      `repos/${repository}/milestones/${options.milestone_number}`,
      "--method",
      "GET",
      "--jq",
      "{number, title, state, description, due_on, open_issues, closed_issues, url: .html_url}"
    ];
    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: READ_TIMEOUT_MS
      });
      const milestone = JSON.parse(stdout) as {
        number: number;
        title: string;
        state: string;
        description?: string;
        due_on?: string;
        open_issues: number;
        closed_issues: number;
        url: string;
      };
      return {
        repository,
        number: milestone.number,
        title: milestone.title,
        state: milestone.state,
        description: milestone.description,
        due_on: milestone.due_on,
        open_issues: milestone.open_issues,
        closed_issues: milestone.closed_issues,
        url: milestone.url,
        warnings
      };
    } catch (error) {
      if (error instanceof RepoReaderError) throw error;
      throw new RepoReaderError("GH_MILESTONE_READ_FAILED", `Failed to read milestone #${options.milestone_number}`);
    }
  }

  async createMilestone(options: Omit<GitHubMilestoneCreateInput, "repo_id">) {
    const warnings: string[] = [];
    const repository = await this.detectGitHubRepository(warnings);
    if (!repository) {
      return { repository: undefined, title: options.title, dry_run: Boolean(options.dry_run), warnings };
    }
    const args = [
      "api",
      `repos/${repository}/milestones`,
      "--method",
      "POST",
      "-f",
      `title=${options.title}`
    ];
    if (options.description) {
      args.push("-f", `description=${options.description}`);
    }
    if (options.due_on) {
      args.push("-f", `due_on=${options.due_on}`);
    }

    if (options.dry_run) {
      return { repository, title: options.title, dry_run: true, warnings };
    }

    try {
      const { stdout } = await this.runner.run("gh", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeoutMs: MUTATING_TIMEOUT_MS
      });
      const milestone = JSON.parse(stdout) as { number: number; html_url: string };
      return {
        repository,
        milestone_number: milestone.number,
        url: milestone.html_url,
        title: options.title,
        dry_run: false,
        warnings
      };
    } catch {
      warnings.push("GH_MILESTONE_CREATE_FAILED");
      return { repository, title: options.title, dry_run: false, warnings };
    }
  }

  private async detectGitHubRepository(warnings: string[]): Promise<string | undefined> {
    let remote = "";
    try {
      const { stdout } = await this.runner.run("git", ["remote", "get-url", "origin"], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 64 * 1024,
        timeoutMs: 5_000
      });
      remote = stdout.trim();
    } catch {
      warnings.push("GIT_ORIGIN_UNAVAILABLE");
      return undefined;
    }

    const repository = parseGitHubRemote(remote);
    if (!repository) {
      if (remote.includes("github.com")) {
        warnings.push("GITHUB_ORIGIN_UNSUPPORTED");
      } else {
        warnings.push("GITHUB_ORIGIN_NON_GITHUB");
      }
    }
    return repository;
  }
}

export function parseGitHubRemote(remote: string): string | undefined {
  const https = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (https) {
    return `${https[1]}/${https[2]}`;
  }
  const sshProtocol = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (sshProtocol) {
    return `${sshProtocol[1]}/${sshProtocol[2]}`;
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

function parsePrNumber(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\b|\/|$)/.exec(url);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function classifyGhError(error: unknown, code: string, fallbackMessage: string): RepoReaderError {
  const err = error as Error & { code?: string; exitCode?: number };
  const msg = err?.message ?? String(error);
  const errCode = err?.code;

  if (errCode === "GH_TIMEOUT") {
    return new RepoReaderError("GH_UNAVAILABLE", `GitHub CLI timed out. The operation did not complete in time.`, { retryable: true });
  }
  if (errCode === "GH_PROCESS_KILLED") {
    return new RepoReaderError("GH_UNAVAILABLE", `GitHub CLI process was terminated.`, { retryable: true });
  }
  if (errCode === "ENOENT" || msg.includes("ENOENT") || msg.includes("not found")) {
    return new RepoReaderError("GH_UNAVAILABLE", "GitHub CLI ('gh') is not installed or not found in PATH.");
  }
  if (msg.includes("not logged in") || msg.includes("authentication") || msg.includes("401") || msg.includes("403")) {
    return new RepoReaderError("GH_AUTH_FAILED", "GitHub CLI is not authenticated. Run 'gh auth login' first.");
  }
  if (errCode === "GH_NONZERO_EXIT") {
    return new RepoReaderError(code as never, `${fallbackMessage}: exited with code ${err?.exitCode}`);
  }
  return new RepoReaderError(code as never, `${fallbackMessage}: ${msg.slice(0, 200)}`);
}

async function cleanupFile(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    // best-effort cleanup
  }
}
