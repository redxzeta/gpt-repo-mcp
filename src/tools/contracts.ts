import type { z } from "zod";
import { ActionCancelInputSchema, ActionCancelResultSchema, ActionDescribeInputSchema, ActionDescribeResultSchema, ActionListInputSchema, ActionListResultSchema, ActionLogsInputSchema, ActionLogsResultSchema, ActionRecentInputSchema, ActionRecentResultSchema, ActionRunInputSchema, ActionRunResultSchema, ActionStatusInputSchema, ActionStatusResultSchema } from "../contracts/actions.contract.js";
import { ChangePlanInputSchema, ChangePlanResultSchema } from "../contracts/change-plan.contract.js";
import { CleanupPathsInputSchema, CleanupPathsResultSchema } from "../contracts/cleanup.contract.js";
import { CodexReviewInputSchema, CodexReviewResultSchema, CodexTaskInputSchema, CodexTaskResultSchema, CodexTaskWriteInputSchema, CodexTaskWriteResultSchema } from "../contracts/codex-task.contract.js";
import { DecisionLogInputSchema, DecisionLogResultSchema } from "../contracts/decision.contract.js";
import { FetchFileInputSchema, FileContentSchema, ReadManyInputSchema, ReadManyResultSchema } from "../contracts/file.contract.js";
import { ApplyPatchInputSchema, ApplyPatchResultSchema, CreateFilesInputSchema, CreateFilesResultSchema } from "../contracts/file-operations.contract.js";
import { GitCommitInputSchema, GitCommitResultSchema, GitRecoverInputSchema, GitRecoverResultSchema, GitRestorePathsInputSchema, GitRestorePathsResultSchema, GitStageCommitInputSchema, GitStageCommitResultSchema, GitStageInputSchema, GitStageResultSchema, GitUnstageInputSchema, GitUnstageResultSchema } from "../contracts/git-operations.contract.js";
import { GitDiffInputSchema, GitDiffResultSchema, GitStatusInputSchema, GitStatusResultSchema, GitLogInputSchema, GitLogResultSchema, GitShowInputSchema, GitShowResultSchema, GitBlameInputSchema, GitBlameResultSchema, GitBranchesInputSchema, GitBranchesResultSchema } from "../contracts/git.contract.js";
import { GitHubCommentResultSchema, GitHubIssueCommentInputSchema, GitHubIssueCreateInputSchema, GitHubIssueCreateResultSchema, GitHubIssuesInputSchema, GitHubIssuesResultSchema, GitHubIssueReadInputSchema, GitHubIssueReadResultSchema, GitHubMilestoneCreateInputSchema, GitHubMilestoneCreateResultSchema, GitHubMilestoneListInputSchema, GitHubMilestoneListResultSchema, GitHubMilestoneReadInputSchema, GitHubMilestoneReadResultSchema, GitHubPrChecksInputSchema, GitHubPrChecksResultSchema, GitHubPrCreateInputSchema, GitHubPrCreateResultSchema, GitHubPrListInputSchema, GitHubPrListResultSchema, GitHubPrReadInputSchema, GitHubPrReadResultSchema, GitHubProjectCreateInputSchema, GitHubProjectCreateResultSchema, GitHubProjectItemAddInputSchema, GitHubProjectItemAddResultSchema, GitHubProjectItemListInputSchema, GitHubProjectItemListResultSchema, GitHubProjectListInputSchema, GitHubProjectListResultSchema, GitHubProjectReadInputSchema, GitHubProjectReadResultSchema, GitHubPullRequestCommentInputSchema } from "../contracts/github.contract.js";
import { GitReviewInputSchema, GitReviewResultSchema } from "../contracts/git-review.contract.js";
import { HandoffInputSchema, HandoffResultSchema, HandoffListInputSchema, HandoffListResultSchema } from "../contracts/handoff.contract.js";
import { ManifestInputSchema, ManifestResultSchema } from "../contracts/manifest.contract.js";
import { NextActionInputSchema, NextActionResultSchema } from "../contracts/next-action.contract.js";
import { LastWriteInputSchema, LastWriteResultSchema } from "../contracts/operation-receipt.contract.js";
import { PolicyExplainInputSchema, PolicyExplainResultSchema } from "../contracts/policy.contract.js";
import { ProjectBriefInputSchema, ProjectBriefResultSchema } from "../contracts/project.contract.js";
import { AgentContextInputSchema, AgentContextResultSchema, DependencyMapInputSchema, DependencyMapResultSchema, SymbolOutlineInputSchema, SymbolOutlineResultSchema, ValidationPlanInputSchema, ValidationPlanResultSchema } from "../contracts/repo-intelligence.contract.js";
import { ReleaseNotesInputSchema, ReleaseNotesResultSchema } from "../contracts/release-notes.contract.js";
import { RepoInputSchema, RepoListResultSchema, RepoTreeInputSchema } from "../contracts/repo.contract.js";
import { PlanReviewInputSchema, PlanReviewResultSchema } from "../contracts/review.contract.js";
import { SearchInputSchema, SearchResponseSchema } from "../contracts/search.contract.js";
import { TaskInventoryInputSchema, TaskInventoryResultSchema } from "../contracts/task.contract.js";
import { RepoTreeResultSchema } from "../contracts/tree.contract.js";
import { WriteChangesInputSchema, WriteChangesResultSchema, WriteFileInputSchema, WriteFileResultSchema } from "../contracts/write.contract.js";

