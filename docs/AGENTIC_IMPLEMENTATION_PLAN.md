# GPT Repo MCP — Agentic Implementation Plan

**Project:** `gpt-repo-mcp`  
**Primary user:** One trusted developer using ChatGPT to work directly on approved repositories  
**Primary interface:** MCP tools invoked by ChatGPT  
**Implementation style:** Contract-first TypeScript, bounded structured outputs, explicit repository IDs, fixed argument arrays, reviewable mutations  
**Testing constraint:** Do not create or modify test files as part of this plan. Existing tests may be run as a regression signal, but test authoring is outside scope.

---

## 1. Product objective

Evolve GPT Repo MCP into a **personal repository workspace for ChatGPT**.

The target workflow is:

1. Read a GitHub issue or understand a user request.
2. Build a focused repository context pack.
3. Inspect symbols, dependencies, history, and affected files.
4. Create an isolated worktree when useful.
5. Create, edit, move, or delete files through explicit repository tools.
6. Run configured validation actions such as typecheck, lint, build, format, and repository-specific checks.
7. Review the actual Git diff and detect omissions or contract drift.
8. Stage and create a local commit after explicit approval.
9. Create or update a GitHub pull request.
10. Inspect GitHub checks and review feedback.
11. Resume interrupted work from repository state without depending on chat memory.

The project should remain repository-focused. It should not become a homelab controller, team collaboration platform, unrestricted shell server, or general-purpose agent journal.

---

## 2. Current baseline

At the time this plan was created, the repository is on `main` at:

```text
a092af005f3d91db1a15c63590d59fc57d1458b6
```

The worktree already contains an uncommitted GitHub and repository-intelligence change set. Before implementing this roadmap, review and isolate that work in a local commit, checkpoint, branch, or dedicated worktree.

Do not mix every phase below into the existing dirty change set.

---

## 3. Scope

### In scope

- Repository reads and code intelligence
- Create-only and edit file operations
- Patch application, file moves, and explicit deletion
- Configured command execution
- Long-running repository jobs
- Git history and ref comparison
- Git worktree management
- GitHub issues, pull requests, checks, and review threads
- Configurable coding CLI runners
- Composite context, impact, review, and resume tools
- Read-only cross-repository search and status
- Local operation receipts and resumable run metadata

### Out of scope

- RunTrail integration
- Agent journals or agent-to-agent messaging
- Team task queues
- Multi-user tenancy and role-based access control
- Generic SSH or arbitrary shell execution
- Proxmox, Docker host, or systemd administration
- GitHub repository administration
- GitHub secrets and environment management
- Force pushes
- Automatic destructive branch operations
- Automatic pull-request merging in the initial implementation
- Creating or modifying test files

---

## 4. Architectural rules

Preserve the existing flow:

```text
contracts
  -> toolContracts
  -> catalog
  -> define-tool
  -> handlers
  -> services
  -> policy/runtime helpers
```

### Contracts

Every tool must have:

- One central Zod input schema
- One central Zod output schema
- Descriptions for public fields
- Bounded arrays and strings
- Explicit status rather than warning-only failure semantics

### Catalog

The catalog owns:

- Tool name
- Tool title
- Tool description
- Input and output contracts
- Effect classification
- Handler reference

Do not put service logic or inline schemas in the catalog.

### Handlers

Handlers should:

1. Resolve the approved repository.
2. Construct policy and service dependencies.
3. Call one service.
4. Write safe audit metadata.
5. Return a structured result or error.

### Services

Services own:

- Filesystem access
- Git and `gh` argument construction
- Process execution
- Output parsing
- Policy checks
- Limits and truncation
- Local run metadata

### No arbitrary shell

Use fixed argument arrays:

```ts
execFile(command, argv, options)
```

Never expose unrestricted shell text through MCP input.

### Tool effects

Replace binary read/write assumptions with explicit effects:

