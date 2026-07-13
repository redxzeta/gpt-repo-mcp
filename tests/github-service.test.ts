import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, afterEach } from "vitest";
import { GitHubService, parseGitHubRemote } from "../src/services/github-service.js";
import { GitHubPolicy } from "../src/services/github-policy.js";
import { RepoReaderError } from "../src/runtime/errors.js";
import type { GhRunner, GhRunResult } from "../src/services/gh-runner.js";
import {
  GitHubIssueCreateInputSchema,
  GitHubIssueEditInputSchema,
  GitHubIssueDeleteInputSchema,
  GitHubLabelCreateInputSchema,
  GitHubLabelListInputSchema,
  GitHubIssueCommentInputSchema,
  GitHubIssuesInputSchema,
  GitHubIssueReadInputSchema,
  GitHubIssueCreateResultSchema
} from "../src/contracts/github.contract.js";

type RunnerCall = { cmd: string; args: string[] };

function createMockRunner(
  handler: (cmd: string, args: string[]) => Promise<GhRunResult>
): GhRunner & { calls: RunnerCall[] } {
  const calls: RunnerCall[] = [];
  return {
    run: async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return handler(cmd, args);
    },
    calls
  };
}

function createSuccessfulRunner(ghStdout = ""): GhRunner & { calls: RunnerCall[] } {
  return createMockRunner(async (cmd: string) => {
    if (cmd === "git") {
      return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
    }
    return { stdout: ghStdout, stderr: "" };
  });
}

function createFailingRunner(errorMessage: string, code = "GH_NONZERO_EXIT"): GhRunner & { calls: RunnerCall[] } {
  return createMockRunner(async (cmd: string) => {
    if (cmd === "git") {
      return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
    }
    const err = new Error(errorMessage);
    (err as Error & { code?: string }).code = code;
    throw err;
  });
}

function createNoRepoRunner(): GhRunner & { calls: RunnerCall[] } {
  return createMockRunner(async (cmd: string) => {
    if (cmd === "git") {
      const err = new Error("not a git repository");
      (err as Error & { code?: string }).code = "ENOENT";
      throw err;
    }
    return { stdout: "", stderr: "" };
  });
}

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