export type ToolName =
  | "repo_list_roots"
  | "repo_policy_explain"
  | "repo_last_write"
  | "repo_tree"
  | "repo_search"
  | "repo_fetch_file"
  | "repo_read_many"
  | "repo_symbol_outline"
  | "repo_dependency_map"
  | "repo_validation_plan"
  | "repo_agent_context"
  | "repo_github_issues"
  | "repo_github_issue_create"
  | "repo_github_issue_comment"
  | "repo_github_pr_comment"
  | "repo_github_issue_read"
  | "repo_github_pr_list"
  | "repo_github_pr_read"
  | "repo_github_pr_create"
  | "repo_github_pr_checks"
  | "repo_github_project_list"
  | "repo_github_project_read"
  | "repo_github_project_create"
  | "repo_github_project_item_list"
  | "repo_github_project_item_add"
  | "repo_github_milestone_list"
  | "repo_github_milestone_read"
  | "repo_github_milestone_create"
  | "repo_git_status"
  | "repo_git_diff"
  | "repo_git_log"
  | "repo_git_show"
  | "repo_git_blame"
  | "repo_git_branches"
  | "repo_git_review"
  | "repo_git_stage"
  | "repo_git_unstage"
  | "repo_git_restore_paths"
  | "repo_git_commit"
  | "repo_write_stage"
  | "repo_write_unstage"
  | "repo_write_commit"
  | "repo_write_stage_commit"
  | "repo_write_recover"
  | "repo_cleanup_paths"
  | "repo_project_brief"
  | "repo_task_inventory"
  | "repo_decision_memory"
  | "repo_change_plan"
  | "repo_next_action"
  | "repo_plan_review"
  | "repo_prepare_codex_task"
  | "repo_write_codex_task"
  | "repo_codex_review"
  | "repo_write_file"
  | "repo_write_changes"
  | "repo_write_handoff"
  | "repo_handoff_list"
  | "repo_action_list"
  | "repo_action_describe"
  | "repo_action_run"
  | "repo_action_status"
  | "repo_action_logs"
  | "repo_action_cancel"
  | "repo_action_recent"
  | "repo_create_files"
  | "repo_apply_patch"
  | "repo_manifest"
  | "repo_release_notes";

export type ToolContract = {
  input: z.ZodObject<z.ZodRawShape>;
  output: z.ZodObject<z.ZodRawShape>;
};

