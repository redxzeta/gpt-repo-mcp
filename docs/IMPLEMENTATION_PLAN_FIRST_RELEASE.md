# Implementation Plan: First Vertical Release

**Based on:** `docs/AGENTIC_IMPLEMENTATION_PLAN.md` (Sections 0, 1, 2, 5, 11)  
**Date:** 2026-07-11  
**Status:** Ready to implement

---

## Scope

14 new tools across 3 domains, 4 new files, ~15 modified files, 2 commit points.

The goal is to deliver the first complete practical loop:

```text
Understand request
  -> create or edit files
  -> validate
  -> review
  -> commit
  -> open PR
  -> inspect CI
```

---

## Step 1: Commit Dirty State

**Action:** `git add -A && git commit`

The working tree has uncommitted GitHub tools + repo-intelligence work. Commit it as a clean checkpoint before new work.

Files already dirty (no edits needed, just commit):
- `src/contracts/github.contract.ts`
- `src/contracts/repo-intelligence.contract.ts`
- `src/services/github-issues-service.ts`
- `src/services/repo-intelligence-service.ts`
- `src/tools/catalog.ts`, `contracts.ts`, `handlers.ts`, `descriptions.ts`, `annotations.ts`
- `src/instructions.ts`
- `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TOOL_SURFACE.md`
- `README.md`

---

## Step 2: Add Tool Effect Metadata

**Goal:** Replace binary read/write annotations with explicit effect classification per the plan.

### Modify `src/tools/annotations.ts`

Add `ToolEffect` type and annotation derivation:

```ts
export type ToolEffect =
  | "local-read"
  | "external-read"
  | "local-write"
  | "external-write"
  | "process-read"
  | "process-write";

export function annotationsForEffect(effect: ToolEffect) {
  switch (effect) {
    case "local-read":
      return readOnlyAnnotations;
    case "external-read":
      return externalReadOnlyAnnotations;
    case "external-write":
      return externalWriteAnnotations;
    case "local-write":
    case "process-read":
    case "process-write":
      return writeAnnotations;
  }
}
```

### Modify `src/tools/catalog.ts`

Add `effect: ToolEffect` to `ToolDefinition` type. Assign each tool its effect:

| Effect | Tools |
|--------|-------|
| `local-read` | All read-only tools (repo_list_roots through repo_plan_review, repo_prepare_codex_task, repo_codex_review, repo_symbol_outline, repo_dependency_map, repo_validation_plan, repo_agent_context) |
| `external-read` | repo_github_issues |
| `external-write` | repo_github_issue_create, repo_github_issue_comment, repo_github_pr_comment |
| `local-write` | All write/commit/stage/unstage/restore/cleanup tools |

### Modify `src/tools/define-tool.ts`

Derive annotations from effect if `annotations` field is absent (backward compat).

---

## Step 3: Action Tools (7 tools)

### 3a. Config Schema (`src/config/schema.ts`)

Add action definition and actions config schemas:

```ts
export const ActionDefinitionSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  timeout_ms: z.number().int().positive().default(120000),
  mutates_files: z.boolean().default(false)
}).passthrough();

export const ActionsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  max_concurrent: z.number().int().positive().default(2),
  definitions: z.record(z.string(), ActionDefinitionSchema).default({})
}).passthrough();
```

Extend `RepoConfigSchema` with optional `actions: ActionsConfigSchema`.

Extend `RootRegistry` to expose `actions` from repo config.

### 3b. Contracts (`src/contracts/actions.contract.ts`) — NEW FILE

7 schema pairs:

- **ActionListInputSchema / ActionListResultSchema** — lists configured actions
- **ActionDescribeInputSchema / ActionDescribeResultSchema** — detailed definition
- **ActionRunInputSchema / ActionRunResultSchema** — synchronous execution with bounded output, status: `"completed" | "failed" | "timed_out"`
- **ActionStatusInputSchema / ActionStatusResultSchema** — read run status from `.chatgpt/actions/<run-id>/run.json`
- **ActionLogsInputSchema / ActionLogsResultSchema** — bounded stdout/stderr excerpts
- **ActionCancelInputSchema / ActionCancelResultSchema** — kill running process, status: `"cancelled"`
- **ActionRecentInputSchema / ActionRecentResultSchema** — recent runs list (last 20)

Run metadata layout:
```
.chatgpt/actions/<run-id>/
  run.json
  stdout.log
  stderr.log
  result.json
```