```ts
type ToolEffect =
  | "local-read"
  | "external-read"
  | "local-write"
  | "external-write"
  | "process-read"
  | "process-write";
```

Derive annotations and mutation classification from the effect.

---

# Phase 0 — Stabilize the current tool model

## Goal

Make the current GitHub and repository-intelligence changes coherent before adding more tools.

## Deliverables

1. Add explicit effect metadata to every tool.
2. Derive annotations from the effect.
3. Correct GitHub mutation result semantics.
4. Remove repository-specific heuristics from generic intelligence services.
5. Align instructions and documentation with the actual tool surface.

GitHub mutation results should expose states such as:

```ts
status: "previewed" | "created" | "posted" | "updated" | "failed";
```

A failed `gh` command must never be summarized as a successful create or comment operation.

## Acceptance criteria

- Every registered tool has exactly one effect.
- Generic intelligence code contains no Ice Council, Robinhood, or OpenClaw-specific paths or scripts.
- GitHub failures are represented as failures.
- Typecheck, lint, public check, build, and `git diff --check` pass.

---

# Phase 1 — Configured repository actions

## Goal

Allow ChatGPT to execute approved repository commands and consume structured results.

## New tools

- `repo_action_list`
- `repo_action_describe`
- `repo_action_run`
- `repo_action_status`
- `repo_action_logs`
- `repo_action_cancel`
- `repo_action_recent`

## Configuration

```json
{
  "actions": {
    "enabled": true,
    "max_concurrent": 2,
    "definitions": {
      "typecheck": {
        "command": "npm",
        "args": ["run", "typecheck"],
        "timeout_ms": 120000,
        "mutates_files": false
      },
      "lint": {
        "command": "npm",
        "args": ["run", "lint"],
        "timeout_ms": 120000,
        "mutates_files": false
      },
      "build": {
        "command": "npm",
        "args": ["run", "build"],
        "timeout_ms": 180000,
        "mutates_files": true
      }
    }
  }
}
```

`repo_action_run` accepts a configured action name, not a model-provided executable or arbitrary argument list.

## Run metadata

```text
.chatgpt/actions/<run-id>/
  run.json
  stdout.log
  stderr.log
  result.json
```

Use atomic JSON writes and bounded logs.

## Result contract

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

## Acceptance criteria

- ChatGPT can list and run configured actions without supplying shell text.
- Long actions can run in the background and be polled.
- Timeouts and cancellation work.
- Logs remain bounded.
- File-mutating actions report changed paths.

---

# Phase 2 — Complete file mutation primitives

## Goal

Support safe file creation, token-efficient code editing, and normal refactors without requiring full-file rewrites.

## New tools

- `repo_create_files`
- `repo_apply_patch`
- `repo_move_paths`
- `repo_delete_paths`
- `repo_create_directories`
- `repo_format_paths`

## 2.1 `repo_create_files`

This is a dedicated **create-only** tool. Although `repo_write_file` can create a missing file, a separate tool gives ChatGPT an unambiguous scaffolding operation and prevents accidental overwrites.

### Intended uses

- Create a new source module
- Create several related files in one atomic request
- Scaffold contracts, services, and documentation
- Create empty placeholder files when explicitly requested
- Create parent directories when allowed

### Input

```ts
{
  repo_id: string;
  files: Array<{
    path: string;
    content?: string;
    create_parent_directories?: boolean;
  }>;
  expected_head_sha?: string;
  dry_run?: boolean;
  reason?: string;
}
```

### Output

```ts
{
  status: "previewed" | "created";
  head_sha: string;
  created_files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
  created_directories: string[];
  skipped: Array<{
    path: string;
    reason: string;
  }>;
}
```

### Rules

- Create only; never overwrite or append to an existing path.
- Fail the entire operation before writing if any target already exists, unless an explicit future partial mode is introduced.
- Validate all paths before creating anything.
- Respect write policy, secret-path rules, symlink boundaries, and per-write size limits.
- Cap files per request, for example 25.
- Support UTF-8 text files only in the initial version.
- Empty content is allowed only when explicitly represented as `content: ""`.
- Create parent directories only within the approved repository root.
- Use atomic temporary-file rename for each file.
- Record hashes and a local write receipt.
- Do not stage or commit.