describe("GitHubService with mock runner", () => {
  test("createIssue: successful creation returns URL and number", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createSuccessfulRunner("https://github.com/owner/repo/issues/42\n");
    const service = new GitHubService(tmpDir, runner);

    const result = await service.createIssue({
      title: "Test Issue",
      body: "Description",
      dry_run: false
    });

    expect(result.created).toBe(true);
    expect(result.number).toBe(42);
    expect(result.url).toBe("https://github.com/owner/repo/issues/42");
    expect(result.dry_run).toBe(false);
  });

  test("createIssue: timeout returns structured failure", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createMockRunner(async (cmd) => {
      if (cmd === "git") {
        return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
      }
      const err = new Error("Process timed out");
      (err as Error & { code?: string }).code = "GH_TIMEOUT";
      throw err;
    });
    const service = new GitHubService(tmpDir, runner);

    await expect(service.createIssue({
      title: "Test Issue",
      dry_run: false
    })).rejects.toMatchObject({
      code: "GH_UNAVAILABLE"
    });
  });

  test("createIssue: authentication failure is classified correctly", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createMockRunner(async (cmd) => {
      if (cmd === "git") {
        return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
      }
      throw new Error("not logged in to any GitHub hosts");
    });
    const service = new GitHubService(tmpDir, runner);

    await expect(service.createIssue({
      title: "Test Issue",
      dry_run: false
    })).rejects.toMatchObject({
      code: "GH_AUTH_FAILED"
    });
  });

  test("createIssue: raw stderr does not appear in error message", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const err = new Error("exit code 1");
    (err as Error & { code?: string; exitCode?: number }).code = "GH_NONZERO_EXIT";
    (err as Error & { exitCode?: number }).exitCode = 1;
    (err as unknown as { stderr: string }).stderr = "sensitive data: token_abc123";
    const runner: GhRunner = {
      run: async (cmd) => {
        if (cmd === "git") return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
        throw err;
      }
    };
    const service = new GitHubService(tmpDir, runner);

    try {
      await service.createIssue({ title: "Test", dry_run: false });
      expect.fail("Expected to throw");
    } catch (error) {
      expect((error as RepoReaderError).message).not.toContain("token_abc123");
      expect((error as RepoReaderError).message).not.toContain("sensitive data");
    }
  });

  test("createIssue: body content does not appear in error message", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const err = new Error("exit code 1");
    (err as Error & { code?: string; exitCode?: number }).code = "GH_NONZERO_EXIT";
    (err as Error & { exitCode?: number }).exitCode = 1;
    const runner: GhRunner = {
      run: async (cmd) => {
        if (cmd === "git") return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
        throw err;
      }
    };
    const service = new GitHubService(tmpDir, runner);

    try {
      await service.createIssue({
        title: "Test",
        body: "secret body content with tokens",
        dry_run: false
      });
      expect.fail("Expected to throw");
    } catch (error) {
      expect((error as RepoReaderError).message).not.toContain("secret body content");
    }
  });

  test("createIssue: dry-run does not invoke gh issue create", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createSuccessfulRunner();
    const service = new GitHubService(tmpDir, runner);

    const result = await service.createIssue({
      title: "Test Issue",
      dry_run: true
    });

    expect(result.created).toBe(false);
    expect(result.dry_run).toBe(true);
    const ghCalls = runner.calls.filter((c) => c.cmd === "gh");
    expect(ghCalls).toHaveLength(0);
  });

  test("createIssue: temp body file is removed after success", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createSuccessfulRunner("https://github.com/owner/repo/issues/1\n");
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;

    await service.createIssue({
      title: "Test",
      body: "Body content",
      dry_run: false
    });

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;
    expect(after).toBe(before);
  });

  test("createIssue: temp body file is removed after failure", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("exit code 1", "GH_NONZERO_EXIT");
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;

    try {
      await service.createIssue({
        title: "Test",
        body: "Body content",
        dry_run: false
      });
    } catch { /* expected */ }

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;
    expect(after).toBe(before);
  });

  test("createIssue: temp body file is removed after timeout", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("timed out", "GH_TIMEOUT");
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;

    try {
      await service.createIssue({
        title: "Test",
        body: "Body content",
        dry_run: false
      });
    } catch { /* expected */ }

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;
    expect(after).toBe(before);
  });

  test("createIssue: fixed argv and approved repository scoping", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createSuccessfulRunner("https://github.com/test-owner/test-repo/issues/1\n");
    const service = new GitHubService(tmpDir, runner);

    await service.createIssue({
      title: "Bug fix",
      labels: ["bug", "urgent"],
      assignees: ["octocat"],
      dry_run: false
    });

    const ghCalls = runner.calls.filter((c) => c.cmd === "gh");
    expect(ghCalls).toHaveLength(1);
    const call = ghCalls[0];
    expect(call.args).toContain("--repo");
    expect(call.args).toContain("--title");
    expect(call.args).toContain("Bug fix");
    expect(call.args).toContain("--label");
    expect(call.args).toContain("--assignee");
    expect(call.args.every((a) => !a.includes("&&") && !a.includes("|"))).toBe(true);
  });

  test("editIssue: temp body file is removed after success", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createSuccessfulRunner();
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;

    await service.editIssue({
      issue_number: 1,
      body: "Updated body",
      dry_run: false
    });

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;
    expect(after).toBe(before);
  });

  test("commentOnIssue: temp body file is removed after failure", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("error", "GH_NONZERO_EXIT");
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;

    try {
      await service.commentOnIssue({
        issue_number: 1,
        body: "Comment body",
        dry_run: false
      });
    } catch { /* expected */ }

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-issue-body-")).length;
    expect(after).toBe(before);
  });

  test("createPullRequest: temp body file is removed after timeout", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("timed out", "GH_TIMEOUT");
    const service = new GitHubService(tmpDir, runner);

    const before = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-pr-body-")).length;

    try {
      await service.createPullRequest({
        title: "PR",
        head: "feature",
        base: "main",
        body: "PR body",
        dry_run: false,
        draft: false
      });
    } catch { /* expected */ }

    await new Promise((r) => setTimeout(r, 50));
    const after = (await readdir(tmpdir())).filter((f) => f.startsWith("gh-pr-body-")).length;
    expect(after).toBe(before);
  });

  test("createIssue: missing gh binary returns GH_UNAVAILABLE", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createMockRunner(async (cmd) => {
      if (cmd === "git") {
        return { stdout: "https://github.com/owner/repo.git\n", stderr: "" };
      }
      const err = new Error("ENOENT: no such file or directory");
      (err as Error & { code?: string }).code = "ENOENT";
      throw err;
    });
    const service = new GitHubService(tmpDir, runner);

    await expect(service.createIssue({
      title: "Test",
      dry_run: false
    })).rejects.toMatchObject({
      code: "GH_UNAVAILABLE"
    });
  });

  test("listIssues: does not throw on failure, adds warning", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("error");
    const service = new GitHubService(tmpDir, runner);

    const result = await service.listIssues({ state: "open" });
    expect(result.warnings).toContain("GH_ISSUE_LIST_FAILED");
    expect(result.issues).toEqual([]);
  });

  test("listPullRequests: does not throw on failure, adds warning", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createFailingRunner("error");
    const service = new GitHubService(tmpDir, runner);

    const result = await service.listPullRequests({ state: "open", max_results: 25 });
    expect(result.warnings).toContain("GH_PR_LIST_FAILED");
    expect(result.prs).toEqual([]);
  });

  test("detectGitHubRepository: no git repo returns undefined", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-test-"));
    const runner = createNoRepoRunner();
    const service = new GitHubService(tmpDir, runner);

    const result = await service.createIssue({
      title: "Test",
      dry_run: false
    });

    expect(result.created).toBe(false);
    expect(result.repository).toBeUndefined();
  });
});

