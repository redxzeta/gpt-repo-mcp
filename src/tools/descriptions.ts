export const descriptions = {
  repo_list_roots:
    "Use this when the user asks which approved repositories are available.",
  repo_policy_explain:
    "Use this when a read, write, or cleanup policy question is blocked or the user asks what can be accessed in a repo.",
  repo_last_write:
    "Use this when the user asks what the last write operation changed or how to resume after a previous write.",
  repo_tree:
    "Use this when the user asks to inspect repository structure or locate files by directory.",
  repo_search:
    "Use this when the user asks to find code, inspect usages, or locate relevant files by text content.",
  repo_fetch_file:
    "Use this when the user names a specific file to read. Supports line ranges.",
  repo_read_many:
    "Use this when the user asks to read a bounded set of explicit files or glob-matched files.",
  repo_symbol_outline:
    "Use this when the user wants to understand a codebase through imports, exports, classes, types, and functions.",
  repo_dependency_map:
    "Use this when the user asks what imports what, what depends on a file, or how modules are connected.",
  repo_validation_plan:
    "Use this when the user asks what checks to run or how to validate a change. Returns advisory commands only.",
  repo_agent_context:
    "Use this when the user asks how to work in a repo or what project-specific rules apply.",
  repo_github_issues:
    "Use this when the user asks to view GitHub issues for an approved repo.",
  repo_github_issue_create:
    "Use this when the user asks to create a GitHub issue in an approved repo.",
  repo_github_issue_comment:
    "Use this when the user asks to comment on a GitHub issue in an approved repo.",
  repo_github_issue_edit:
    "Use this when the user asks to edit, close, reopen, add/remove labels, or change assignees on a GitHub issue.",
  repo_github_issue_delete:
    "Use this when the user asks to close or delete a GitHub issue.",
  repo_github_label_list:
    "Use this when the user asks to list available labels for a repository.",
  repo_github_label_create:
    "Use this when the user asks to create a new label in a repository.",
  repo_github_pr_comment:
    "Use this when the user asks to comment on a GitHub pull request in an approved repo.",
  repo_github_issue_read:
    "Use this when the user asks to read full details of a specific GitHub issue.",
  repo_github_pr_list:
    "Use this when the user asks to view pull requests for an approved repo.",
  repo_github_pr_read:
    "Use this when the user asks to read full details of a specific GitHub pull request.",
  repo_github_pr_create:
    "Use this when the user asks to create a GitHub pull request in an approved repo.",
  repo_github_pr_checks:
    "Use this when the user asks to check CI status or test results for a pull request.",
  repo_github_project_list:
    "Use this when the user asks to view GitHub projects for the repository owner.",
  repo_github_project_read:
    "Use this when the user asks to read full details of a specific GitHub project.",
  repo_github_project_create:
    "Use this when the user asks to create a GitHub project for the repository owner.",
  repo_github_project_item_list:
    "Use this when the user asks to view items in a GitHub project.",
  repo_github_project_item_add:
    "Use this when the user asks to add an issue or pull request to a GitHub project.",
  repo_github_milestone_list:
    "Use this when the user asks to view GitHub milestones for an approved repo.",
  repo_github_milestone_read:
    "Use this when the user asks to read full details of a specific GitHub milestone.",
  repo_github_milestone_create:
    "Use this when the user asks to create a GitHub milestone in an approved repo.",
  repo_git_status:
    "Use this when the user asks for git status, branch, dirty files, or changed file counts.",
  repo_git_diff:
    "Use this when the user asks to review changes or inspect a git diff.",
  repo_git_log:
    "Use this when the user asks for commit history, git log, or recent changes.",
  repo_git_show:
    "Use this when the user asks to see a specific commit's details or content.",
  repo_git_blame:
    "Use this when the user asks who changed a line, git blame, or line-level history.",
  repo_git_branches:
    "Use this when the user asks about branches, which branch is current, or branch listing.",
  repo_git_review:
    "Use this when the user wants to review current git changes and get ready-to-run payloads for commit or recovery.",
  repo_git_stage:
    "Use this when compatibility with the git-prefixed staging alias is needed.",
  repo_git_unstage:
    "Use this when compatibility with the git-prefixed unstaging alias is needed.",
  repo_git_restore_paths:
    "Use this when the user asks to recover unstaged worktree changes for specific paths.",
  repo_git_commit:
    "Use this when compatibility with the git-prefixed commit alias is needed.",
  repo_write_stage:
    "Use this when the user asks to stage reviewed repo-relative paths.",
  repo_write_unstage:
    "Use this when the user asks to unstage reviewed repo-relative paths.",
  repo_write_commit:
    "Use this when the user asks to create a local-only commit from staged paths.",
  repo_write_stage_commit:
    "Use this when the user approves staging and committing exact paths after reviewing git changes.",
  repo_write_recover:
    "Use this when the user approves recovering exact paths after reviewing git changes.",
  repo_cleanup_paths:
    "Use this when the user asks to delete generated artifacts or local ChatGPT artifacts.",
  repo_project_brief:
    "Use this when the user asks to understand, onboard, or plan work for a repository.",
  repo_task_inventory:
    "Use this when the user asks to find TODOs, FIXMEs, roadmap items, or backlog candidates.",
  repo_decision_memory:
    "Use this when the user asks about architecture decisions, conventions, or project rationale.",
  repo_change_plan:
    "Use this when the user asks how to implement, refactor, or fix something without writing files.",
  repo_next_action:
    "Use this when the user asks what to do next, what to prioritize, or whether work is ready to ship.",
  repo_plan_review:
    "Use this when the user asks for broad or ambiguous repository review.",
  repo_prepare_codex_task:
    "Use this when the user explicitly wants chat-copy mode: a Codex prompt returned in chat for review/copying. Does not write files or implement the change. Do not use when Codex will be told to implement .chatgpt/codex-runs/<run_id>/PROMPT.md; use repo_write_codex_task instead.",
  repo_write_codex_task:
    "Use this when the user explicitly asks to create, write, start, resume, or hand off a repo-local Codex prompt/task/run that Codex will execute from the repo. Prefer this by default for repo-local Codex delegation. Writes only .chatgpt/codex-runs/<run_id>/PROMPT.md and run.json through repo write policy; does not implement, stage, commit, push, or run Codex.",
  repo_codex_review:
    "Use this when the user asks to review a repo-local Codex run result.",
  repo_write_file:
    "Use this when the user asks to write or edit one allowed repository file.",
  repo_write_changes:
    "Use this when the user asks to apply a multi-file edit pack to allowed repository files.",
  repo_write_handoff:
    "Use this when the user asks to create a local-only ChatGPT handoff for session resume.",
  repo_handoff_list:
    "Use this when the user asks to see previous handoffs or list session resume notes.",
  repo_action_list:
    "Use this when the user asks what actions are available or what commands can be run.",
  repo_action_describe:
    "Use this when the user asks for details about a specific configured action.",
  repo_action_run:
    "Use this when the user explicitly asks to run a configured action.",
  repo_action_status:
    "Use this when the user asks about the status of a previous action run.",
  repo_action_logs:
    "Use this when the user asks to see stdout/stderr from a previous action run.",
  repo_action_cancel:
    "Use this when the user asks to cancel a running or queued action.",
  repo_action_recent:
    "Use this when the user asks to see recent action runs or execution history.",
  repo_create_files:
    "Use this when the user asks to create new files without overwriting existing ones.",
  repo_apply_patch:
    "Use this when the user asks to apply a unified diff patch to the repository.",
  repo_manifest:
    "Use this when the user asks what tools are available, current tool profile, or active policies.",
  repo_release_notes:
    "Use this when the user asks for release notes, a changelog, or what changed between versions or tags."
} as const;