### Relationship to existing tools

- Use `repo_create_files` when all targets must be new.
- Use `repo_write_file` for one file that may be created or overwritten.
- Use `repo_write_changes` for mixed writes and exact edits.
- Use `repo_apply_patch` for focused modifications expressed as a unified diff.

## 2.2 `repo_apply_patch`

Input:

```ts
{
  repo_id: string;
  patch: string;
  expected_head_sha: string;
  expected_files?: Array<{
    path: string;
    sha256: string;
  }>;
  dry_run?: boolean;
  reason?: string;
}
```

Use fixed `git apply --check` and `git apply` argument arrays with patch data through stdin. Validate every affected path before applying.

Return applied files, rejected hunks, hashes, and a diff summary.

## 2.3 `repo_move_paths`

Support explicit source-to-destination moves.

Rules:

- Reject destination collisions.
- Validate source and destination paths.
- Do not cross repository boundaries.
- Return likely imports that require follow-up changes.
- Do not automatically rewrite imports in the first version.

## 2.4 `repo_delete_paths`

Support explicit deletion of tracked or untracked files.

Rules:

- Require explicit paths.
- Require expected HEAD.
- Optionally require expected file hashes.
- Do not recursively delete non-empty directories in the initial version.
- Return previous hashes and deleted paths.

## 2.5 `repo_create_directories`

Create explicit repository-relative directories only. This is a small convenience tool for scaffolding directory structure without files.

## 2.6 `repo_format_paths`

Dispatch explicit paths to a trusted configured formatter action. Do not accept arbitrary formatter commands.

## Acceptance criteria

- ChatGPT can atomically create multiple new files without overwrite risk.
- ChatGPT can apply a focused patch without rewriting complete files.
- Files can be moved or deleted through explicit reviewed operations.
- Every mutation returns affected paths and hashes.
- All tools support dry run where meaningful.

---

# Phase 3 — Git history and ref comparison

## Goal

Give ChatGPT historical context and branch-level review without changing the checkout.

## New tools

- `repo_git_log`
- `repo_git_show`
- `repo_git_file_history`
- `repo_git_blame`
- `repo_git_branches`
- `repo_git_tags`
- `repo_git_compare_refs`
- `repo_git_changed_since`
- `repo_branch_sync_status`

## Core requirements

- Structured, bounded commit results
- Optional path and date filters
- `git log --follow` for file history
- Merge-base and ahead/behind analysis
- No checkout or branch mutation

## Acceptance criteria

- ChatGPT can determine why a file changed.
- ChatGPT can compare a feature branch with `main`.
- History output is structured and bounded.

---

# Phase 4 — Git worktree management

## Goal

Provide isolated workspaces for ChatGPT and coding runners.

## New tools

- `repo_worktree_list`
- `repo_worktree_create`
- `repo_worktree_register`
- `repo_worktree_status`
- `repo_worktree_remove`
- `repo_worktree_prune_preview`

## Configuration

```json
{
  "worktrees": {
    "enabled": true,
    "root": "/home/agent/worktrees",
    "max_active": 8,
    "allow_branch_create": true,
    "allow_remove": true
  }
}
```

Created worktrees should receive stable temporary repository IDs such as:

```text
gpt-repo-mcp@github-pr-tools
```

Dirty worktrees must not be removed in the initial version.

## Acceptance criteria

- A feature worktree can be created and addressed through existing repository tools.
- The primary checkout remains unchanged.
- Worktree count and root boundaries are enforced.

---

# Phase 5 — Complete the GitHub development workflow

## Goal

Support issue-driven and pull-request-driven development through the approved repository origin.

## New issue tools