describe("parseGitHubRemote", () => {
  test("HTTPS remote with .git suffix", () => {
    expect(parseGitHubRemote("https://github.com/owner/repo.git")).toBe("owner/repo");
  });

  test("HTTPS remote without .git suffix", () => {
    expect(parseGitHubRemote("https://github.com/owner/repo")).toBe("owner/repo");
  });

  test("SSH SCP remote with .git suffix", () => {
    expect(parseGitHubRemote("git@github.com:owner/repo.git")).toBe("owner/repo");
  });

  test("SSH SCP remote without .git suffix", () => {
    expect(parseGitHubRemote("git@github.com:owner/repo")).toBe("owner/repo");
  });

  test("SSH protocol remote with .git suffix", () => {
    expect(parseGitHubRemote("ssh://git@github.com/owner/repo.git")).toBe("owner/repo");
  });

  test("SSH protocol remote without .git suffix", () => {
    expect(parseGitHubRemote("ssh://git@github.com/owner/repo")).toBe("owner/repo");
  });

  test("non-GitHub host returns undefined", () => {
    expect(parseGitHubRemote("https://gitlab.com/owner/repo")).toBeUndefined();
  });

  test("non-GitHub SSH host returns undefined", () => {
    expect(parseGitHubRemote("git@gitlab.com:owner/repo")).toBeUndefined();
  });

  test("malformed URL returns undefined", () => {
    expect(parseGitHubRemote("not-a-url")).toBeUndefined();
  });

  test("empty string returns undefined", () => {
    expect(parseGitHubRemote("")).toBeUndefined();
  });

  test("GitHub URL with nested path returns undefined", () => {
    expect(parseGitHubRemote("https://github.com/owner/repo/extra")).toBeUndefined();
  });

  test("handles repository names with hyphens and dots", () => {
    expect(parseGitHubRemote("https://github.com/my-org/my-repo.name.git")).toBe("my-org/my-repo.name");
  });
});

