import { descriptions } from "./descriptions.js";
import { externalReadOnlyAnnotations, externalWriteAnnotations, readOnlyAnnotations, writeAnnotations, type ToolEffect } from "./annotations.js";
import { toolContracts, type ToolContract, type ToolName } from "./contracts.js";
import {
  actionCancelHandler,
  actionDescribeHandler,
  actionListHandler,
  actionLogsHandler,
  actionRecentHandler,
  actionRunHandler,
  actionStatusHandler,
  applyPatchHandler,
  changePlanHandler,
  cleanupPathsHandler,
  codexReviewHandler,
  createFilesHandler,
  decisionMemoryHandler,
  dependencyMapHandler,
  fetchFileHandler,
  agentContextHandler,
  githubIssuesHandler,
  githubIssueCreateHandler,
  githubIssueCommentHandler,
  githubIssueReadHandler,
  githubPrChecksHandler,
  githubPrCommentHandler,
  githubPrCreateHandler,
  githubPrListHandler,
  githubPrReadHandler,
  githubProjectListHandler,
  githubProjectReadHandler,
  githubProjectCreateHandler,
  githubProjectItemListHandler,
  githubProjectItemAddHandler,
  githubMilestoneListHandler,
  githubMilestoneReadHandler,
  githubMilestoneCreateHandler,
  gitCommitHandler,
  gitDiffHandler,
  gitLogHandler,
  gitShowHandler,
  gitBlameHandler,
  gitBranchesHandler,
  gitReviewHandler,
  gitRestorePathsHandler,
  gitStageHandler,
  gitStatusHandler,
  gitUnstageHandler,
  lastWriteHandler,
  listRootsHandler,
  nextActionHandler,
  planReviewHandler,
  prepareCodexTaskHandler,
  projectBriefHandler,
  readManyHandler,
  searchHandler,
  symbolOutlineHandler,
  taskInventoryHandler,
  treeHandler,
  validationPlanHandler,
  writeCommitHandler,
  writeRecoverHandler,
  writeStageCommitHandler,
  writeChangesHandler,
  writeCodexTaskHandler,
  writeFileHandler,
  writeHandoffHandler,
  listHandoffsHandler,
  manifestHandler,
  policyExplainHandler,
  writeStageHandler,
  writeUnstageHandler,
  type ToolHandler
} from "./handlers.js";

export type ToolDefinition = {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: ToolContract["input"];
  outputSchema: ToolContract["output"];
  effect: ToolEffect;
  annotations: typeof readOnlyAnnotations | typeof externalReadOnlyAnnotations | typeof externalWriteAnnotations | typeof writeAnnotations;
  handler: ToolHandler;
};