- `repo_github_issue_read`
- `repo_github_issue_update`
- `repo_github_issue_close`
- `repo_github_issue_reopen`
- `repo_github_issue_labels`

## New pull-request tools

- `repo_github_pr_list`
- `repo_github_pr_read`
- `repo_github_pr_diff`
- `repo_github_pr_create`
- `repo_github_pr_update`
- `repo_github_pr_checks`
- `repo_github_pr_review_threads`
- `repo_github_pr_review_reply`
- `repo_github_pr_review_resolve`
- `repo_github_pr_mark_ready`

## Workflow-run tools

- `repo_github_run_read`
- `repo_github_run_logs`
- `repo_github_run_rerun`

## Service structure

```text
src/services/github/
  github-origin-service.ts
  github-command-service.ts
  github-issues-service.ts
  github-pr-service.ts
  github-checks-service.ts
  github-review-service.ts
```

Centralize `gh` availability, authentication diagnostics, timeouts, bounded output, sanitized errors, and JSON parsing.

GitHub writes must remain scoped to the approved repository origin. Never accept an arbitrary owner/repository string from tool input.

## Acceptance criteria

- ChatGPT can read an issue, create a PR, inspect checks, read review threads, reply, and resolve an explicit thread.
- Duplicate creation is prevented through operation IDs or receipts.
- Failed GitHub writes are never presented as successful.

---

# Phase 6 — Advanced code intelligence

## Goal

Move beyond text search and basic static imports into targeted repository understanding.

## New tools

- `repo_find_definition`
- `repo_find_references`
- `repo_module_summary`
- `repo_change_impact`
- `repo_data_flow`
- `repo_api_surface`
- `repo_api_surface_diff`
- `repo_env_inventory`
- `repo_config_inventory`
- `repo_route_inventory`
- `repo_external_integrations`
- `repo_dead_code_candidates`
- `repo_complexity_hotspots`

Implement TypeScript and JavaScript first. Unsupported languages should return explicit limitations.

## Shared source index

Create bounded indexing services for source paths, imports, exports, symbols, environment variable names, routes, configuration references, and external packages.

Cache by repository ID, HEAD SHA, dirty-file mtimes or hashes, and index version.

Do not cache secrets or complete file contents.

## Acceptance criteria

- Definition and reference tools are more precise than literal search.
- Impact results expose coverage and truncation.
- No secret values are emitted.

---

# Phase 7 — Coding CLI runners

## Goal

Allow ChatGPT to delegate bounded work to Codex, OpenCode, or another configured coding CLI while treating Git state as authoritative.

## New tools

- `repo_coding_runner_list`
- `repo_coding_task_prepare`
- `repo_coding_run_start`
- `repo_coding_run_status`
- `repo_coding_run_logs`
- `repo_coding_run_cancel`
- `repo_coding_result_read`
- `repo_coding_result_review`
- `repo_coding_result_compare`

Retain current Codex tool names as compatibility aliases during migration.

## Configuration

```json
{
  "coding_runners": {
    "enabled": true,
    "definitions": {
      "codex": {
        "command": "codex",
        "args": ["exec", "--full-auto"],
        "timeout_ms": 1800000,
        "requires_worktree": true
      },
      "opencode-local": {
        "command": "opencode",
        "args": ["run"],
        "timeout_ms": 1800000,
        "requires_worktree": true,
        "environment": {
          "MODEL": "ollama/qwen2.5-coder:latest"
        }
      }
    }
  }
}
```

Environment values come from trusted local configuration, not MCP input.

## Run layout

```text
.chatgpt/coding-runs/<run-id>/
  TASK.md
  run.json
  stdout.log
  stderr.log
  RESULT.md
  review.json
```

`repo_coding_result_review` must compare the runner’s claims against actual Git status, diff, scope, and action results.

## Acceptance criteria

- A configured coding runner can launch in an isolated worktree.
- Logs are bounded and cancellable.
- The result review uses actual Git state.
- Two attempts can be compared without merging either attempt.