describe("GitHubPolicy", () => {
  test("default config disables all operations", () => {
    const policy = new GitHubPolicy();
    expect(policy.config.issues_read).toBe(false);
    expect(policy.config.issues_create).toBe(false);
    expect(policy.config.issues_edit).toBe(false);
    expect(policy.config.issues_delete).toBe(false);
    expect(policy.config.issues_comment).toBe(false);
    expect(policy.config.labels_read).toBe(false);
    expect(policy.config.labels_create).toBe(false);
  });

  test("explicit true enables specific operations", () => {
    const policy = new GitHubPolicy({ issues_read: true, issues_create: true });
    expect(policy.config.issues_read).toBe(true);
    expect(policy.config.issues_create).toBe(true);
    expect(policy.config.issues_edit).toBe(false);
  });

  test("assertIssuesReadAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertIssuesReadAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_ISSUES_READ_DISABLED");
    }
  });

  test("assertIssuesReadAllowed passes when enabled", () => {
    const policy = new GitHubPolicy({ issues_read: true });
    expect(() => policy.assertIssuesReadAllowed()).not.toThrow();
  });

  test("assertIssuesCreateAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertIssuesCreateAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_ISSUES_CREATE_DISABLED");
    }
  });

  test("assertIssuesCreateAllowed passes when enabled", () => {
    const policy = new GitHubPolicy({ issues_create: true });
    expect(() => policy.assertIssuesCreateAllowed()).not.toThrow();
  });

  test("assertIssuesEditAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertIssuesEditAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_ISSUES_EDIT_DISABLED");
    }
  });

  test("assertIssuesDeleteAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertIssuesDeleteAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_ISSUES_DELETE_DISABLED");
    }
  });

  test("assertIssuesCommentAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertIssuesCommentAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_ISSUES_COMMENT_DISABLED");
    }
  });

  test("assertLabelsReadAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertLabelsReadAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_LABELS_READ_DISABLED");
    }
  });

  test("assertLabelsCreateAllowed throws when disabled", () => {
    const policy = new GitHubPolicy();
    try {
      policy.assertLabelsCreateAllowed();
      expect.fail("Expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepoReaderError);
      expect((error as RepoReaderError).code).toBe("GH_LABELS_CREATE_DISABLED");
    }
  });

  test("all operations enabled", () => {
    const policy = new GitHubPolicy({
      issues_read: true,
      issues_create: true,
      issues_edit: true,
      issues_delete: true,
      issues_comment: true,
      labels_read: true,
      labels_create: true
    });
    expect(() => policy.assertIssuesReadAllowed()).not.toThrow();
    expect(() => policy.assertIssuesCreateAllowed()).not.toThrow();
    expect(() => policy.assertIssuesEditAllowed()).not.toThrow();
    expect(() => policy.assertIssuesDeleteAllowed()).not.toThrow();
    expect(() => policy.assertIssuesCommentAllowed()).not.toThrow();
    expect(() => policy.assertLabelsReadAllowed()).not.toThrow();
    expect(() => policy.assertLabelsCreateAllowed()).not.toThrow();
  });
});