Result contract for run:
```ts
{
  run_id: string;
  action: string;
  status: "queued" | "running" | "completed" | "failed" | "timed_out" | "cancelled";
  exit_code?: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
  output_truncated: boolean;
  worktree_before: GitStatusSummary;
  worktree_after?: GitStatusSummary;
  changed_paths?: string[];
}
```

### 3c. Service (`src/services/action-service.ts`) — NEW FILE

`ActionService` class:

- `constructor(root, actionsConfig?)`
- `list()` — returns configured actions with descriptions
- `describe(name)` — returns full definition
- `run(name, options)` — executes via `execFile(command, args, { timeout, cwd })`, captures stdout/stderr with bounded buffers, writes run metadata to `.chatgpt/actions/<run-id>/`, returns structured result
- `status(runId)` — reads `run.json`
- `logs(runId, options)` — bounded excerpts from `stdout.log` / `stderr.log`
- `cancel(runId)` — kills process via PID stored in `run.json`, updates status
- `recent(repoId)` — lists recent runs from `.chatgpt/actions/`

Use atomic JSON writes (same pattern as `file-writer.ts`).

### 3d. Handlers (`src/tools/handlers.ts`)

7 thin handler functions following the `safeTool` pattern. Example:

```ts
export const actionRunHandler: ToolHandler = async (input, context) =>
  safeTool<ActionRunInput>("repo_action_run", input, context, async (args) => {
    const repo = context.registry.get(args.repo_id);
    const result = await new ActionService(repo.root, repo.actions).run(args);
    audit({ tool: "repo_action_run", repo_id: args.repo_id, run_id: result.run_id, warnings: result.warnings });
    return createSuccessEnvelope(result, `Action ${result.action} finished with status ${result.status}.`);
  });
```

### 3e. Catalog + Contracts + Descriptions Wiring

- Add 7 tool names to `ToolName` union in `src/tools/contracts.ts`
- Add 7 entries to `toolContracts`
- Add 7 entries to `toolCatalog` (annotations: readOnly for list/describe/status/logs/recent, write for run/cancel)
- Add 7 descriptions to `src/tools/descriptions.ts`
- Add `repo_action_run`, `repo_action_cancel` to `MUTATING_TOOL_NAMES` in `src/tools/mutating-tools.ts`
- Update `src/instructions.ts` to mention action tools

### 3f. Config Example

Update `config.example.json` with actions section (disabled by default):

```json
{
  "repos": [],
  "limits": {
    "max_files": 50,
    "max_bytes_per_file": 128000,
    "max_total_bytes": 750000
  }
}
```

Note: actions config goes inside each repo's config, not at the top level.

---

## Step 4: File Mutation Primitives (2 tools)

### 4a. Contracts (`src/contracts/file-operations.contract.ts`) — NEW FILE

**CreateFilesInputSchema:**
```ts
{
  repo_id: string;
  files: Array<{ path: string; content?: string; create_parent_directories?: boolean }>;
  expected_head_sha?: string;
  dry_run?: boolean;
  reason?: string;
}
```

**CreateFilesResultSchema:**
```ts
{
  status: "previewed" | "created";
  head_sha: string;
  created_files: Array<{ path: string; bytes: number; sha256: string }>;
  created_directories: string[];
  skipped: Array<{ path: string; reason: string }>;
  warnings: string[];
}
```

Rules: create only (never overwrite), max 25 files, UTF-8 only, validate all paths before writing any, atomic temp-file rename.

**ApplyPatchInputSchema:**
```ts
{
  repo_id: string;
  patch: string;
  expected_head_sha: string;
  expected_files?: Array<{ path: string; sha256: string }>;
  dry_run?: boolean;
  reason?: string;
}
```

**ApplyPatchResultSchema:**
```ts
{
  status: "previewed" | "applied";
  applied_files: Array<{ path: string; sha256: string }>;
  rejected_hunks: string[];
  diff_summary: string;
  warnings: string[];
}
```

Use fixed `git apply --check` and `git apply` argument arrays with patch data through stdin.

### 4b. Service (`src/services/file-create-service.ts`) — NEW FILE

`FileCreateService` class:
- `createFiles(input)` — validates all paths upfront, checks no target exists, creates parent dirs if allowed within repo root, writes via atomic temp-file rename, records sha256 hashes
- Reuses `PathSandbox`, `WritePolicy`, `SecretScanner` from existing services

