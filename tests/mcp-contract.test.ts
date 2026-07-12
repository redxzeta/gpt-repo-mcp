import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { SERVER_INSTRUCTIONS, createMcpServer } from "../src/register.js";
import { RootRegistry } from "../src/services/root-registry.js";
import { createSessionCache } from "../src/runtime/session-cache.js";
import { readOnlyAnnotations, writeAnnotations } from "../src/tools/annotations.js";
import { toolCatalog } from "../src/tools/catalog.js";
import { isMutatingToolName } from "../src/tools/mutating-tools.js";

const execFileAsync = promisify(execFile);

describe("MCP contract", () => {
  test("initialize exposes server instructions and tool capability", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      expect(client.getServerVersion()).toMatchObject({ name: "gpt-repo-mcp", version: "0.1.0" });
      expect(client.getServerCapabilities()).toMatchObject({ tools: {} });
      expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
      expect(SERVER_INSTRUCTIONS).not.toContain("read-only repository app");
      expect(SERVER_INSTRUCTIONS).toContain("Mutating tools are disabled by default and require repo-local config opt-in");
      expect(SERVER_INSTRUCTIONS).toContain("Prefer the repo_write_* names for ChatGPT workflows");
      expect(SERVER_INSTRUCTIONS).toContain("repo_write_commit, repo_write_stage_commit, and repo_git_commit create local commits only");
      expect(SERVER_INSTRUCTIONS).toContain("repo_git_review is the workflow hub");
      expect(SERVER_INSTRUCTIONS).toContain("prefer composite workflow tools");
      expect(SERVER_INSTRUCTIONS).toContain("repo_write_stage_commit for reviewed happy-path local commits");
      expect(SERVER_INSTRUCTIONS).toContain("repo_write_recover for reviewed recovery");
      expect(SERVER_INSTRUCTIONS).toContain("Dry-run is optional preview");
      expect(SERVER_INSTRUCTIONS).toContain("Omit optional reason by default");
      expect(SERVER_INSTRUCTIONS).toContain("repo_last_write");
      expect(SERVER_INSTRUCTIONS).not.toContain("dry-run first when possible");
      expect(SERVER_INSTRUCTIONS).toContain("do not push");
      expect(SERVER_INSTRUCTIONS).toContain("do not run shell commands");
    } finally {
      await close();
    }
  });

  test("tools/list exposes schemas and appropriate annotations for every tool", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const listed = await client.listTools();
      expect(new Set(listed.tools.map((tool) => tool.name))).toEqual(new Set(toolCatalog.map((tool) => tool.name)));

      for (const tool of listed.tools) {
        expect(tool.title).toEqual(expect.any(String));
        expect(tool.description).toEqual(expect.stringMatching(/^Use this when/));
        expect(tool.inputSchema).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
        if (isMutatingToolName(tool.name)) {
          expect(tool.annotations).toMatchObject(writeAnnotations);
        } else {
          expect(tool.annotations).toMatchObject(readOnlyAnnotations);
        }
      }
    } finally {
      await close();
    }
  });

  test("tools/list exposed surface stays stable", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const listed = await client.listTools();

      expect(listed.tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        annotations: tool.annotations,
        inputKeys: Object.keys(tool.inputSchema.properties ?? {}).sort(),
        outputKeys: Object.keys(tool.outputSchema?.properties ?? {}).sort()
      }))).toMatchInlineSnapshot(`
        [
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks which approved repositories are available.",
            "inputKeys": [],
            "name": "repo_list_roots",
            "outputKeys": [
              "repos",
            ],
            "title": "List approved repositories",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when a read, write, or cleanup policy question is blocked or the user asks what can be accessed in a repo.",
            "inputKeys": [
              "operation",
              "path",
              "repo_id",
            ],
            "name": "repo_policy_explain",
            "outputKeys": [
              "cleanup",
              "effective_policy",
              "guidance",
              "ok",
              "operations",
              "path",
              "read",
              "repo_id",
              "requested_operation",
              "summary",
              "write",
            ],
            "title": "Explain repository policy",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what the last write operation changed or how to resume after a previous write.",
            "inputKeys": [
              "repo_id",
            ],
            "name": "repo_last_write",
            "outputKeys": [
              "found",
              "next_tool_payloads",
              "ok",
              "receipt",
              "warnings",
            ],
            "title": "Read last write receipt",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to inspect repository structure or locate files by directory.",
            "inputKeys": [
              "cursor",
              "include_dependencies",
              "include_files",
              "include_generated",
              "max_depth",
              "page_size",
              "path",
              "repo_id",
              "respect_default_excludes",
            ],
            "name": "repo_tree",
            "outputKeys": [
              "entries",
              "excluded_summary",
              "next_cursor",
              "truncated",
            ],
            "title": "Inspect repository tree",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to find code, inspect usages, or locate relevant files by text content.",
            "inputKeys": [
              "context_lines",
              "cursor",
              "exclude_globs",
              "include_globs",
              "max_results",
              "mode",
              "query",
              "repo_id",
            ],
            "name": "repo_search",
            "outputKeys": [
              "matched_count",
              "next_cursor",
              "results",
              "returned_count",
              "truncated",
              "warnings",
            ],
            "title": "Search repository text",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user names a specific file to read. Supports line ranges.",
            "inputKeys": [
              "end_line",
              "max_bytes",
              "override_default_excludes",
              "path",
              "repo_id",
              "start_line",
            ],
            "name": "repo_fetch_file",
            "outputKeys": [
              "end_line",
              "language",
              "path",
              "sha256",
              "size_bytes",
              "start_line",
              "text",
              "total_lines",
              "truncated",
              "warnings",
            ],
            "title": "Fetch one file",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to read a bounded set of explicit files or glob-matched files.",
            "inputKeys": [
              "cursor",
              "exclude_globs",
              "include_globs",
              "max_bytes_per_file",
              "max_files",
              "max_total_bytes",
              "paths",
              "repo_id",
            ],
            "name": "repo_read_many",
            "outputKeys": [
              "files",
              "matched_count",
              "next_cursor",
              "returned_count",
              "skipped",
              "truncated",
            ],
            "title": "Read bounded files",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user wants to understand a codebase through imports, exports, classes, types, and functions.",
            "inputKeys": [
              "exclude_globs",
              "include_globs",
              "max_files",
              "max_symbols",
              "paths",
              "repo_id",
            ],
            "name": "repo_symbol_outline",
            "outputKeys": [
              "counts",
              "files",
              "truncated",
              "warnings",
            ],
            "title": "Outline repository symbols",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what imports what, what depends on a file, or how modules are connected.",
            "inputKeys": [
              "direction",
              "include_globs",
              "max_edges",
              "paths",
              "repo_id",
            ],
            "name": "repo_dependency_map",
            "outputKeys": [
              "counts",
              "edges",
              "external_packages",
              "hotspots",
              "truncated",
              "unresolved_imports",
              "warnings",
            ],
            "title": "Map repository dependencies",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what checks to run or how to validate a change. Returns advisory commands only.",
            "inputKeys": [
              "changed_paths",
              "goal",
              "repo_id",
            ],
            "name": "repo_validation_plan",
            "outputKeys": [
              "affected_areas",
              "commands",
              "package_manager",
              "warnings",
            ],
            "title": "Plan repository validation",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks how to work in a repo or what project-specific rules apply.",
            "inputKeys": [
              "focus",
              "repo_id",
            ],
            "name": "repo_agent_context",
            "outputKeys": [
              "guidance",
              "read_first",
              "scripts",
              "warnings",
            ],
            "title": "Read repository agent context",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to view GitHub issues for an approved repo.",
            "inputKeys": [
              "labels",
              "max_results",
              "query",
              "repo_id",
              "state",
            ],
            "name": "repo_github_issues",
            "outputKeys": [
              "count",
              "issues",
              "repository",
              "warnings",
            ],
            "title": "View GitHub issues",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a GitHub issue in an approved repo.",
            "inputKeys": [
              "assignees",
              "body",
              "dry_run",
              "labels",
              "milestone",
              "repo_id",
              "title",
            ],
            "name": "repo_github_issue_create",
            "outputKeys": [
              "dry_run",
              "issue_number",
              "repository",
              "title",
              "url",
              "warnings",
            ],
            "title": "Create GitHub issue",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to comment on a GitHub issue in an approved repo.",
            "inputKeys": [
              "body",
              "dry_run",
              "issue_number",
              "repo_id",
            ],
            "name": "repo_github_issue_comment",
            "outputKeys": [
              "dry_run",
              "repository",
              "target_number",
              "warnings",
            ],
            "title": "Comment on GitHub issue",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to comment on a GitHub pull request in an approved repo.",
            "inputKeys": [
              "body",
              "dry_run",
              "pr_number",
              "repo_id",
            ],
            "name": "repo_github_pr_comment",
            "outputKeys": [
              "dry_run",
              "repository",
              "target_number",
              "warnings",
            ],
            "title": "Comment on GitHub pull request",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to read full details of a specific GitHub issue.",
            "inputKeys": [
              "issue_number",
              "repo_id",
            ],
            "name": "repo_github_issue_read",
            "outputKeys": [
              "assignees",
              "body",
              "comments_count",
              "labels",
              "milestone",
              "number",
              "repository",
              "state",
              "title",
              "url",
              "warnings",
            ],
            "title": "Read GitHub issue details",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to view pull requests for an approved repo.",
            "inputKeys": [
              "max_results",
              "repo_id",
              "state",
            ],
            "name": "repo_github_pr_list",
            "outputKeys": [
              "count",
              "prs",
              "repository",
              "warnings",
            ],
            "title": "List GitHub pull requests",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to read full details of a specific GitHub pull request.",
            "inputKeys": [
              "pr_number",
              "repo_id",
            ],
            "name": "repo_github_pr_read",
            "outputKeys": [
              "author",
              "base",
              "body",
              "head",
              "labels",
              "mergeable",
              "number",
              "repository",
              "reviewers",
              "state",
              "title",
              "url",
              "warnings",
            ],
            "title": "Read GitHub pull request details",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a GitHub pull request in an approved repo.",
            "inputKeys": [
              "assignees",
              "base",
              "body",
              "draft",
              "dry_run",
              "head",
              "labels",
              "repo_id",
              "reviewers",
              "title",
            ],
            "name": "repo_github_pr_create",
            "outputKeys": [
              "dry_run",
              "pr_number",
              "repository",
              "status",
              "url",
              "warnings",
            ],
            "title": "Create GitHub pull request",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to check CI status or test results for a pull request.",
            "inputKeys": [
              "pr_number",
              "repo_id",
            ],
            "name": "repo_github_pr_checks",
            "outputKeys": [
              "checks",
              "overall_status",
              "repository",
              "warnings",
            ],
            "title": "Get GitHub PR check status",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to view GitHub projects for the repository owner.",
            "inputKeys": [
              "max_results",
              "repo_id",
              "state",
            ],
            "name": "repo_github_project_list",
            "outputKeys": [
              "count",
              "owner",
              "projects",
              "repository",
              "warnings",
            ],
            "title": "List GitHub projects",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to read full details of a specific GitHub project.",
            "inputKeys": [
              "project_number",
              "repo_id",
            ],
            "name": "repo_github_project_read",
            "outputKeys": [
              "closed",
              "description",
              "number",
              "owner",
              "public",
              "repository",
              "short_description",
              "state",
              "title",
              "url",
              "warning",
              "warnings",
            ],
            "title": "Read GitHub project details",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a GitHub project for the repository owner.",
            "inputKeys": [
              "body",
              "dry_run",
              "private",
              "repo_id",
              "title",
            ],
            "name": "repo_github_project_create",
            "outputKeys": [
              "dry_run",
              "owner",
              "project_number",
              "repository",
              "title",
              "url",
              "warnings",
            ],
            "title": "Create GitHub project",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to view items in a GitHub project.",
            "inputKeys": [
              "max_results",
              "project_number",
              "repo_id",
            ],
            "name": "repo_github_project_item_list",
            "outputKeys": [
              "count",
              "items",
              "owner",
              "project_number",
              "repository",
              "warnings",
            ],
            "title": "List GitHub project items",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to add an issue or pull request to a GitHub project.",
            "inputKeys": [
              "dry_run",
              "project_number",
              "repo_id",
              "url",
            ],
            "name": "repo_github_project_item_add",
            "outputKeys": [
              "dry_run",
              "item_url",
              "owner",
              "project_number",
              "repository",
              "warnings",
            ],
            "title": "Add item to GitHub project",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to view GitHub milestones for an approved repo.",
            "inputKeys": [
              "max_results",
              "repo_id",
              "state",
            ],
            "name": "repo_github_milestone_list",
            "outputKeys": [
              "count",
              "milestones",
              "repository",
              "warnings",
            ],
            "title": "List GitHub milestones",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": true,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to read full details of a specific GitHub milestone.",
            "inputKeys": [
              "milestone_number",
              "repo_id",
            ],
            "name": "repo_github_milestone_read",
            "outputKeys": [
              "closed_issues",
              "description",
              "due_on",
              "number",
              "open_issues",
              "repository",
              "state",
              "title",
              "url",
              "warnings",
            ],
            "title": "Read GitHub milestone details",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": true,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a GitHub milestone in an approved repo.",
            "inputKeys": [
              "description",
              "dry_run",
              "due_on",
              "repo_id",
              "title",
            ],
            "name": "repo_github_milestone_create",
            "outputKeys": [
              "dry_run",
              "milestone_number",
              "repository",
              "title",
              "url",
              "warnings",
            ],
            "title": "Create GitHub milestone",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks for git status, branch, dirty files, or changed file counts.",
            "inputKeys": [
              "repo_id",
            ],
            "name": "repo_git_status",
            "outputKeys": [
              "branch",
              "clean",
              "counts",
              "files",
              "head_sha",
            ],
            "title": "Read git status",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to review changes or inspect a git diff.",
            "inputKeys": [
              "base",
              "compare",
              "context_lines",
              "max_bytes",
              "paths",
              "repo_id",
              "staged",
              "unstaged",
            ],
            "name": "repo_git_diff",
            "outputKeys": [
              "base",
              "compare",
              "files",
              "staged",
              "truncated",
              "unstaged",
              "warnings",
            ],
            "title": "Read git diff",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks for commit history, git log, or recent changes.",
            "inputKeys": [
              "max_bytes",
              "max_count",
              "paths",
              "ref",
              "repo_id",
            ],
            "name": "repo_git_log",
            "outputKeys": [
              "entries",
              "total",
              "truncated",
            ],
            "title": "Read git log",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to see a specific commit's details or content.",
            "inputKeys": [
              "commit_sha",
              "max_bytes",
              "repo_id",
            ],
            "name": "repo_git_show",
            "outputKeys": [
              "content",
              "sha",
              "truncated",
            ],
            "title": "Show git commit",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks who changed a line, git blame, or line-level history.",
            "inputKeys": [
              "max_bytes",
              "path",
              "ref",
              "repo_id",
            ],
            "name": "repo_git_blame",
            "outputKeys": [
              "file",
              "lines",
              "total",
              "truncated",
            ],
            "title": "Read git blame",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks about branches, which branch is current, or branch listing.",
            "inputKeys": [
              "include_remotes",
              "max_count",
              "repo_id",
            ],
            "name": "repo_git_branches",
            "outputKeys": [
              "branches",
              "total",
              "truncated",
            ],
            "title": "List git branches",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user wants to review current git changes and get ready-to-run payloads for commit or recovery.",
            "inputKeys": [
              "max_files",
              "mode",
              "repo_id",
            ],
            "name": "repo_git_review",
            "outputKeys": [
              "branch",
              "changed_paths",
              "clean",
              "diff_summary",
              "head_sha",
              "next_tool_payloads",
              "ok",
              "recommendation",
            ],
            "title": "Plan git review",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when compatibility with the git-prefixed staging alias is needed.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_git_stage",
            "outputKeys": [
              "dry_run",
              "head_sha",
              "ok",
              "skipped",
              "staged_paths",
              "warnings",
            ],
            "title": "Stage explicit git paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when compatibility with the git-prefixed unstaging alias is needed.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_git_unstage",
            "outputKeys": [
              "dry_run",
              "head_sha",
              "ok",
              "skipped",
              "unstaged_paths",
              "warnings",
            ],
            "title": "Unstage explicit git paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to recover unstaged worktree changes for specific paths.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_git_restore_paths",
            "outputKeys": [
              "dry_run",
              "head_sha",
              "ok",
              "restored_paths",
              "skipped",
              "warnings",
            ],
            "title": "Restore explicit worktree paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when compatibility with the git-prefixed commit alias is needed.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "expected_staged_paths",
              "message",
              "reason",
              "repo_id",
            ],
            "name": "repo_git_commit",
            "outputKeys": [
              "commit_sha",
              "committed_paths",
              "dry_run",
              "head_after",
              "head_before",
              "ok",
              "warnings",
            ],
            "title": "Create local git commit",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to stage reviewed repo-relative paths.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_write_stage",
            "outputKeys": [
              "dry_run",
              "head_sha",
              "ok",
              "skipped",
              "staged_paths",
              "warnings",
            ],
            "title": "Stage reviewed paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to unstage reviewed repo-relative paths.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_write_unstage",
            "outputKeys": [
              "dry_run",
              "head_sha",
              "ok",
              "skipped",
              "unstaged_paths",
              "warnings",
            ],
            "title": "Unstage reviewed paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a local-only commit from staged paths.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "expected_staged_paths",
              "message",
              "reason",
              "repo_id",
            ],
            "name": "repo_write_commit",
            "outputKeys": [
              "commit_sha",
              "committed_paths",
              "dry_run",
              "head_after",
              "head_before",
              "ok",
              "warnings",
            ],
            "title": "Create reviewed local commit",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user approves staging and committing exact paths after reviewing git changes.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "message",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_write_stage_commit",
            "outputKeys": [
              "clean_after",
              "commit_sha",
              "committed_paths",
              "dry_run",
              "head_after",
              "head_before",
              "ok",
              "remaining_changes",
              "staged_paths",
              "warnings",
            ],
            "title": "Stage and commit reviewed paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user approves recovering exact paths after reviewing git changes.",
            "inputKeys": [
              "cleanup_paths",
              "dry_run",
              "expected_head_sha",
              "reason",
              "repo_id",
              "restore_paths",
              "unstage_paths",
            ],
            "name": "repo_write_recover",
            "outputKeys": [
              "clean_after",
              "deleted",
              "dry_run",
              "head_sha",
              "ok",
              "remaining_changes",
              "restored_paths",
              "skipped",
              "unstaged_paths",
              "warnings",
            ],
            "title": "Recover reviewed paths",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to delete generated artifacts or local ChatGPT artifacts.",
            "inputKeys": [
              "dry_run",
              "paths",
              "reason",
              "repo_id",
            ],
            "name": "repo_cleanup_paths",
            "outputKeys": [
              "deleted",
              "dry_run",
              "ok",
              "skipped",
              "warnings",
            ],
            "title": "Clean up generated paths",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to understand, onboard, or plan work for a repository.",
            "inputKeys": [
              "include",
              "repo_id",
            ],
            "name": "repo_project_brief",
            "outputKeys": [
              "key_docs",
              "languages",
              "likely_entrypoints",
              "package_managers",
              "project_type",
              "repo",
              "scripts",
              "test_commands",
              "truncated",
              "warnings",
            ],
            "title": "Create project brief",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to find TODOs, FIXMEs, roadmap items, or backlog candidates.",
            "inputKeys": [
              "cursor",
              "exclude_globs",
              "include_globs",
              "labels",
              "max_results",
              "repo_id",
            ],
            "name": "repo_task_inventory",
            "outputKeys": [
              "matched_count",
              "next_cursor",
              "returned_count",
              "scan_complete",
              "scanned_file_count",
              "tasks",
              "truncated",
              "warnings",
            ],
            "title": "Inventory repository tasks",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks about architecture decisions, conventions, or project rationale.",
            "inputKeys": [
              "include_sources",
              "repo_id",
            ],
            "name": "repo_decision_memory",
            "outputKeys": [
              "conventions",
              "decisions",
              "gaps",
              "warnings",
            ],
            "title": "Extract decision memory",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks how to implement, refactor, or fix something without writing files.",
            "inputKeys": [
              "goal",
              "include_globs",
              "max_files_to_inspect",
              "planning_depth",
              "repo_id",
            ],
            "name": "repo_change_plan",
            "outputKeys": [
              "estimated_cost",
              "goal",
              "open_questions",
              "proposed_steps",
              "relevant_files",
              "scan_complete",
              "test_strategy",
              "warnings",
            ],
            "title": "Plan repository change",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what to do next, what to prioritize, or whether work is ready to ship.",
            "inputKeys": [
              "horizon",
              "mode",
              "repo_id",
            ],
            "name": "repo_next_action",
            "outputKeys": [
              "blockers",
              "confidence",
              "rationale",
              "recommendation",
              "suggested_actions",
              "useful_context",
              "warnings",
            ],
            "title": "Recommend next action",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks for broad or ambiguous repository review.",
            "inputKeys": [
              "prompt",
            ],
            "name": "repo_plan_review",
            "outputKeys": [
              "estimated_cost",
              "explicit_full_repo",
              "recommended_next_tools",
              "recommended_scope",
              "should_ask_clarifying_question",
              "suggested_question",
            ],
            "title": "Plan repository review",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks for a Codex prompt returned in chat for review.",
            "inputKeys": [
              "acceptance_criteria",
              "allowed_paths",
              "context_summary",
              "forbidden_paths",
              "implementation_scope",
              "inspect_first",
              "objective",
              "repo_id",
              "run_id",
              "title",
              "verification_commands",
            ],
            "name": "repo_prepare_codex_task",
            "outputKeys": [
              "codex_user_prompt",
              "manifest_path",
              "next_steps",
              "ok",
              "prompt_markdown",
              "prompt_path",
              "repo_id",
              "result_path",
              "run_id",
              "warnings",
            ],
            "title": "Prepare Codex task prompt",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to write a Codex prompt into the repo for later execution.",
            "inputKeys": [
              "acceptance_criteria",
              "allowed_paths",
              "context_summary",
              "dry_run",
              "forbidden_paths",
              "implementation_scope",
              "inspect_first",
              "objective",
              "reason",
              "repo_id",
              "run_id",
              "title",
              "verification_commands",
            ],
            "name": "repo_write_codex_task",
            "outputKeys": [
              "codex_user_prompt",
              "dry_run",
              "manifest_path",
              "next_steps",
              "ok",
              "prompt_markdown",
              "prompt_path",
              "repo_id",
              "result_path",
              "run_id",
              "warnings",
              "written_paths",
            ],
            "title": "Write Codex task prompt",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to review a repo-local Codex run result.",
            "inputKeys": [
              "max_files",
              "repo_id",
              "run_id",
            ],
            "name": "repo_codex_review",
            "outputKeys": [
              "codex_result",
              "git_review",
              "next_steps",
              "next_tool_payloads",
              "ok",
              "repo_id",
              "result_found",
              "result_path",
              "run_id",
              "warnings",
            ],
            "title": "Review Codex result",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to write or edit one allowed repository file.",
            "inputKeys": [
              "action",
              "content",
              "create_dirs",
              "dry_run",
              "find",
              "path",
              "reason",
              "replace",
              "repo_id",
            ],
            "name": "repo_write_file",
            "outputKeys": [
              "action",
              "bytes_written",
              "changed",
              "created",
              "dry_run",
              "new_sha256",
              "ok",
              "old_sha256",
              "operation_receipt",
              "path",
              "summary",
              "warnings",
            ],
            "title": "Write one repository file",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to apply a multi-file edit pack to allowed repository files.",
            "inputKeys": [
              "changes",
              "dry_run",
              "reason",
              "repo_id",
            ],
            "name": "repo_write_changes",
            "outputKeys": [
              "changed_paths",
              "counts",
              "dry_run",
              "files",
              "next_steps",
              "ok",
              "operation_receipt",
              "summary",
              "warnings",
            ],
            "title": "Apply repository edit pack",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create a local-only ChatGPT handoff for session resume.",
            "inputKeys": [
              "completed_work",
              "constraints",
              "current_state",
              "current_track",
              "decisions",
              "dry_run",
              "important_files",
              "next_steps",
              "open_questions",
              "repo_id",
              "risks",
              "title",
              "update_current",
              "why",
              "workflow",
            ],
            "name": "repo_write_handoff",
            "outputKeys": [
              "branch",
              "clean",
              "current_next_step",
              "current_path",
              "dry_run",
              "handoff_path",
              "head_sha",
              "ok",
              "startup_prompt",
              "updated_current",
              "warnings",
            ],
            "title": "Create ChatGPT handoff",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to see previous handoffs or list session resume notes.",
            "inputKeys": [
              "max_results",
              "repo_id",
            ],
            "name": "repo_handoff_list",
            "outputKeys": [
              "current_path",
              "handoffs",
              "total",
              "truncated",
            ],
            "title": "List session handoffs",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what actions are available or what commands can be run.",
            "inputKeys": [
              "repo_id",
            ],
            "name": "repo_action_list",
            "outputKeys": [
              "actions",
              "enabled",
              "warnings",
            ],
            "title": "List configured actions",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks for details about a specific configured action.",
            "inputKeys": [
              "name",
              "repo_id",
            ],
            "name": "repo_action_describe",
            "outputKeys": [
              "args",
              "command",
              "mutates_files",
              "name",
              "timeout_ms",
              "warnings",
            ],
            "title": "Describe configured action",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user explicitly asks to run a configured action.",
            "inputKeys": [
              "name",
              "reason",
              "repo_id",
            ],
            "name": "repo_action_run",
            "outputKeys": [
              "action",
              "changed_paths",
              "completed_at",
              "duration_ms",
              "exit_code",
              "output_truncated",
              "run_id",
              "started_at",
              "status",
              "stderr_excerpt",
              "stdout_excerpt",
              "warnings",
              "worktree_after",
              "worktree_before",
            ],
            "title": "Run configured action",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks about the status of a previous action run.",
            "inputKeys": [
              "repo_id",
              "run_id",
            ],
            "name": "repo_action_status",
            "outputKeys": [
              "action",
              "changed_paths",
              "completed_at",
              "duration_ms",
              "exit_code",
              "output_truncated",
              "run_id",
              "started_at",
              "status",
              "stderr_excerpt",
              "stdout_excerpt",
              "warnings",
              "worktree_after",
              "worktree_before",
            ],
            "title": "Read action run status",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to see stdout/stderr from a previous action run.",
            "inputKeys": [
              "max_bytes",
              "repo_id",
              "run_id",
            ],
            "name": "repo_action_logs",
            "outputKeys": [
              "run_id",
              "stderr",
              "stderr_truncated",
              "stdout",
              "stdout_truncated",
              "warnings",
            ],
            "title": "Read action run logs",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to cancel a running or queued action.",
            "inputKeys": [
              "repo_id",
              "run_id",
            ],
            "name": "repo_action_cancel",
            "outputKeys": [
              "action",
              "run_id",
              "status",
              "warnings",
            ],
            "title": "Cancel running action",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks to see recent action runs or execution history.",
            "inputKeys": [
              "max_results",
              "repo_id",
            ],
            "name": "repo_action_recent",
            "outputKeys": [
              "count",
              "runs",
              "warnings",
            ],
            "title": "List recent action runs",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to create new files without overwriting existing ones.",
            "inputKeys": [
              "dry_run",
              "expected_head_sha",
              "files",
              "reason",
              "repo_id",
            ],
            "name": "repo_create_files",
            "outputKeys": [
              "created_directories",
              "created_files",
              "head_sha",
              "skipped",
              "status",
              "warnings",
            ],
            "title": "Create new files",
          },
          {
            "annotations": {
              "destructiveHint": true,
              "idempotentHint": false,
              "openWorldHint": false,
              "readOnlyHint": false,
            },
            "description": "Use this when the user asks to apply a unified diff patch to the repository.",
            "inputKeys": [
              "dry_run",
              "expected_files",
              "expected_head_sha",
              "patch",
              "reason",
              "repo_id",
            ],
            "name": "repo_apply_patch",
            "outputKeys": [
              "applied_files",
              "diff_summary",
              "rejected_hunks",
              "status",
              "warnings",
            ],
            "title": "Apply unified diff patch",
          },
          {
            "annotations": {
              "destructiveHint": false,
              "idempotentHint": true,
              "openWorldHint": false,
              "readOnlyHint": true,
            },
            "description": "Use this when the user asks what tools are available, current tool profile, or active policies.",
            "inputKeys": [
              "repo_id",
            ],
            "name": "repo_manifest",
            "outputKeys": [
              "policies",
              "profile",
              "tool_count",
              "tools",
            ],
            "title": "Tool manifest and policies",
          },
        ]
      `);
    } finally {
      await close();
    }
  });

  test("tools/call returns structuredContent matching the advertised output", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const result = await client.callTool({
        name: "repo_list_roots",
        arguments: {}
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        repos: [
          expect.objectContaining({
            repo_id: "fixture",
            display_name: "Fixture Repo",
            root: expect.any(String)
          })
        ]
      });
      expect(result.content).toEqual([{ type: "text", text: "1 approved repositories available." }]);
    } finally {
      await close();
    }
  });

  test("repo_write_changes partial failure exposes safe diagnostics in error envelope", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const result = await client.callTool({
        name: "repo_write_changes",
        arguments: {
          repo_id: "fixture",
          changes: [
            { type: "write", path: "docs/applied-a.md", content: "A\n" },
            { type: "append", path: "docs/ARCHITECTURE.md", content: "Applied\n" },
            { type: "replace", path: "src/app.ts", find: "missingNeedle", replace: "safeFetch" }
          ]
        }
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: {
          code: "WRITE_FIND_NOT_FOUND",
          retryable: false,
          diagnostics: {
            applied_paths: ["docs/applied-a.md", "docs/ARCHITECTURE.md"],
            failed_path: "src/app.ts",
            recovery_hint: expect.stringContaining("repo_git_review")
          }
        }
      });
      const serialized = JSON.stringify(result.structuredContent);
      expect(serialized).not.toContain("/Users/");
      expect(serialized).not.toContain("A\\n");
      expect(serialized).not.toContain("Applied\\n");
    } finally {
      await close();
    }
  });

  test("repo_last_write returns missing receipt when no write receipt exists", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const result = await client.callTool({
        name: "repo_last_write",
        arguments: { repo_id: "fixture" }
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        ok: true,
        found: false,
        next_tool_payloads: {},
        warnings: ["NO_LAST_WRITE_RECEIPT"]
      });
    } finally {
      await close();
    }
  });

  test("actual repo_write_file creates last write receipt", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const write = await client.callTool({
        name: "repo_write_file",
        arguments: {
          repo_id: "fixture",
          path: "docs/write-file-actual.md",
          content: "actual\n"
        }
      });
      expect(write.isError).toBeUndefined();
      expect(write.structuredContent).toMatchObject({
        operation_receipt: {
          operation_id: expect.stringMatching(/^write-/),
          path: ".chatgpt/operations/last-write.json"
        }
      });

      const result = await client.callTool({
        name: "repo_last_write",
        arguments: { repo_id: "fixture" }
      });

      expect(result.structuredContent).toMatchObject({
        ok: true,
        found: true,
        receipt: {
          tool: "repo_write_file",
          repo_id: "fixture",
          touched_paths: ["docs/write-file-actual.md"],
          changed_paths: ["docs/write-file-actual.md"],
          created_paths: ["docs/write-file-actual.md"],
          modified_paths: [],
          counts: { requested: 1, changed: 1, created: 1, unchanged: 0 },
          summary: "Created docs/write-file-actual.md."
        },
        next_tool_payloads: {
          repo_git_review: { repo_id: "fixture" }
        },
        warnings: []
      });
      const serialized = JSON.stringify(result.structuredContent);
      expect(serialized).not.toContain("actual\\n");
      expect(serialized).not.toContain("/tmp/");
    } finally {
      await close();
    }
  });

  test("repo_write_changes creates receipt and dry-run failed and no-op writes do not overwrite it", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const writeChanges = await client.callTool({
        name: "repo_write_changes",
        arguments: {
          repo_id: "fixture",
          changes: [
            { type: "write", path: "docs/new-receipt.md", content: "new\n" },
            { type: "append", path: "docs/ARCHITECTURE.md", content: "changed\n" }
          ]
        }
      });
      expect(writeChanges.isError).toBeUndefined();

      const firstReceipt = await client.callTool({
        name: "repo_last_write",
        arguments: { repo_id: "fixture" }
      });
      expect(firstReceipt.structuredContent).toMatchObject({
        found: true,
        receipt: {
          tool: "repo_write_changes",
          touched_paths: ["docs/new-receipt.md", "docs/ARCHITECTURE.md"],
          changed_paths: ["docs/new-receipt.md", "docs/ARCHITECTURE.md"],
          created_paths: ["docs/new-receipt.md"],
          modified_paths: ["docs/ARCHITECTURE.md"],
          counts: { requested: 2, changed: 2, created: 1, unchanged: 0 },
          summary: "Applied 2 changes across 2 files."
        }
      });
      const firstOperationId = (firstReceipt.structuredContent as {
        receipt?: { operation_id?: string };
      }).receipt?.operation_id;

      await client.callTool({
        name: "repo_write_file",
        arguments: {
          repo_id: "fixture",
          path: "docs/dry-run-no-receipt.md",
          content: "dry\n",
          dry_run: true
        }
      });
      await client.callTool({
        name: "repo_write_file",
        arguments: {
          repo_id: "fixture",
          path: "secrets/blocked.md",
          content: "blocked\n"
        }
      });
      await client.callTool({
        name: "repo_write_file",
        arguments: {
          repo_id: "fixture",
          path: "docs/ARCHITECTURE.md",
          content: "# Architecture\nDecision: keep tools read-only.\nConvention: use contracts first.\nchanged\n"
        }
      });

      const finalReceipt = await client.callTool({
        name: "repo_last_write",
        arguments: { repo_id: "fixture" }
      });

      expect((finalReceipt.structuredContent as {
        receipt?: { operation_id?: string };
      }).receipt?.operation_id).toBe(firstOperationId);
    } finally {
      await close();
    }
  });

  test("repo_write_handoff returns success envelope from HandoffService", async () => {
    const { client, close } = await connectFixtureServer();
    try {
      const result = await client.callTool({
        name: "repo_write_handoff",
        arguments: {
          repo_id: "fixture",
          title: "MCP Handoff",
          current_state: "Tool wiring is under test.",
          why: "The next ChatGPT session needs local resume context.",
          next_steps: [{ title: "Continue Slice v2.2" }],
          dry_run: true
        }
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        ok: true,
        dry_run: true,
        handoff_path: expect.stringMatching(/^\.chatgpt\/handoffs\/\d{4}-\d{2}-\d{2}-\d{4}-mcp-handoff\.local\.md$/),
        current_path: ".chatgpt/handoffs/current.local.md",
        updated_current: true,
        branch: expect.any(String),
        head_sha: expect.any(String),
        clean: false,
        startup_prompt: expect.stringContaining("repo_id `fixture`"),
        current_next_step: "Continue Slice v2.2",
        warnings: []
      });
      expect(result.content).toEqual([
        { type: "text", text: expect.stringContaining("Dry run checked handoff") }
      ]);
    } finally {
      await close();
    }
  });

  test("representative calls for every tool match their output schema", async () => {
    const { client, close, head } = await connectFixtureServer();
    try {
      for (const [name, args] of Object.entries(representativeCalls(head))) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError, name).toBeUndefined();
        expect(result.structuredContent, name).toBeDefined();

        const definition = toolCatalog.find((tool) => tool.name === name);
        expect(definition, name).toBeDefined();
        const parsed = definition!.outputSchema.safeParse(result.structuredContent);
        expect(parsed.error?.issues, name).toBeUndefined();
        expect(result.content, name).toEqual([
          expect.objectContaining({ type: "text", text: expect.any(String) })
        ]);
      }
    } finally {
      await close();
    }
  });
});