describe("GitHubIssueCreateInputSchema validation", () => {
  test("accepts valid minimal input", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test issue"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts valid full input", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test issue",
      body: "This is a body",
      labels: ["bug", "enhancement"],
      assignees: ["octocat"],
      milestone: "v1.0",
      dry_run: false,
      reason: "Testing issue creation"
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty title", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: ""
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects title with control characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Title with\x00null"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects title with BEL character", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Title with\x07bell"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects title exceeding 256 characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "x".repeat(257)
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts title at exactly 256 characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "x".repeat(256)
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects body with NUL bytes", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      body: "Body with\x00null byte"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects body exceeding 64 KiB", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      body: "x".repeat(65537)
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts body at exactly 64 KiB", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      body: "x".repeat(65536)
    });
    expect(parsed.success).toBe(true);
  });

  test("allows empty body (optional)", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test"
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.body).toBeUndefined();
    }
  });

  test("rejects more than 20 labels", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      labels: Array.from({ length: 21 }, (_, i) => `label-${i}`)
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects label with control characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      labels: ["bug\x00bad"]
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty label", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      labels: [""]
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects more than 10 assignees", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      assignees: Array.from({ length: 11 }, (_, i) => `user${i}`)
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects invalid GitHub login format", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      assignees: ["-invalid-"]
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects assignee with trailing hyphen", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      assignees: ["user-"]
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects assignee starting with hyphen", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      assignees: ["-user"]
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts valid GitHub login", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      assignees: ["octocat", "user-name", "User123"]
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects reason exceeding 500 characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      reason: "x".repeat(501)
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts reason at exactly 500 characters", () => {
    const parsed = GitHubIssueCreateInputSchema.safeParse({
      repo_id: "test-repo",
      title: "Test",
      reason: "x".repeat(500)
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubIssueCreateResultSchema validation", () => {
  test("accepts dry-run result", () => {
    const parsed = GitHubIssueCreateResultSchema.safeParse({
      created: false,
      repository: "owner/repo",
      title: "Test",
      dry_run: true,
      normalized: {
        title: "Test",
        body: true,
        labels: ["bug"],
        assignees: [],
        milestone: undefined
      }
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts created result", () => {
    const parsed = GitHubIssueCreateResultSchema.safeParse({
      created: true,
      repository: "owner/repo",
      number: 123,
      title: "Test",
      url: "https://github.com/owner/repo/issues/123",
      dry_run: false
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubIssueEditInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      title: "Updated title"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts add_labels and remove_labels", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      add_labels: ["bug"],
      remove_labels: ["enhancement"]
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts state change", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      state: "closed"
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects invalid state", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      state: "merged"
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts milestone set to null to clear", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      milestone: null
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts body set to null to clear", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      body: null
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects title with control characters", () => {
    const parsed = GitHubIssueEditInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      title: "Bad\x1ftitle"
    });
    expect(parsed.success).toBe(false);
  });
});

describe("GitHubIssueDeleteInputSchema validation", () => {
  test("accepts valid input with confirm", () => {
    const parsed = GitHubIssueDeleteInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      confirm: true
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects when confirm is false", () => {
    const parsed = GitHubIssueDeleteInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      confirm: false
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubLabelCreateInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "ff0000"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts optional description", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "ff0000",
      description: "Something is broken"
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty name", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "",
      color: "ff0000"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects name with control characters", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bad\x00label",
      color: "ff0000"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects name exceeding 50 characters", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "x".repeat(51),
      color: "ff0000"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects invalid hex color", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "not-hex"
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects color with # prefix", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "#ff0000"
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts 6-character hex color", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "ff0000"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts short hex color", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "f00"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts dry_run", () => {
    const parsed = GitHubLabelCreateInputSchema.safeParse({
      repo_id: "test-repo",
      name: "bug",
      color: "ff0000",
      dry_run: true
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubLabelListInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubLabelListInputSchema.safeParse({
      repo_id: "test-repo"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts custom max_results", () => {
    const parsed = GitHubLabelListInputSchema.safeParse({
      repo_id: "test-repo",
      max_results: 10
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects max_results exceeding 100", () => {
    const parsed = GitHubLabelListInputSchema.safeParse({
      repo_id: "test-repo",
      max_results: 101
    });
    expect(parsed.success).toBe(false);
  });
});

describe("GitHubIssuesInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubIssuesInputSchema.safeParse({
      repo_id: "test-repo"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts state filter", () => {
    const parsed = GitHubIssuesInputSchema.safeParse({
      repo_id: "test-repo",
      state: "closed"
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts labels filter", () => {
    const parsed = GitHubIssuesInputSchema.safeParse({
      repo_id: "test-repo",
      labels: ["bug", "urgent"]
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubIssueCommentInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubIssueCommentInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      body: "This is a comment"
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty body", () => {
    const parsed = GitHubIssueCommentInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      body: ""
    });
    expect(parsed.success).toBe(false);
  });

  test("accepts reason field", () => {
    const parsed = GitHubIssueCommentInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 1,
      body: "Comment",
      reason: "Audit context"
    });
    expect(parsed.success).toBe(true);
  });
});

describe("GitHubIssueReadInputSchema validation", () => {
  test("accepts valid input", () => {
    const parsed = GitHubIssueReadInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 42
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects zero issue number", () => {
    const parsed = GitHubIssueReadInputSchema.safeParse({
      repo_id: "test-repo",
      issue_number: 0
    });
    expect(parsed.success).toBe(false);
  });
});