`PatchService` (same file):
- `applyPatch(input)` — writes patch to temp file, runs `git apply --check` then `git apply` via `execFile` with fixed args, reads affected file hashes, returns diff summary via `git diff --stat`

### 4c. Error Codes

Add to `RepoReaderErrorCode` in `src/runtime/errors.ts`:
- `CREATE_PATH_EXISTS`
- `CREATE_PATH_DENIED`
- `CREATE_BATCH_TOO_LARGE`
- `CREATE_CONTENT_TOO_LARGE`

### 4d. Handlers + Catalog + Descriptions

- Add `repo_create_files`, `repo_apply_patch` to `ToolName`, `toolContracts`, `toolCatalog`, `descriptions.ts`, `mutating-tools.ts`
- Both use `writeAnnotations` (local-write effect)
- Add to `instructions.ts`

---

## Step 5: GitHub PR Tools + Issue Read (5 tools)

**COMMIT POINT: commit after completing all steps 1-5.**

### 5a. Expand Contracts (`src/contracts/github.contract.ts`)

New schemas:

- **GitHubIssueReadInputSchema** — `repo_id`, `issue_number`
- **GitHubIssueReadResultSchema** — full issue details (number, title, state, body, labels, assignees, milestone, url, comments_count)
- **GitHubPrListInputSchema** — `repo_id`, `state`, `max_results`
- **GitHubPrListResultSchema** — `prs[]`, `count`, `warnings`
- **GitHubPrReadInputSchema** — `repo_id`, `pr_number`
- **GitHubPrReadResultSchema** — full PR details
- **GitHubPrCreateInputSchema** — `repo_id`, `title`, `body?`, `head`, `base`, `draft?`, `labels?`, `assignees?`, `reviewers?`, `dry_run?`
- **GitHubPrCreateResultSchema** — `repository`, `pr_number?`, `url?`, `status: "previewed" | "created" | "failed"`, `dry_run`, `warnings`
- **GitHubPrChecksInputSchema** — `repo_id`, `pr_number`
- **GitHubPrChecksResultSchema** — `checks[]`, `overall_status`, `warnings`

### 5b. Refactor + Expand Service (`src/services/github-issues-service.ts`)

**Refactor existing methods to throw `RepoReaderError` on gh failures** instead of returning warnings. This aligns with the plan's rule: "A failed gh command must never be summarized as a successful create or comment operation."

New methods:
- `readIssue(number)` — `gh issue view <number> --repo <repo> --json ...`
- `listPullRequests(options)` — `gh pr list --repo <repo> --json ...`
- `readPullRequest(number)` — `gh pr view <number> --repo <repo> --json ...`
- `createPullRequest(options)` — `gh pr create --repo <repo> ...` (throws on failure)
- `prChecks(number)` — `gh pr checks <number> --repo <repo> --json ...`

### 5c. Error Codes

Add to `RepoReaderErrorCode`:
- `GH_PR_CREATE_FAILED`
- `GH_ISSUE_READ_FAILED`
- `GH_PR_LIST_FAILED`
- `GH_PR_READ_FAILED`
- `GH_PR_CHECKS_FAILED`

### 5d. Handlers + Catalog + Descriptions

- Add 5 tool names to `ToolName`, `toolContracts`, `toolCatalog`, `descriptions.ts`
- Annotations:
  - `repo_github_issue_read` → `externalReadOnlyAnnotations`
  - `repo_github_pr_list` → `externalReadOnlyAnnotations`
  - `repo_github_pr_read` → `externalReadOnlyAnnotations`
  - `repo_github_pr_create` → `externalWriteAnnotations` (add to `MUTATING_TOOL_NAMES`)
  - `repo_github_pr_checks` → `externalReadOnlyAnnotations`
- Add to `instructions.ts`

---

## Step 6: Test Snapshot Updates

**Modified file:** `tests/tool-contracts.test.ts`

Three changes needed:

1. **Tool name list (lines 50-83):** Add all tools from dirty state (symbol_outline, dependency_map, validation_plan, agent_context, github_issues, github_issue_create, github_issue_comment, github_pr_comment) plus all 14 new tools

2. **Mutating tools list (lines 100-115):** Add `repo_action_run`, `repo_action_cancel`, `repo_create_files`, `repo_apply_patch`, `repo_github_pr_create`

3. **Inline snapshot (lines 718-1613):** Update to include all tools with their correct annotations, inputKeys, and outputKeys

