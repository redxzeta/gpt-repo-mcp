import type { ToolName } from "./contracts.js";

const CORE_TOOLS: ReadonlySet<ToolName> = new Set([
  "repo_list_roots",
  "repo_policy_explain",
  "repo_last_write",
  "repo_tree",
  "repo_search",
  "repo_fetch_file",
  "repo_read_many",
  "repo_write_file",
  "repo_write_changes",
  "repo_write_handoff",
  "repo_handoff_list",
  "repo_git_status",
  "repo_git_diff",
  "repo_git_review",
  "repo_git_stage",
  "repo_git_unstage",
  "repo_git_commit",
  "repo_git_log",
  "repo_git_show",
  "repo_git_branches",
  "repo_action_list",
  "repo_action_run",
  "repo_action_status",
  "repo_action_logs",
  "repo_action_cancel",
  "repo_action_recent",
  "repo_project_brief",
  "repo_next_action",
  "repo_validation_plan",
  "repo_symbol_outline",
  "repo_dependency_map"
]);

export function isCoreTool(name: ToolName): boolean {
  return CORE_TOOLS.has(name);
}

export function filterToolsByProfile<T extends { name: ToolName }>(tools: T[], profile: "core" | "full"): T[] {
  if (profile === "full") {
    return tools;
  }
  return tools.filter((tool) => CORE_TOOLS.has(tool.name));
}