---

# Phase 8 — Composite agentic workflow tools

## Goal

Reduce repetitive orchestration by composing existing factual services.

## New tools

- `repo_context_pack`
- `repo_bug_hunt`
- `repo_regression_trace`
- `repo_implementation_review`
- `repo_contract_consistency`
- `repo_doc_drift`
- `repo_commit_split_plan`
- `repo_merge_conflict_preview`
- `repo_resume_work`
- `repo_finish_work`
- `repo_workspace_health`

Composite tools must not bypass lower-level policy or invent facts.

### `repo_context_pack`

Build the smallest useful context for a goal from project guidance, search, symbols, dependencies, history, Git state, and bounded file excerpts.

### `repo_implementation_review`

Combine Git diff, changed symbols, dependency impact, API surface changes, documentation drift, and action results.

### `repo_resume_work`

Reconstruct current work from branch state, dirty diff, local handoff, last write receipt, active actions, coding runs, and related GitHub state.

## Acceptance criteria

- Composite results identify their evidence.
- Confidence and truncation are explicit.
- Next-tool payloads remain reviewable.
- Composite tools do not directly perform hidden mutations.

---

# Phase 9 — Read-only cross-repository tools

## Goal

Support related approved repositories without introducing cross-repository mutation.

## New tools

- `repos_status`
- `repos_search`
- `repos_symbol_search`
- `repos_dependency_usage`
- `repos_workspace_health`

All output must be labeled by repository ID and bounded per repository.

No cross-repository write tool should be added.

---

## 5. Standard output conventions

Long-running and mutating tools should use explicit states:

```ts
status:
  | "queued"
  | "running"
  | "previewed"
  | "created"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";
```

Common fields:

```ts
{
  status: string;
  operation_id?: string;
  run_id?: string;
  repo_id: string;
  head_sha?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  warnings: string[];
  truncated?: boolean;
}
```

Warnings must not be the only indication of failure.

Every bounded collection should report returned count, discovered or matched count where known, and truncation state.

---

## 6. Error handling

Use stable errors:

```ts
{
  code: string;
  message: string;
  retryable: boolean;
  diagnostics: string[];
}
```

Never return raw command exceptions, environment values, tokens, absolute private paths, or complete unbounded logs.

Example file-creation errors:

- `CREATE_PATH_EXISTS`
- `CREATE_PATH_DENIED`
- `CREATE_PARENT_DENIED`
- `CREATE_BATCH_TOO_LARGE`
- `CREATE_CONTENT_TOO_LARGE`
- `CREATE_ATOMIC_WRITE_FAILED`

---

## 7. Documentation expectations