export const toolCatalog: ToolDefinition[] = [
  {
    name: "repo_list_roots",
    title: "List approved repositories",
    description: descriptions.repo_list_roots,
    inputSchema: toolContracts.repo_list_roots.input,
    outputSchema: toolContracts.repo_list_roots.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: listRootsHandler
  },
  {
    name: "repo_policy_explain",
    title: "Explain repository policy",
    description: descriptions.repo_policy_explain,
    inputSchema: toolContracts.repo_policy_explain.input,
    outputSchema: toolContracts.repo_policy_explain.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: policyExplainHandler
  },
  {
    name: "repo_last_write",
    title: "Read last write receipt",
    description: descriptions.repo_last_write,
    inputSchema: toolContracts.repo_last_write.input,
    outputSchema: toolContracts.repo_last_write.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: lastWriteHandler
  },
  {
    name: "repo_tree",
    title: "Inspect repository tree",
    description: descriptions.repo_tree,
    inputSchema: toolContracts.repo_tree.input,
    outputSchema: toolContracts.repo_tree.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: treeHandler
  },
  {
    name: "repo_search",
    title: "Search repository text",
    description: descriptions.repo_search,
    inputSchema: toolContracts.repo_search.input,
    outputSchema: toolContracts.repo_search.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: searchHandler
  },
  {
    name: "repo_fetch_file",
    title: "Fetch one file",
    description: descriptions.repo_fetch_file,
    inputSchema: toolContracts.repo_fetch_file.input,
    outputSchema: toolContracts.repo_fetch_file.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: fetchFileHandler
  },
  {
    name: "repo_read_many",
    title: "Read bounded files",
    description: descriptions.repo_read_many,
    inputSchema: toolContracts.repo_read_many.input,
    outputSchema: toolContracts.repo_read_many.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: readManyHandler
  },
  {
    name: "repo_symbol_outline",
    title: "Outline repository symbols",
    description: descriptions.repo_symbol_outline,
    inputSchema: toolContracts.repo_symbol_outline.input,
    outputSchema: toolContracts.repo_symbol_outline.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: symbolOutlineHandler
  },
  {
    name: "repo_dependency_map",
    title: "Map repository dependencies",
    description: descriptions.repo_dependency_map,
    inputSchema: toolContracts.repo_dependency_map.input,
    outputSchema: toolContracts.repo_dependency_map.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: dependencyMapHandler
  },
  {
    name: "repo_validation_plan",
    title: "Plan repository validation",
    description: descriptions.repo_validation_plan,
    inputSchema: toolContracts.repo_validation_plan.input,
    outputSchema: toolContracts.repo_validation_plan.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: validationPlanHandler
  },
  {
    name: "repo_agent_context",
    title: "Read repository agent context",
    description: descriptions.repo_agent_context,
    inputSchema: toolContracts.repo_agent_context.input,
    outputSchema: toolContracts.repo_agent_context.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: agentContextHandler
  },
  {
    name: "repo_github_issues",
    title: "View GitHub issues",
    description: descriptions.repo_github_issues,
    inputSchema: toolContracts.repo_github_issues.input,
    outputSchema: toolContracts.repo_github_issues.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubIssuesHandler
  },
  {
    name: "repo_github_issue_create",
    title: "Create GitHub issue",
    description: descriptions.repo_github_issue_create,
    inputSchema: toolContracts.repo_github_issue_create.input,
    outputSchema: toolContracts.repo_github_issue_create.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubIssueCreateHandler
  },
  {
    name: "repo_github_issue_comment",
    title: "Comment on GitHub issue",
    description: descriptions.repo_github_issue_comment,
    inputSchema: toolContracts.repo_github_issue_comment.input,
    outputSchema: toolContracts.repo_github_issue_comment.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubIssueCommentHandler
  },
  {
    name: "repo_github_pr_comment",
    title: "Comment on GitHub pull request",
    description: descriptions.repo_github_pr_comment,
    inputSchema: toolContracts.repo_github_pr_comment.input,
    outputSchema: toolContracts.repo_github_pr_comment.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubPrCommentHandler
  },
  {
    name: "repo_github_issue_read",
    title: "Read GitHub issue details",
    description: descriptions.repo_github_issue_read,
    inputSchema: toolContracts.repo_github_issue_read.input,
    outputSchema: toolContracts.repo_github_issue_read.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubIssueReadHandler
  },
  {
    name: "repo_github_pr_list",
    title: "List GitHub pull requests",
    description: descriptions.repo_github_pr_list,
    inputSchema: toolContracts.repo_github_pr_list.input,
    outputSchema: toolContracts.repo_github_pr_list.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubPrListHandler
  },
  {
    name: "repo_github_pr_read",
    title: "Read GitHub pull request details",
    description: descriptions.repo_github_pr_read,
    inputSchema: toolContracts.repo_github_pr_read.input,
    outputSchema: toolContracts.repo_github_pr_read.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubPrReadHandler
  },
  {
    name: "repo_github_pr_create",
    title: "Create GitHub pull request",
    description: descriptions.repo_github_pr_create,
    inputSchema: toolContracts.repo_github_pr_create.input,
    outputSchema: toolContracts.repo_github_pr_create.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubPrCreateHandler
  },
  {
    name: "repo_github_pr_checks",
    title: "Get GitHub PR check status",
    description: descriptions.repo_github_pr_checks,
    inputSchema: toolContracts.repo_github_pr_checks.input,
    outputSchema: toolContracts.repo_github_pr_checks.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubPrChecksHandler
  },
  {
    name: "repo_github_project_list",
    title: "List GitHub projects",
    description: descriptions.repo_github_project_list,
    inputSchema: toolContracts.repo_github_project_list.input,
    outputSchema: toolContracts.repo_github_project_list.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubProjectListHandler
  },
  {
    name: "repo_github_project_read",
    title: "Read GitHub project details",
    description: descriptions.repo_github_project_read,
    inputSchema: toolContracts.repo_github_project_read.input,
    outputSchema: toolContracts.repo_github_project_read.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubProjectReadHandler
  },
  {
    name: "repo_github_project_create",
    title: "Create GitHub project",
    description: descriptions.repo_github_project_create,
    inputSchema: toolContracts.repo_github_project_create.input,
    outputSchema: toolContracts.repo_github_project_create.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubProjectCreateHandler
  },
  {
    name: "repo_github_project_item_list",
    title: "List GitHub project items",
    description: descriptions.repo_github_project_item_list,
    inputSchema: toolContracts.repo_github_project_item_list.input,
    outputSchema: toolContracts.repo_github_project_item_list.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubProjectItemListHandler
  },
  {
    name: "repo_github_project_item_add",
    title: "Add item to GitHub project",
    description: descriptions.repo_github_project_item_add,
    inputSchema: toolContracts.repo_github_project_item_add.input,
    outputSchema: toolContracts.repo_github_project_item_add.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubProjectItemAddHandler
  },
  {
    name: "repo_github_milestone_list",
    title: "List GitHub milestones",
    description: descriptions.repo_github_milestone_list,
    inputSchema: toolContracts.repo_github_milestone_list.input,
    outputSchema: toolContracts.repo_github_milestone_list.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubMilestoneListHandler
  },
  {
    name: "repo_github_milestone_read",
    title: "Read GitHub milestone details",
    description: descriptions.repo_github_milestone_read,
    inputSchema: toolContracts.repo_github_milestone_read.input,
    outputSchema: toolContracts.repo_github_milestone_read.output,
    effect: "external-read",
    annotations: externalReadOnlyAnnotations,
    handler: githubMilestoneReadHandler
  },
  {
    name: "repo_github_milestone_create",
    title: "Create GitHub milestone",
    description: descriptions.repo_github_milestone_create,
    inputSchema: toolContracts.repo_github_milestone_create.input,
    outputSchema: toolContracts.repo_github_milestone_create.output,
    effect: "external-write",
    annotations: externalWriteAnnotations,
    handler: githubMilestoneCreateHandler
  },
  {
    name: "repo_git_status",
    title: "Read git status",
    description: descriptions.repo_git_status,
    inputSchema: toolContracts.repo_git_status.input,
    outputSchema: toolContracts.repo_git_status.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitStatusHandler
  },
  {
    name: "repo_git_diff",
    title: "Read git diff",
    description: descriptions.repo_git_diff,
    inputSchema: toolContracts.repo_git_diff.input,
    outputSchema: toolContracts.repo_git_diff.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitDiffHandler
  },
  {
    name: "repo_git_log",
    title: "Read git log",
    description: descriptions.repo_git_log,
    inputSchema: toolContracts.repo_git_log.input,
    outputSchema: toolContracts.repo_git_log.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitLogHandler
  },
  {
    name: "repo_git_show",
    title: "Show git commit",
    description: descriptions.repo_git_show,
    inputSchema: toolContracts.repo_git_show.input,
    outputSchema: toolContracts.repo_git_show.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitShowHandler
  },
  {
    name: "repo_git_blame",
    title: "Read git blame",
    description: descriptions.repo_git_blame,
    inputSchema: toolContracts.repo_git_blame.input,
    outputSchema: toolContracts.repo_git_blame.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitBlameHandler
  },
  {
    name: "repo_git_branches",
    title: "List git branches",
    description: descriptions.repo_git_branches,
    inputSchema: toolContracts.repo_git_branches.input,
    outputSchema: toolContracts.repo_git_branches.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitBranchesHandler
  },
  {
    name: "repo_git_review",
    title: "Plan git review",
    description: descriptions.repo_git_review,
    inputSchema: toolContracts.repo_git_review.input,
    outputSchema: toolContracts.repo_git_review.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: gitReviewHandler
  },
  {
    name: "repo_git_stage",
    title: "Stage explicit git paths",
    description: descriptions.repo_git_stage,
    inputSchema: toolContracts.repo_git_stage.input,
    outputSchema: toolContracts.repo_git_stage.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: gitStageHandler
  },
  {
    name: "repo_git_unstage",
    title: "Unstage explicit git paths",
    description: descriptions.repo_git_unstage,
    inputSchema: toolContracts.repo_git_unstage.input,
    outputSchema: toolContracts.repo_git_unstage.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: gitUnstageHandler
  },
  {
    name: "repo_git_restore_paths",
    title: "Restore explicit worktree paths",
    description: descriptions.repo_git_restore_paths,
    inputSchema: toolContracts.repo_git_restore_paths.input,
    outputSchema: toolContracts.repo_git_restore_paths.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: gitRestorePathsHandler
  },
  {
    name: "repo_git_commit",
    title: "Create local git commit",
    description: descriptions.repo_git_commit,
    inputSchema: toolContracts.repo_git_commit.input,
    outputSchema: toolContracts.repo_git_commit.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: gitCommitHandler
  },
  {
    name: "repo_write_stage",
    title: "Stage reviewed paths",
    description: descriptions.repo_write_stage,
    inputSchema: toolContracts.repo_write_stage.input,
    outputSchema: toolContracts.repo_write_stage.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeStageHandler
  },
  {
    name: "repo_write_unstage",
    title: "Unstage reviewed paths",
    description: descriptions.repo_write_unstage,
    inputSchema: toolContracts.repo_write_unstage.input,
    outputSchema: toolContracts.repo_write_unstage.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeUnstageHandler
  },
  {
    name: "repo_write_commit",
    title: "Create reviewed local commit",
    description: descriptions.repo_write_commit,
    inputSchema: toolContracts.repo_write_commit.input,
    outputSchema: toolContracts.repo_write_commit.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeCommitHandler
  },
  {
    name: "repo_write_stage_commit",
    title: "Stage and commit reviewed paths",
    description: descriptions.repo_write_stage_commit,
    inputSchema: toolContracts.repo_write_stage_commit.input,
    outputSchema: toolContracts.repo_write_stage_commit.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeStageCommitHandler
  },
  {
    name: "repo_write_recover",
    title: "Recover reviewed paths",
    description: descriptions.repo_write_recover,
    inputSchema: toolContracts.repo_write_recover.input,
    outputSchema: toolContracts.repo_write_recover.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeRecoverHandler
  },
  {
    name: "repo_cleanup_paths",
    title: "Clean up generated paths",
    description: descriptions.repo_cleanup_paths,
    inputSchema: toolContracts.repo_cleanup_paths.input,
    outputSchema: toolContracts.repo_cleanup_paths.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: cleanupPathsHandler
  },
  {
    name: "repo_project_brief",
    title: "Create project brief",
    description: descriptions.repo_project_brief,
    inputSchema: toolContracts.repo_project_brief.input,
    outputSchema: toolContracts.repo_project_brief.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: projectBriefHandler
  },
  {
    name: "repo_task_inventory",
    title: "Inventory repository tasks",
    description: descriptions.repo_task_inventory,
    inputSchema: toolContracts.repo_task_inventory.input,
    outputSchema: toolContracts.repo_task_inventory.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: taskInventoryHandler
  },
  {
    name: "repo_decision_memory",
    title: "Extract decision memory",
    description: descriptions.repo_decision_memory,
    inputSchema: toolContracts.repo_decision_memory.input,
    outputSchema: toolContracts.repo_decision_memory.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: decisionMemoryHandler
  },
  {
    name: "repo_change_plan",
    title: "Plan repository change",
    description: descriptions.repo_change_plan,
    inputSchema: toolContracts.repo_change_plan.input,
    outputSchema: toolContracts.repo_change_plan.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: changePlanHandler
  },
  {
    name: "repo_next_action",
    title: "Recommend next action",
    description: descriptions.repo_next_action,
    inputSchema: toolContracts.repo_next_action.input,
    outputSchema: toolContracts.repo_next_action.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: nextActionHandler
  },
  {
    name: "repo_plan_review",
    title: "Plan repository review",
    description: descriptions.repo_plan_review,
    inputSchema: toolContracts.repo_plan_review.input,
    outputSchema: toolContracts.repo_plan_review.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: planReviewHandler
  },
  {
    name: "repo_prepare_codex_task",
    title: "Prepare Codex task prompt",
    description: descriptions.repo_prepare_codex_task,
    inputSchema: toolContracts.repo_prepare_codex_task.input,
    outputSchema: toolContracts.repo_prepare_codex_task.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: prepareCodexTaskHandler
  },
  {
    name: "repo_write_codex_task",
    title: "Write Codex task prompt",
    description: descriptions.repo_write_codex_task,
    inputSchema: toolContracts.repo_write_codex_task.input,
    outputSchema: toolContracts.repo_write_codex_task.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeCodexTaskHandler
  },
  {
    name: "repo_codex_review",
    title: "Review Codex result",
    description: descriptions.repo_codex_review,
    inputSchema: toolContracts.repo_codex_review.input,
    outputSchema: toolContracts.repo_codex_review.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: codexReviewHandler
  },
  {
    name: "repo_write_file",
    title: "Write one repository file",
    description: descriptions.repo_write_file,
    inputSchema: toolContracts.repo_write_file.input,
    outputSchema: toolContracts.repo_write_file.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeFileHandler
  },
  {
    name: "repo_write_changes",
    title: "Apply repository edit pack",
    description: descriptions.repo_write_changes,
    inputSchema: toolContracts.repo_write_changes.input,
    outputSchema: toolContracts.repo_write_changes.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeChangesHandler
  },
  {
    name: "repo_write_handoff",
    title: "Create ChatGPT handoff",
    description: descriptions.repo_write_handoff,
    inputSchema: toolContracts.repo_write_handoff.input,
    outputSchema: toolContracts.repo_write_handoff.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: writeHandoffHandler
  },
  {
    name: "repo_handoff_list",
    title: "List session handoffs",
    description: descriptions.repo_handoff_list,
    inputSchema: toolContracts.repo_handoff_list.input,
    outputSchema: toolContracts.repo_handoff_list.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: listHandoffsHandler
  },
  {
    name: "repo_action_list",
    title: "List configured actions",
    description: descriptions.repo_action_list,
    inputSchema: toolContracts.repo_action_list.input,
    outputSchema: toolContracts.repo_action_list.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: actionListHandler
  },
  {
    name: "repo_action_describe",
    title: "Describe configured action",
    description: descriptions.repo_action_describe,
    inputSchema: toolContracts.repo_action_describe.input,
    outputSchema: toolContracts.repo_action_describe.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: actionDescribeHandler
  },
  {
    name: "repo_action_run",
    title: "Run configured action",
    description: descriptions.repo_action_run,
    inputSchema: toolContracts.repo_action_run.input,
    outputSchema: toolContracts.repo_action_run.output,
    effect: "process-write",
    annotations: writeAnnotations,
    handler: actionRunHandler
  },
  {
    name: "repo_action_status",
    title: "Read action run status",
    description: descriptions.repo_action_status,
    inputSchema: toolContracts.repo_action_status.input,
    outputSchema: toolContracts.repo_action_status.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: actionStatusHandler
  },
  {
    name: "repo_action_logs",
    title: "Read action run logs",
    description: descriptions.repo_action_logs,
    inputSchema: toolContracts.repo_action_logs.input,
    outputSchema: toolContracts.repo_action_logs.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: actionLogsHandler
  },
  {
    name: "repo_action_cancel",
    title: "Cancel running action",
    description: descriptions.repo_action_cancel,
    inputSchema: toolContracts.repo_action_cancel.input,
    outputSchema: toolContracts.repo_action_cancel.output,
    effect: "process-write",
    annotations: writeAnnotations,
    handler: actionCancelHandler
  },
  {
    name: "repo_action_recent",
    title: "List recent action runs",
    description: descriptions.repo_action_recent,
    inputSchema: toolContracts.repo_action_recent.input,
    outputSchema: toolContracts.repo_action_recent.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: actionRecentHandler
  },
  {
    name: "repo_create_files",
    title: "Create new files",
    description: descriptions.repo_create_files,
    inputSchema: toolContracts.repo_create_files.input,
    outputSchema: toolContracts.repo_create_files.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: createFilesHandler
  },
  {
    name: "repo_apply_patch",
    title: "Apply unified diff patch",
    description: descriptions.repo_apply_patch,
    inputSchema: toolContracts.repo_apply_patch.input,
    outputSchema: toolContracts.repo_apply_patch.output,
    effect: "local-write",
    annotations: writeAnnotations,
    handler: applyPatchHandler
  },
  {
    name: "repo_manifest",
    title: "Tool manifest and policies",
    description: descriptions.repo_manifest,
    inputSchema: toolContracts.repo_manifest.input,
    outputSchema: toolContracts.repo_manifest.output,
    effect: "local-read",
    annotations: readOnlyAnnotations,
    handler: manifestHandler
  }
];