export const toolContracts = {
  repo_list_roots: {
    input: RepoInputSchema.omit({ repo_id: true }),
    output: RepoListResultSchema
  },
  repo_policy_explain: {
    input: PolicyExplainInputSchema,
    output: PolicyExplainResultSchema
  },
  repo_last_write: {
    input: LastWriteInputSchema,
    output: LastWriteResultSchema
  },
  repo_tree: {
    input: RepoTreeInputSchema,
    output: RepoTreeResultSchema
  },
  repo_search: {
    input: SearchInputSchema,
    output: SearchResponseSchema
  },
  repo_fetch_file: {
    input: FetchFileInputSchema,
    output: FileContentSchema
  },
  repo_read_many: {
    input: ReadManyInputSchema,
    output: ReadManyResultSchema
  },
  repo_symbol_outline: {
    input: SymbolOutlineInputSchema,
    output: SymbolOutlineResultSchema
  },
  repo_dependency_map: {
    input: DependencyMapInputSchema,
    output: DependencyMapResultSchema
  },
  repo_validation_plan: {
    input: ValidationPlanInputSchema,
    output: ValidationPlanResultSchema
  },
  repo_agent_context: {
    input: AgentContextInputSchema,
    output: AgentContextResultSchema
  },
  repo_github_issues: {
    input: GitHubIssuesInputSchema,
    output: GitHubIssuesResultSchema
  },
  repo_github_issue_create: {
    input: GitHubIssueCreateInputSchema,
    output: GitHubIssueCreateResultSchema
  },
  repo_github_issue_comment: {
    input: GitHubIssueCommentInputSchema,
    output: GitHubCommentResultSchema
  },
  repo_github_pr_comment: {
    input: GitHubPullRequestCommentInputSchema,
    output: GitHubCommentResultSchema
  },
  repo_github_issue_read: {
    input: GitHubIssueReadInputSchema,
    output: GitHubIssueReadResultSchema
  },
  repo_github_pr_list: {
    input: GitHubPrListInputSchema,
    output: GitHubPrListResultSchema
  },
  repo_github_pr_read: {
    input: GitHubPrReadInputSchema,
    output: GitHubPrReadResultSchema
  },
  repo_github_pr_create: {
    input: GitHubPrCreateInputSchema,
    output: GitHubPrCreateResultSchema
  },
  repo_github_pr_checks: {
    input: GitHubPrChecksInputSchema,
    output: GitHubPrChecksResultSchema
  },
  repo_github_project_list: {
    input: GitHubProjectListInputSchema,
    output: GitHubProjectListResultSchema
  },
  repo_github_project_read: {
    input: GitHubProjectReadInputSchema,
    output: GitHubProjectReadResultSchema
  },
  repo_github_project_create: {
    input: GitHubProjectCreateInputSchema,
    output: GitHubProjectCreateResultSchema
  },
  repo_github_project_item_list: {
    input: GitHubProjectItemListInputSchema,
    output: GitHubProjectItemListResultSchema
  },
  repo_github_project_item_add: {
    input: GitHubProjectItemAddInputSchema,
    output: GitHubProjectItemAddResultSchema
  },
  repo_github_milestone_list: {
    input: GitHubMilestoneListInputSchema,
    output: GitHubMilestoneListResultSchema
  },
  repo_github_milestone_read: {
    input: GitHubMilestoneReadInputSchema,
    output: GitHubMilestoneReadResultSchema
  },
  repo_github_milestone_create: {
    input: GitHubMilestoneCreateInputSchema,
    output: GitHubMilestoneCreateResultSchema
  },
  repo_git_status: {
    input: GitStatusInputSchema,
    output: GitStatusResultSchema
  },
  repo_git_diff: {
    input: GitDiffInputSchema,
    output: GitDiffResultSchema
  },
  repo_git_log: {
    input: GitLogInputSchema,
    output: GitLogResultSchema
  },
  repo_git_show: {
    input: GitShowInputSchema,
    output: GitShowResultSchema
  },
  repo_git_blame: {
    input: GitBlameInputSchema,
    output: GitBlameResultSchema
  },
  repo_git_branches: {
    input: GitBranchesInputSchema,
    output: GitBranchesResultSchema
  },
  repo_git_review: {
    input: GitReviewInputSchema,
    output: GitReviewResultSchema
  },
  repo_git_stage: {
    input: GitStageInputSchema,
    output: GitStageResultSchema
  },
  repo_git_unstage: {
    input: GitUnstageInputSchema,
    output: GitUnstageResultSchema
  },
  repo_git_restore_paths: {
    input: GitRestorePathsInputSchema,
    output: GitRestorePathsResultSchema
  },
  repo_git_commit: {
    input: GitCommitInputSchema,
    output: GitCommitResultSchema
  },
  repo_write_stage: {
    input: GitStageInputSchema,
    output: GitStageResultSchema
  },
  repo_write_unstage: {
    input: GitUnstageInputSchema,
    output: GitUnstageResultSchema
  },
  repo_write_commit: {
    input: GitCommitInputSchema,
    output: GitCommitResultSchema
  },
  repo_write_stage_commit: {
    input: GitStageCommitInputSchema,
    output: GitStageCommitResultSchema
  },
  repo_write_recover: {
    input: GitRecoverInputSchema,
    output: GitRecoverResultSchema
  },
  repo_cleanup_paths: {
    input: CleanupPathsInputSchema,
    output: CleanupPathsResultSchema
  },
  repo_project_brief: {
    input: ProjectBriefInputSchema,
    output: ProjectBriefResultSchema
  },
  repo_task_inventory: {
    input: TaskInventoryInputSchema,
    output: TaskInventoryResultSchema
  },
  repo_decision_memory: {
    input: DecisionLogInputSchema,
    output: DecisionLogResultSchema
  },
  repo_change_plan: {
    input: ChangePlanInputSchema,
    output: ChangePlanResultSchema
  },
  repo_next_action: {
    input: NextActionInputSchema,
    output: NextActionResultSchema
  },
  repo_plan_review: {
    input: PlanReviewInputSchema,
    output: PlanReviewResultSchema
  },
  repo_prepare_codex_task: {
    input: CodexTaskInputSchema,
    output: CodexTaskResultSchema
  },
  repo_write_codex_task: {
    input: CodexTaskWriteInputSchema,
    output: CodexTaskWriteResultSchema
  },
  repo_codex_review: {
    input: CodexReviewInputSchema,
    output: CodexReviewResultSchema
  },
  repo_write_file: {
    input: WriteFileInputSchema,
    output: WriteFileResultSchema
  },
  repo_write_changes: {
    input: WriteChangesInputSchema,
    output: WriteChangesResultSchema
  },
  repo_write_handoff: {
    input: HandoffInputSchema,
    output: HandoffResultSchema
  },
  repo_handoff_list: {
    input: HandoffListInputSchema,
    output: HandoffListResultSchema
  },
  repo_action_list: {
    input: ActionListInputSchema,
    output: ActionListResultSchema
  },
  repo_action_describe: {
    input: ActionDescribeInputSchema,
    output: ActionDescribeResultSchema
  },
  repo_action_run: {
    input: ActionRunInputSchema,
    output: ActionRunResultSchema
  },
  repo_action_status: {
    input: ActionStatusInputSchema,
    output: ActionStatusResultSchema
  },
  repo_action_logs: {
    input: ActionLogsInputSchema,
    output: ActionLogsResultSchema
  },
  repo_action_cancel: {
    input: ActionCancelInputSchema,
    output: ActionCancelResultSchema
  },
  repo_action_recent: {
    input: ActionRecentInputSchema,
    output: ActionRecentResultSchema
  },
  repo_create_files: {
    input: CreateFilesInputSchema,
    output: CreateFilesResultSchema
  },
  repo_apply_patch: {
    input: ApplyPatchInputSchema,
    output: ApplyPatchResultSchema
  },
  repo_manifest: {
    input: ManifestInputSchema,
    output: ManifestResultSchema
  },
  repo_release_notes: {
    input: ReleaseNotesInputSchema,
    output: ReleaseNotesResultSchema
  }
} as const satisfies Record<ToolName, ToolContract>;