function representativeCalls(head: string): Record<string, Record<string, unknown>> {
  return {
  repo_list_roots: {},
  repo_last_write: { repo_id: "fixture" },
  repo_tree: { repo_id: "fixture", path: ".", max_depth: 2, page_size: 10 },
  repo_search: { repo_id: "fixture", query: "Fixture", max_results: 5 },
  repo_fetch_file: { repo_id: "fixture", path: "README.md", start_line: 1, end_line: 5 },
  repo_read_many: { repo_id: "fixture", paths: ["README.md", "src/app.ts"], max_files: 2 },
  repo_git_status: { repo_id: "fixture" },
  repo_git_diff: { repo_id: "fixture" },
  repo_git_review: { repo_id: "fixture" },
  repo_git_stage: { repo_id: "fixture", paths: ["docs/write-dry-run.md"], expected_head_sha: head, dry_run: true },
  repo_git_unstage: { repo_id: "fixture", paths: ["docs/staged.md"], expected_head_sha: head, dry_run: true },
  repo_git_restore_paths: { repo_id: "fixture", paths: ["docs/write-dry-run.md"], expected_head_sha: head, dry_run: true },
  repo_git_commit: { repo_id: "fixture", message: "Update staged docs", expected_head_sha: head, expected_staged_paths: ["docs/staged.md"], dry_run: true },
  repo_write_stage: { repo_id: "fixture", paths: ["docs/write-dry-run.md"], expected_head_sha: head, dry_run: true },
  repo_write_unstage: { repo_id: "fixture", paths: ["docs/staged.md"], expected_head_sha: head, dry_run: true },
  repo_write_commit: { repo_id: "fixture", message: "Update staged docs", expected_head_sha: head, expected_staged_paths: ["docs/staged.md"], dry_run: true },
  repo_write_stage_commit: { repo_id: "fixture", paths: ["docs/staged.md"], message: "Update staged docs", expected_head_sha: head, dry_run: true },
  repo_write_recover: { repo_id: "fixture", restore_paths: ["docs/write-dry-run.md"], cleanup_paths: [".chatgpt/tool-tests/cleanup.txt"], expected_head_sha: head, dry_run: true },
  repo_cleanup_paths: { repo_id: "fixture", paths: [".chatgpt/tool-tests/cleanup.txt"], dry_run: true },
  repo_project_brief: { repo_id: "fixture" },
  repo_task_inventory: { repo_id: "fixture", max_results: 5 },
  repo_decision_memory: { repo_id: "fixture" },
  repo_change_plan: { repo_id: "fixture", goal: "Add fixture validation", planning_depth: "quick" },
  repo_next_action: { repo_id: "fixture", mode: "plan", horizon: "today" },
  repo_plan_review: { prompt: "Granska mina ändringar" },
  repo_prepare_codex_task: {
    repo_id: "fixture",
    title: "Fix fixture docs",
    objective: "Read docs/ARCHITECTURE.md and propose a focused Codex implementation.",
    inspect_first: ["docs/ARCHITECTURE.md"],
    allowed_paths: ["docs/ARCHITECTURE.md"],
    verification_commands: ["npm test -- tests/mcp-contract.test.ts"]
  },
  repo_write_codex_task: {
    repo_id: "fixture",
    title: "Fix fixture docs",
    objective: "Read docs/ARCHITECTURE.md and propose a focused Codex implementation.",
    inspect_first: ["docs/ARCHITECTURE.md"],
    allowed_paths: ["docs/ARCHITECTURE.md"],
    dry_run: true
  },
  repo_codex_review: {
    repo_id: "fixture",
    run_id: "2026-06-04T081500Z-fix-fixture-docs"
  },
  repo_write_file: { repo_id: "fixture", path: "docs/write-file-dry-run.md", content: "planned\n", dry_run: true },
  repo_write_changes: {
    repo_id: "fixture",
    changes: [
      { type: "write", path: "docs/write-changes-dry-run.md", content: "planned\n" },
      {
        type: "edit",
        path: "docs/ARCHITECTURE.md",
        edits: [
          { type: "replace", find: "Decision: keep tools read-only.", replace: "Decision: keep tools safe by default." },
          { type: "insert_after", find: "Convention: use contracts first.", content: "\nConvention: review grouped edits through git." }
        ]
      }
    ],
    dry_run: true
  },
  repo_write_handoff: {
    repo_id: "fixture",
    title: "Representative Handoff",
    current_state: "Representative MCP contract call is running.",
    why: "Output schema should validate for the handoff tool.",
    next_steps: [{ title: "Review handoff output" }],
    dry_run: true
  }
  };
}