---

## Step 7: Documentation Updates

### `src/instructions.ts`

Add guidance for:
- Action tools (list, run, status, logs, cancel)
- File creation (repo_create_files for create-only scaffolding)
- Patch application (repo_apply_patch for focused edits)
- PR workflow (issue_read -> pr_list -> pr_create -> pr_checks)

### `docs/TOOL_SURFACE.md`

Add all 14 new tools with input/output docs and usage examples.

### `docs/ARCHITECTURE.md`

Add descriptions for:
- ActionService (configured command execution)
- FileCreateService (create-only atomic multi-file creation)
- PatchService (unified diff application)
- Expanded GitHub service surface

### `docs/SECURITY.md`

Add:
- Action execution security model (fixed arg arrays, no shell strings, timeout enforcement)
- File creation security (create-only, path validation, secret scanning)
- Patch application security (stdin-based, affected path validation)

---

## Step 8: Validate

```bash
npm run typecheck
npm run lint
npm run check:public
npm run build
git diff --check
npm test  # regression signal
```

---

## Complete Tool List After Implementation

53 total tools (39 current + 14 new):

### Read-only (33)

| Tool | Effect | Domain |
|------|--------|--------|
| repo_list_roots | local-read | core |
| repo_policy_explain | local-read | core |
| repo_last_write | local-read | core |
| repo_tree | local-read | core |
| repo_search | local-read | core |
| repo_fetch_file | local-read | core |
| repo_read_many | local-read | core |
| repo_symbol_outline | local-read | intelligence |
| repo_dependency_map | local-read | intelligence |
| repo_validation_plan | local-read | intelligence |
| repo_agent_context | local-read | intelligence |
| repo_github_issues | external-read | github |
| repo_git_status | local-read | git |
| repo_git_diff | local-read | git |
| repo_git_review | local-read | git |
| repo_project_brief | local-read | planning |
| repo_task_inventory | local-read | planning |
| repo_decision_memory | local-read | planning |
| repo_change_plan | local-read | planning |
| repo_next_action | local-read | planning |
| repo_plan_review | local-read | planning |
| repo_prepare_codex_task | local-read | codex |
| repo_codex_review | local-read | codex |
| **repo_action_list** | local-read | actions |
| **repo_action_describe** | local-read | actions |
| **repo_action_status** | local-read | actions |
| **repo_action_logs** | local-read | actions |
| **repo_action_recent** | local-read | actions |
| **repo_github_issue_read** | external-read | github |
| **repo_github_pr_list** | external-read | github |
| **repo_github_pr_read** | external-read | github |
| **repo_github_pr_checks** | external-read | github |

### Mutating (20)

| Tool | Effect | Domain |
|------|--------|--------|
| repo_github_issue_create | external-write | github |
| repo_github_issue_comment | external-write | github |
| repo_github_pr_comment | external-write | github |
| repo_git_stage | local-write | git |
| repo_git_unstage | local-write | git |
| repo_git_restore_paths | local-write | git |
| repo_git_commit | local-write | git |
| repo_write_stage | local-write | git |
| repo_write_unstage | local-write | git |
| repo_write_commit | local-write | git |
| repo_write_stage_commit | local-write | git |
| repo_write_recover | local-write | git |
| repo_cleanup_paths | local-write | git |
| repo_write_file | local-write | write |
| repo_write_changes | local-write | write |
| repo_write_handoff | local-write | write |
| repo_write_codex_task | local-write | codex |
| **repo_action_run** | local-write | actions |
| **repo_action_cancel** | local-write | actions |
| **repo_create_files** | local-write | file-ops |
| **repo_apply_patch** | local-write | file-ops |
| **repo_github_pr_create** | external-write | github |

---

## Key Architectural Constraints

1. **Contract-first:** Every tool needs Zod input/output schemas before catalog wiring
2. **Fixed argument arrays:** `execFile(command, argv, options)` — never shell strings
3. **No arbitrary shell:** `repo_action_run` takes a configured action name, not a model-provided command
4. **Bounded outputs:** All process output truncated with explicit `truncated` flag
5. **Structured errors:** `{ code, message, retryable, diagnostics }` — never raw exceptions
6. **Audit metadata:** Every handler writes via `audit()`
7. **GitHub mutations throw on failure:** Never return failed gh commands as successful operations
8. **No test creation:** Existing tests may be updated for snapshots but no new test files