Update only documentation relevant to implemented behavior:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/TOOL_SURFACE.md`
- `docs/WRITE_WORKFLOWS.md`
- `docs/ERRORS.md`
- `docs/SETUP.md`

Potential dedicated guides:

```text
docs/ACTIONS.md
docs/FILE_OPERATIONS.md
docs/WORKTREES.md
docs/GITHUB_WORKFLOW.md
docs/CODING_RUNNERS.md
docs/COMPOSITE_WORKFLOWS.md
```

Documentation examples must match actual contracts.

---

## 8. Suggested GitHub issue breakdown

### Milestone 1 — Close the coding loop

1. Normalize tool effects and external-write semantics.
2. Add repository action configuration.
3. Implement action list and description tools.
4. Implement synchronous action execution.
5. Add background action status, logs, and cancellation.
6. Implement create-only multi-file scaffolding with `repo_create_files`.
7. Implement unified patch application.
8. Implement explicit move and delete operations.

### Milestone 2 — History and isolation

9. Add structured Git log and commit reading.
10. Add file history and blame.
11. Add ref comparison and branch sync status.
12. Add worktree list and status.
13. Add safe worktree creation.
14. Add safe worktree removal and registry lifecycle.

### Milestone 3 — GitHub workflow

15. Refactor GitHub command execution and diagnostics.
16. Add full GitHub issue reading.
17. Add GitHub issue updates and state changes.
18. Add pull-request list and reading.
19. Add bounded pull-request diff.
20. Add pull-request creation and update.
21. Add pull-request checks and workflow logs.
22. Add review-thread read, reply, and resolve tools.

### Milestone 4 — Code intelligence

23. Build a bounded TypeScript repository source index.
24. Add definition and reference tools.
25. Add module summaries.
26. Add change-impact analysis.
27. Add API-surface inventory and diff.
28. Add environment, route, and integration inventories.
29. Add complexity and dead-code candidate reports.

### Milestone 5 — Coding runners

30. Generalize Codex task format into coding tasks.
31. Add configured coding-runner registry.
32. Add coding-run execution, status, logs, and cancellation.
33. Add fact-based coding result review.
34. Add comparison of two coding attempts.
35. Preserve Codex compatibility aliases.

### Milestone 6 — Composite workflows

36. Add focused repository context packs.
37. Add bug-hunt and regression-trace tools.
38. Add implementation review.
39. Add contract consistency and documentation drift.
40. Add commit split and merge-conflict planning.
41. Add resume-work and finish-work tools.
42. Add repository workspace health.
43. Add bounded cross-repository status and search.

---

## 9. Agent operating instructions

A coding agent implementing this plan must follow these rules.

### Before editing

1. Run repository status.
2. Read `CONTRIBUTING.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`, and `docs/SECURITY.md` when present.
3. Inspect the contracts, catalog, handler, and service pattern used by the closest existing tool.
4. Confirm the current branch or worktree is dedicated to one issue.
5. Do not overwrite unrelated dirty changes.

### During implementation

1. Implement one vertical slice at a time.
2. Add contracts before catalog wiring.
3. Keep handlers thin.
4. Put real logic in a service.
5. Use fixed argument arrays.
6. Bound every external or process output.
7. Return structured errors.
8. Add audit metadata without logging content or credentials.
9. Update relevant documentation.
10. Do not create or modify tests.

### Before finishing

Run:

```bash
npm run typecheck
npm run lint
npm run check:public
npm run build
git diff --check
```

Existing tests may be run as a regression signal, but do not modify them:

```bash
npm test
```

Then:

1. Review Git status and diff.
2. Confirm only expected files changed.
3. Confirm no secret values or local absolute paths were added.
4. Confirm documentation examples match schemas.
5. Write a concise result with what changed, files changed, validation run, limitations, and recommended next issue.
6. Do not push, merge, or delete a branch unless explicitly requested.

---

## 10. Definition of done

The roadmap is complete when ChatGPT can reliably perform:

```text
Read issue
  -> create focused context
  -> create worktree
  -> create or edit files
  -> inspect definitions, references, and history
  -> run configured actions
  -> review actual diff and impact
  -> obtain user approval
  -> stage and commit locally
  -> create GitHub PR
  -> inspect checks and logs
  -> address review threads
  -> finish or resume work from repository state
```

The system should require no unrestricted shell, no external journal, and no trust in coding-runner self-reports.

---

## 11. Recommended immediate release

Implement this first vertical release:

1. Stabilize current GitHub and intelligence work.
2. Add tool effect metadata.
3. Add `repo_action_list`.
4. Add `repo_action_run` with synchronous execution.
5. Add background action status, logs, and cancellation.
6. Add `repo_create_files` with create-only atomic semantics.
7. Add `repo_apply_patch`.
8. Add `repo_github_issue_read`.
9. Add `repo_github_pr_list`.
10. Add `repo_github_pr_read`.
11. Add `repo_github_pr_create`.
12. Add `repo_github_pr_checks`.

This provides the first complete practical loop:

```text
Understand request
  -> create or edit files
  -> validate
  -> review
  -> commit
  -> open PR
  -> inspect CI
```

Everything after this release should be driven by friction observed while using GPT Repo MCP with ChatGPT.