async function connectFixtureServer() {
  const root = await createRepoRoot();
  const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, env: { PATH: process.env.PATH ?? "" } })).stdout.trim();
  const registry = await RootRegistry.fromConfig({
    repos: [{
      repo_id: "fixture",
      display_name: "Fixture Repo",
      root,
      writes: { enabled: true, allowed_globs: ["docs/**", "src/**", ".chatgpt/**"] },
      operations: {
        enabled: true,
        git_stage_enabled: true,
        git_commit_enabled: true,
        cleanup_enabled: true
      }
    }],
    limits: {}
  });
  const server = createMcpServer({ registry, limits: registry.limits, toolProfile: "full", cache: createSessionCache() });
  const client = new Client({ name: "contract-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  return {
    client,
    head,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

async function createRepoRoot() {
  const root = await mkdtemp(join(tmpdir(), "gpt-repo-mcp-contract-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, ".chatgpt", "tool-tests"), { recursive: true });
  await writeFile(join(root, "README.md"), "# Fixture\n");
  await writeFile(join(root, "docs", "ARCHITECTURE.md"), "# Architecture\nDecision: keep tools read-only.\nConvention: use contracts first.\n");
  await writeFile(join(root, "TODO.md"), "- [ ] Wire repo_task_inventory\n");
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      build: "tsc",
      test: "vitest"
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.0.0"
    }
  }, null, 2));
  await writeFile(join(root, "src", "app.ts"), "export const fixture = true;\n");
  await execFileAsync("git", ["init"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  await execFileAsync("git", ["add", "--", "README.md", "docs/ARCHITECTURE.md", "TODO.md", "package.json", "src/app.ts"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  await writeFile(join(root, "src-placeholder.txt"), "changed\n");
  await writeFile(join(root, "docs", "staged.md"), "staged\n");
  await writeFile(join(root, "docs", "write-dry-run.md"), "planned\n");
  await writeFile(join(root, ".chatgpt", "tool-tests", "cleanup.txt"), "temporary\n");
  await execFileAsync("git", ["add", "--", "docs/staged.md"], { cwd: root, env: { PATH: process.env.PATH ?? "" } });
  return root;
}
