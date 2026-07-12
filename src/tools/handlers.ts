import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { PathSandbox } from "../services/path-sandbox.js";
import { CleanupService } from "../services/cleanup-service.js";
import { RepoTreeService } from "../services/repo-tree-service.js";
import { SearchService } from "../services/search-service.js";
import { FileReader } from "../services/file-reader.js";
import { GitHubService } from "../services/github-service.js";
import { GitService } from "../services/git-service.js";
import { GitReviewService } from "../services/git-review-service.js";
import { GitOperationsService } from "../services/git-operations-service.js";
import { HandoffService } from "../services/handoff-service.js";
import { OperationsPolicy } from "../services/operations-policy.js";
import { ReviewPlanner } from "../services/review-planner.js";
import { ReadManyService } from "../services/read-many-service.js";
import { ProjectBriefService } from "../services/project-brief-service.js";
import { TaskInventoryService } from "../services/task-inventory-service.js";
import { DecisionLogService } from "../services/decision-log-service.js";
import { ChangePlanService } from "../services/change-plan-service.js";
import { CodexResultService } from "../services/codex-result-service.js";
import { CodexTaskService } from "../services/codex-task-service.js";
import { NextActionService } from "../services/next-action-service.js";
import { PolicyExplainService } from "../services/policy-explain-service.js";
import { FileWriter } from "../services/file-writer.js";
import { WriteChangesService } from "../services/write-changes-service.js";
import { WritePolicy } from "../services/write-policy.js";
import { OperationReceiptService } from "../services/operation-receipt-service.js";
import { RepoIntelligenceService } from "../services/repo-intelligence-service.js";
import { ActionService } from "../services/action-service.js";
import { FileCreateService, PatchService } from "../services/file-create-service.js";
import { ReleaseNotesService } from "../services/release-notes-service.js";
import { createErrorEnvelope, createSuccessEnvelope } from "../runtime/result-envelope.js";
import { toRepoReaderError } from "../runtime/errors.js";
import { audit } from "../runtime/telemetry.js";
import type { RuntimeContext } from "../runtime/context.js";
import type { SearchOptions } from "../services/search-service.js";
import type { FetchFileOptions } from "../services/file-reader.js";
import type { TreeOptions } from "../services/repo-tree-service.js";
import type { GitHubIssueCommentInput, GitHubIssueCreateInput, GitHubIssuesInput, GitHubIssueReadInput, GitHubMilestoneCreateInput, GitHubMilestoneListInput, GitHubMilestoneReadInput, GitHubProjectCreateInput, GitHubProjectItemAddInput, GitHubProjectItemListInput, GitHubProjectListInput, GitHubProjectReadInput, GitHubPullRequestCommentInput, GitHubPrChecksInput, GitHubPrCreateInput, GitHubPrListInput, GitHubPrReadInput } from "../contracts/github.contract.js";
import type { ProjectBriefInput } from "../contracts/project.contract.js";
import type { AgentContextInput, DependencyMapInput, SymbolOutlineInput, ValidationPlanInput } from "../contracts/repo-intelligence.contract.js";
import type { TaskInventoryInput } from "../contracts/task.contract.js";
import type { DecisionLogInput } from "../contracts/decision.contract.js";
import type { ChangePlanInput } from "../contracts/change-plan.contract.js";
import type { CodexReviewInput, CodexTaskInput, CodexTaskWriteInput } from "../contracts/codex-task.contract.js";
import type { NextActionInput } from "../contracts/next-action.contract.js";
import type { LastWriteInput } from "../contracts/operation-receipt.contract.js";
import type { PolicyExplainInput } from "../contracts/policy.contract.js";
import type { WriteChangesInput, WriteFileInput } from "../contracts/write.contract.js";
import type { GitCommitInput, GitRecoverInput, GitRestorePathsInput, GitStageCommitInput, GitStageInput, GitUnstageInput } from "../contracts/git-operations.contract.js";

type GitLogInput = RepoInput & { ref?: string; paths?: string[]; max_count?: number; max_bytes?: number };
type GitShowInput = RepoInput & { commit_sha: string; max_bytes?: number };
type GitBlameInput = RepoInput & { path: string; ref?: string; max_bytes?: number };
type GitBranchesInput = RepoInput & { include_remotes?: boolean; max_count?: number };
import type { GitReviewInput } from "../contracts/git-review.contract.js";
import type { CleanupPathsInput } from "../contracts/cleanup.contract.js";
import type { HandoffInput, HandoffListInput, HandoffListResult } from "../contracts/handoff.contract.js";
import type { ActionCancelInput, ActionDescribeInput, ActionListInput, ActionLogsInput, ActionRecentInput, ActionRunInput, ActionStatusInput } from "../contracts/actions.contract.js";
import type { ManifestInput, ManifestResult } from "../contracts/manifest.contract.js";
import type { ReleaseNotesInput } from "../contracts/release-notes.contract.js";
import { toolCatalog } from "./catalog.js";
import type { ApplyPatchInput, CreateFilesInput } from "../contracts/file-operations.contract.js";

type RepoInput = { repo_id: string };
type ReadManyInput = RepoInput & {
  paths?: string[];
  include_globs?: string[];
  exclude_globs?: string[];
  max_files?: number;
  max_bytes_per_file?: number;
  max_total_bytes?: number;
  cursor?: string;
};
type GitDiffInput = RepoInput & {
  base?: string;
  compare?: string;
  staged?: boolean;
  unstaged?: boolean;
  paths?: string[];
  max_bytes?: number;
  context_lines?: number;
};

export type ToolHandler = (input: unknown, context: RuntimeContext) => Promise<CallToolResult>;

const HIDE_ROOT_PATHS = process.env.GPT_REPO_HIDE_ROOT_PATHS === "true";

export const listRootsHandler: ToolHandler = async (_input, context) => {
  const repos = context.registry.list().map((repo) => {
    if (HIDE_ROOT_PATHS) {
      return { repo_id: repo.repo_id, display_name: repo.display_name };
    }
    return repo;
  });
  return createSuccessEnvelope({ repos }, `${repos.length} approved repositories available.`);
};

export const policyExplainHandler: ToolHandler = async (input, context) => safeTool<PolicyExplainInput>("repo_policy_explain", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = new PolicyExplainService(repo).explain(args);
  audit({
    tool: "repo_policy_explain",
    repo_id: args.repo_id,
    paths: result.path ? [result.path] : undefined,
    warnings: [result.read, result.write, result.cleanup].filter((decision) => !decision.allowed).map((decision) => decision.code)
  });
  return createSuccessEnvelope(result, result.summary);
});

export const lastWriteHandler: ToolHandler = async (input, context) => safeTool<LastWriteInput>("repo_last_write", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new OperationReceiptService(repo.root).readLastWrite(args.repo_id);
  audit({ tool: "repo_last_write", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, result.found ? `Last write receipt found for ${args.repo_id}.` : "No last write receipt found.");
});

export const treeHandler: ToolHandler = async (input, context) => safeTool<TreeOptions & RepoInput>("repo_tree", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new RepoTreeService(repo.root, sandbox).tree(args);
  audit({ tool: "repo_tree", repo_id: args.repo_id, counts: { entries: result.entries.length }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned ${result.entries.length} tree entries.`);
});

export const searchHandler: ToolHandler = async (input, context) => safeTool<SearchOptions & RepoInput>("repo_search", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new SearchService(repo.root, sandbox).search(args);
  audit({ tool: "repo_search", repo_id: args.repo_id, counts: { results: result.returned_count }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned ${result.returned_count} search results.`);
});

export const fetchFileHandler: ToolHandler = async (input, context) => safeTool<FetchFileOptions & RepoInput>("repo_fetch_file", input, context, async (args) => {
  const cacheKey = `file:${args.repo_id}:${args.path}`;
  const cached = context.cache.get(cacheKey);
  if (cached) {
    audit({ tool: "repo_fetch_file", repo_id: args.repo_id, paths: [args.path], counts: { bytes: 0 }, truncated: false, warnings: [] });
    return createSuccessEnvelope(cached, `Read ${args.path} (cached).`);
  }
  const repo = context.registry.get(args.repo_id);
  const result = await new FileReader(new PathSandbox(repo.root)).read(args);
  context.cache.set(cacheKey, result, 60_000);
  audit({ tool: "repo_fetch_file", repo_id: args.repo_id, paths: [result.path], counts: { bytes: result.size_bytes }, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Read ${result.path}.`, { warnings: result.warnings });
});

export const readManyHandler: ToolHandler = async (input, context) => safeTool<ReadManyInput>("repo_read_many", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new ReadManyService(repo.root, sandbox, context.registry.limits).readMany(args);
  audit({ tool: "repo_read_many", repo_id: args.repo_id, paths: result.files.map((file) => file.path), counts: { returned: result.files.length, skipped: result.skipped.length }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Read ${result.files.length} files; skipped ${result.skipped.length}.`);
});

export const symbolOutlineHandler: ToolHandler = async (input, context) => safeTool<SymbolOutlineInput>("repo_symbol_outline", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new RepoIntelligenceService(repo.root, new PathSandbox(repo.root)).symbolOutline(args);
  audit({ tool: "repo_symbol_outline", repo_id: args.repo_id, paths: result.files.map((file) => file.path), counts: result.counts, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Outlined ${result.counts.symbols} symbols across ${result.counts.files} files.`);
});

export const dependencyMapHandler: ToolHandler = async (input, context) => safeTool<DependencyMapInput>("repo_dependency_map", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new RepoIntelligenceService(repo.root, new PathSandbox(repo.root)).dependencyMap(args);
  audit({ tool: "repo_dependency_map", repo_id: args.repo_id, paths: args.paths, counts: result.counts, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.counts.edges} dependency edges.`);
});

export const validationPlanHandler: ToolHandler = async (input, context) => safeTool<ValidationPlanInput>("repo_validation_plan", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new RepoIntelligenceService(repo.root, new PathSandbox(repo.root)).validationPlan(args);
  audit({ tool: "repo_validation_plan", repo_id: args.repo_id, paths: args.changed_paths, counts: { commands: result.commands.length, areas: result.affected_areas.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Recommended ${result.commands.length} validation commands.`);
});

export const agentContextHandler: ToolHandler = async (input, context) => safeTool<AgentContextInput>("repo_agent_context", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new RepoIntelligenceService(repo.root, new PathSandbox(repo.root)).agentContext(args);
  audit({ tool: "repo_agent_context", repo_id: args.repo_id, paths: result.read_first.map((entry) => entry.path), counts: { docs: result.guidance.length, scripts: result.scripts.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.guidance.length} agent context documents.`);
});

export const githubIssuesHandler: ToolHandler = async (input, context) => safeTool<GitHubIssuesInput>("repo_github_issues", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).listIssues(args);
  audit({ tool: "repo_github_issues", repo_id: args.repo_id, counts: { issues: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.repository ? `Returned ${result.count} GitHub issues for ${result.repository}.` : "No GitHub repository was detected.");
});

export const githubIssueCreateHandler: ToolHandler = async (input, context) => safeTool<GitHubIssueCreateInput>("repo_github_issue_create", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).createIssue(args);
  audit({ tool: "repo_github_issue_create", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run
      ? `Dry run checked GitHub issue creation for ${args.title}.`
      : result.url
        ? `Created GitHub issue ${result.url}.`
        : `Issue creation did not complete for ${args.title}.`
  );
});

export const githubIssueCommentHandler: ToolHandler = async (input, context) => safeTool<GitHubIssueCommentInput>("repo_github_issue_comment", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).commentOnIssue(args);
  audit({ tool: "repo_github_issue_comment", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked issue comment on #${args.issue_number}.` : `Commented on issue #${args.issue_number}.`);
});

export const githubPrCommentHandler: ToolHandler = async (input, context) => safeTool<GitHubPullRequestCommentInput>("repo_github_pr_comment", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).commentOnPullRequest(args);
  audit({ tool: "repo_github_pr_comment", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked PR comment on #${args.pr_number}.` : `Commented on PR #${args.pr_number}.`);
});

export const githubIssueReadHandler: ToolHandler = async (input, context) => safeTool<GitHubIssueReadInput>("repo_github_issue_read", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).readIssue(args);
  audit({ tool: "repo_github_issue_read", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Read issue #${result.number}: ${result.title}.`);
});

export const githubPrListHandler: ToolHandler = async (input, context) => safeTool<GitHubPrListInput>("repo_github_pr_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).listPullRequests(args);
  audit({ tool: "repo_github_pr_list", repo_id: args.repo_id, counts: { prs: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.repository ? `Returned ${result.count} pull requests for ${result.repository}.` : "No GitHub repository was detected.");
});

export const githubPrReadHandler: ToolHandler = async (input, context) => safeTool<GitHubPrReadInput>("repo_github_pr_read", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).readPullRequest(args);
  audit({ tool: "repo_github_pr_read", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Read PR #${result.number}: ${result.title}.`);
});

export const githubPrCreateHandler: ToolHandler = async (input, context) => safeTool<GitHubPrCreateInput>("repo_github_pr_create", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).createPullRequest(args);
  audit({ tool: "repo_github_pr_create", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run
      ? `Dry run checked PR creation.`
      : result.url
        ? `Created PR ${result.url}.`
        : `PR creation did not complete.`
  );
});

export const githubPrChecksHandler: ToolHandler = async (input, context) => safeTool<GitHubPrChecksInput>("repo_github_pr_checks", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).prChecks(args);
  audit({ tool: "repo_github_pr_checks", repo_id: args.repo_id, counts: { checks: result.checks.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `PR #${args.pr_number} checks: ${result.overall_status}.`);
});

export const githubProjectListHandler: ToolHandler = async (input, context) => safeTool<GitHubProjectListInput>("repo_github_project_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).listProjects(args);
  audit({ tool: "repo_github_project_list", repo_id: args.repo_id, counts: { projects: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.repository ? `Returned ${result.count} GitHub projects for ${result.owner}.` : "No GitHub repository was detected.");
});

export const githubProjectReadHandler: ToolHandler = async (input, context) => safeTool<GitHubProjectReadInput>("repo_github_project_read", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).readProject(args);
  audit({ tool: "repo_github_project_read", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Read project #${result.number}: ${result.title}.`);
});

export const githubProjectCreateHandler: ToolHandler = async (input, context) => safeTool<GitHubProjectCreateInput>("repo_github_project_create", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).createProject(args);
  audit({ tool: "repo_github_project_create", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run
      ? `Dry run checked GitHub project creation for ${args.title}.`
      : result.url
        ? `Created GitHub project ${result.url}.`
        : `Project creation did not complete for ${args.title}.`
  );
});

export const githubProjectItemListHandler: ToolHandler = async (input, context) => safeTool<GitHubProjectItemListInput>("repo_github_project_item_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).listProjectItems(args);
  audit({ tool: "repo_github_project_item_list", repo_id: args.repo_id, counts: { items: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.count} items for project #${args.project_number}.`);
});

export const githubProjectItemAddHandler: ToolHandler = async (input, context) => safeTool<GitHubProjectItemAddInput>("repo_github_project_item_add", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).addProjectItem(args);
  audit({ tool: "repo_github_project_item_add", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run
      ? `Dry run checked adding item to project #${args.project_number}.`
      : `Added item to project #${args.project_number}.`
  );
});

export const githubMilestoneListHandler: ToolHandler = async (input, context) => safeTool<GitHubMilestoneListInput>("repo_github_milestone_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).listMilestones(args);
  audit({ tool: "repo_github_milestone_list", repo_id: args.repo_id, counts: { milestones: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.repository ? `Returned ${result.count} milestones for ${result.repository}.` : "No GitHub repository was detected.");
});

export const githubMilestoneReadHandler: ToolHandler = async (input, context) => safeTool<GitHubMilestoneReadInput>("repo_github_milestone_read", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).readMilestone(args);
  audit({ tool: "repo_github_milestone_read", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Read milestone #${result.number}: ${result.title}.`);
});

export const githubMilestoneCreateHandler: ToolHandler = async (input, context) => safeTool<GitHubMilestoneCreateInput>("repo_github_milestone_create", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitHubService(repo.root).createMilestone(args);
  audit({ tool: "repo_github_milestone_create", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run
      ? `Dry run checked GitHub milestone creation for ${args.title}.`
      : result.url
        ? `Created GitHub milestone ${result.url}.`
        : `Milestone creation did not complete for ${args.title}.`
  );
});

export const gitStatusHandler: ToolHandler = async (input, context) => safeTool<RepoInput>("repo_git_status", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).status();
  audit({ tool: "repo_git_status", repo_id: args.repo_id, counts: result.counts });
  return createSuccessEnvelope(result, result.clean ? "Repository is clean." : `Repository has ${result.files.length} changed files.`);
});

export const gitDiffHandler: ToolHandler = async (input, context) => safeTool<GitDiffInput>("repo_git_diff", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).diff(args);
  audit({ tool: "repo_git_diff", repo_id: args.repo_id, paths: args.paths, counts: { files: result.files.length }, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned diff for ${result.files.length} files.`);
});

export const gitLogHandler: ToolHandler = async (input, context) => safeTool<GitLogInput>("repo_git_log", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).log(args);
  audit({ tool: "repo_git_log", repo_id: args.repo_id, counts: { entries: result.entries.length }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned ${result.entries.length} commit(s).`);
});

export const gitShowHandler: ToolHandler = async (input, context) => safeTool<GitShowInput>("repo_git_show", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).show(args.commit_sha, args.max_bytes);
  audit({ tool: "repo_git_show", repo_id: args.repo_id, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned commit ${result.sha}.`);
});

export const gitBlameHandler: ToolHandler = async (input, context) => safeTool<GitBlameInput>("repo_git_blame", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).blame(args.path, { ref: args.ref, max_bytes: args.max_bytes });
  audit({ tool: "repo_git_blame", repo_id: args.repo_id, counts: { lines: result.lines.length }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned blame for ${result.file} (${result.lines.length} lines).`);
});

export const gitBranchesHandler: ToolHandler = async (input, context) => safeTool<GitBranchesInput>("repo_git_branches", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitService(repo.root).branches(args);
  audit({ tool: "repo_git_branches", repo_id: args.repo_id, counts: { branches: result.branches.length }, truncated: result.truncated });
  return createSuccessEnvelope(result, `Returned ${result.branches.length} branch(es).`);
});

export const gitReviewHandler: ToolHandler = async (input, context) => safeTool<GitReviewInput>("repo_git_review", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitReviewService(repo.root, new OperationsPolicy(repo.operations)).review(args);
  audit({ tool: "repo_git_review", repo_id: args.repo_id, counts: { changed: result.changed_paths.length, recommended: result.recommendation.recommended_stage_paths.length }, truncated: result.diff_summary.truncated, warnings: result.recommendation.warnings });
  return createSuccessEnvelope(result, result.clean ? "Repository is clean." : `Reviewed ${result.changed_paths.length} changed paths.`);
});

export const gitStageHandler: ToolHandler = async (input, context) => safeTool<GitStageInput>("repo_git_stage", input, context, async (args) => {
  return gitStage("repo_git_stage", args, context);
});

export const writeStageHandler: ToolHandler = async (input, context) => safeTool<GitStageInput>("repo_write_stage", input, context, async (args) => {
  return gitStage("repo_write_stage", args, context);
});

async function gitStage(tool: "repo_git_stage" | "repo_write_stage", args: GitStageInput, context: RuntimeContext): Promise<CallToolResult> {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).stage(args);
  audit({ tool, repo_id: args.repo_id, paths: result.staged_paths, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked staging ${result.staged_paths.length} paths.` : `Staged ${result.staged_paths.length} paths.`);
}

export const gitUnstageHandler: ToolHandler = async (input, context) => safeTool<GitUnstageInput>("repo_git_unstage", input, context, async (args) => {
  return gitUnstage("repo_git_unstage", args, context);
});

export const writeUnstageHandler: ToolHandler = async (input, context) => safeTool<GitUnstageInput>("repo_write_unstage", input, context, async (args) => {
  return gitUnstage("repo_write_unstage", args, context);
});

async function gitUnstage(tool: "repo_git_unstage" | "repo_write_unstage", args: GitUnstageInput, context: RuntimeContext): Promise<CallToolResult> {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).unstage(args);
  audit({ tool, repo_id: args.repo_id, paths: result.unstaged_paths, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked unstaging ${result.unstaged_paths.length} paths.` : `Unstaged ${result.unstaged_paths.length} paths.`);
}

export const gitRestorePathsHandler: ToolHandler = async (input, context) => safeTool<GitRestorePathsInput>("repo_git_restore_paths", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).restorePaths(args);
  audit({ tool: "repo_git_restore_paths", repo_id: args.repo_id, paths: result.restored_paths, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked restoring ${result.restored_paths.length} paths.` : `Restored ${result.restored_paths.length} paths.`);
});

export const gitCommitHandler: ToolHandler = async (input, context) => safeTool<GitCommitInput>("repo_git_commit", input, context, async (args) => {
  return gitCommit("repo_git_commit", args, context);
});

export const writeCommitHandler: ToolHandler = async (input, context) => safeTool<GitCommitInput>("repo_write_commit", input, context, async (args) => {
  return gitCommit("repo_write_commit", args, context);
});

export const writeStageCommitHandler: ToolHandler = async (input, context) => safeTool<GitStageCommitInput>("repo_write_stage_commit", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).stageCommit(args);
  audit({ tool: "repo_write_stage_commit", repo_id: args.repo_id, paths: result.committed_paths, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked stage and commit for ${result.committed_paths.length} paths.` : `Staged and committed ${result.committed_paths.length} paths.`);
});

export const writeRecoverHandler: ToolHandler = async (input, context) => safeTool<GitRecoverInput>("repo_write_recover", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).recover(args);
  audit({
    tool: "repo_write_recover",
    repo_id: args.repo_id,
    paths: [...result.unstaged_paths, ...result.restored_paths, ...result.deleted.map((entry) => entry.path)],
    warnings: result.warnings
  });
  const recoveredCount = result.unstaged_paths.length + result.restored_paths.length + result.deleted.length;
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked recovery for ${recoveredCount} paths.` : `Recovered ${recoveredCount} paths.`);
});

async function gitCommit(tool: "repo_git_commit" | "repo_write_commit", args: GitCommitInput, context: RuntimeContext): Promise<CallToolResult> {
  const repo = context.registry.get(args.repo_id);
  const result = await new GitOperationsService(repo.root, new OperationsPolicy(repo.operations)).commit(args);
  audit({ tool, repo_id: args.repo_id, paths: result.committed_paths, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked commit for ${result.committed_paths.length} paths.` : `Created local commit ${result.commit_sha}.`);
}

export const cleanupPathsHandler: ToolHandler = async (input, context) => safeTool<CleanupPathsInput>("repo_cleanup_paths", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new CleanupService(repo.root, new OperationsPolicy(repo.operations)).cleanup(args);
  audit({ tool: "repo_cleanup_paths", repo_id: args.repo_id, paths: result.deleted.map((entry) => entry.path), warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked cleanup for ${result.deleted.length} paths.` : `Cleaned up ${result.deleted.length} paths.`);
});

export const projectBriefHandler: ToolHandler = async (input, context) => safeTool<ProjectBriefInput>("repo_project_brief", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new ProjectBriefService(repo, sandbox).brief(args);
  audit({ tool: "repo_project_brief", repo_id: args.repo_id, counts: { docs: result.key_docs.length, scripts: result.scripts.length }, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned project brief for ${repo.display_name}.`);
});

export const taskInventoryHandler: ToolHandler = async (input, context) => safeTool<TaskInventoryInput>("repo_task_inventory", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new TaskInventoryService(repo.root, sandbox).inventory(args);
  audit({ tool: "repo_task_inventory", repo_id: args.repo_id, counts: { tasks: result.returned_count }, truncated: result.truncated, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.returned_count} task inventory items.`);
});

export const decisionMemoryHandler: ToolHandler = async (input, context) => safeTool<DecisionLogInput>("repo_decision_memory", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new DecisionLogService(repo.root, sandbox).decisionLog({
    include_sources: args.include_sources
  });
  audit({ tool: "repo_decision_memory", repo_id: args.repo_id, counts: { decisions: result.decisions.length, conventions: result.conventions.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.decisions.length} decisions and ${result.conventions.length} conventions.`);
});

export const changePlanHandler: ToolHandler = async (input, context) => safeTool<ChangePlanInput>("repo_change_plan", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new ChangePlanService(repo.root, sandbox).plan({
    goal: args.goal,
    include_globs: args.include_globs,
    max_files_to_inspect: args.max_files_to_inspect,
    planning_depth: args.planning_depth
  });
  audit({ tool: "repo_change_plan", repo_id: args.repo_id, counts: { relevant_files: result.relevant_files.length, steps: result.proposed_steps.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned change plan with ${result.proposed_steps.length} steps.`);
});

export const nextActionHandler: ToolHandler = async (input, context) => safeTool<NextActionInput>("repo_next_action", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const result = await new NextActionService(repo, sandbox).recommend({
    mode: args.mode,
    horizon: args.horizon
  });
  audit({ tool: "repo_next_action", repo_id: args.repo_id, counts: { actions: result.suggested_actions.length, blockers: result.blockers.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.recommendation);
});

export const planReviewHandler: ToolHandler = async (input) => {
  const args = z.object({ prompt: z.string().min(1) }).parse(input);
  const result = new ReviewPlanner().plan(args.prompt);
  return createSuccessEnvelope(result, `Recommended next tool: ${result.recommended_next_tools[0]}.`);
};

export const prepareCodexTaskHandler: ToolHandler = async (input, context) => safeTool<CodexTaskInput>("repo_prepare_codex_task", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = new CodexTaskService(repo.root, new PathSandbox(repo.root), new WritePolicy(repo.writes)).prepare(args);
  audit({ tool: "repo_prepare_codex_task", repo_id: args.repo_id, paths: [result.prompt_path, result.result_path], warnings: result.warnings });
  return createSuccessEnvelope(result, `Prepared Codex task ${result.run_id}.`);
});

export const writeCodexTaskHandler: ToolHandler = async (input, context) => safeTool<CodexTaskWriteInput>("repo_write_codex_task", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new CodexTaskService(repo.root, new PathSandbox(repo.root), new WritePolicy(repo.writes)).write(args);
  audit({ tool: "repo_write_codex_task", repo_id: args.repo_id, paths: result.written_paths, warnings: result.warnings });
  return createSuccessEnvelope(
    result,
    result.dry_run ? `Dry run checked Codex task ${result.run_id}.` : `Wrote Codex task ${result.run_id}.`,
    { warnings: result.warnings }
  );
});

export const codexReviewHandler: ToolHandler = async (input, context) => safeTool<CodexReviewInput>("repo_codex_review", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new CodexResultService(
    new PathSandbox(repo.root),
    new GitReviewService(repo.root, new OperationsPolicy(repo.operations))
  ).review(args);
  audit({
    tool: "repo_codex_review",
    repo_id: args.repo_id,
    paths: [result.result_path],
    counts: result.git_review ? { changed: result.git_review.changed_paths.length } : undefined,
    warnings: result.warnings
  });
  return createSuccessEnvelope(
    result,
    result.result_found ? `Reviewed Codex result ${result.run_id}.` : `Codex result missing for ${result.run_id}.`,
    { warnings: result.warnings }
  );
});

export const writeFileHandler: ToolHandler = async (input, context) => safeTool<WriteFileInput>("repo_write_file", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const headShaBefore = await readHeadSha(repo.root);
  const result = await new FileWriter(repo.root, sandbox, new WritePolicy(repo.writes)).write(args);
  if (!result.dry_run && result.changed) {
    context.cache.invalidate(`file:${args.repo_id}`);
    const headShaAfter = await readHeadSha(repo.root);
    const receipt = await new OperationReceiptService(repo.root).writeLastWrite({
      tool: "repo_write_file",
      repo_id: args.repo_id,
      ...(headShaBefore ? { head_sha_before: headShaBefore } : {}),
      ...(headShaAfter ? { head_sha_after: headShaAfter } : {}),
      touched_paths: [result.path],
      changed_paths: [result.path],
      created_paths: result.created ? [result.path] : [],
      modified_paths: result.created ? [] : [result.path],
      counts: {
        requested: 1,
        changed: 1,
        created: result.created ? 1 : 0,
        unchanged: 0
      },
      summary: result.summary
    });
    const resultWithReceipt = {
      ...result,
      warnings: [...result.warnings, ...receipt.warnings],
      ...(receipt.operation_receipt ? { operation_receipt: receipt.operation_receipt } : {})
    };
    audit({ tool: "repo_write_file", repo_id: args.repo_id, paths: [resultWithReceipt.path], counts: { bytes: resultWithReceipt.bytes_written }, warnings: resultWithReceipt.warnings });
    return createSuccessEnvelope(resultWithReceipt, resultWithReceipt.dry_run ? `Dry run checked write to ${resultWithReceipt.path}.` : `Wrote ${resultWithReceipt.path}.`, { warnings: resultWithReceipt.warnings });
  }
  audit({ tool: "repo_write_file", repo_id: args.repo_id, paths: [result.path], counts: { bytes: result.bytes_written }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked write to ${result.path}.` : `Wrote ${result.path}.`, { warnings: result.warnings });
});

export const writeChangesHandler: ToolHandler = async (input, context) => safeTool<WriteChangesInput>("repo_write_changes", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const sandbox = new PathSandbox(repo.root);
  const headShaBefore = await readHeadSha(repo.root);
  const result = await new WriteChangesService(repo.root, sandbox, new WritePolicy(repo.writes)).apply(args);
  if (!result.dry_run && result.changed_paths.length > 0) {
    context.cache.invalidate(`file:${args.repo_id}`);
    const headShaAfter = await readHeadSha(repo.root);
    const receipt = await new OperationReceiptService(repo.root).writeLastWrite({
      tool: "repo_write_changes",
      repo_id: args.repo_id,
      ...(headShaBefore ? { head_sha_before: headShaBefore } : {}),
      ...(headShaAfter ? { head_sha_after: headShaAfter } : {}),
      touched_paths: result.files.map((file) => file.path),
      changed_paths: result.changed_paths,
      created_paths: result.files.filter((file) => file.changed && file.created).map((file) => file.path),
      modified_paths: result.files.filter((file) => file.changed && !file.created).map((file) => file.path),
      counts: result.counts,
      summary: result.summary
    });
    const resultWithReceipt = {
      ...result,
      warnings: [...result.warnings, ...receipt.warnings],
      ...(receipt.operation_receipt ? { operation_receipt: receipt.operation_receipt } : {})
    };
    audit({ tool: "repo_write_changes", repo_id: args.repo_id, paths: resultWithReceipt.changed_paths, counts: resultWithReceipt.counts, warnings: resultWithReceipt.warnings });
    return createSuccessEnvelope(resultWithReceipt, resultWithReceipt.dry_run ? `Dry run checked ${resultWithReceipt.files.length} changes.` : resultWithReceipt.summary, { warnings: resultWithReceipt.warnings });
  }
  audit({ tool: "repo_write_changes", repo_id: args.repo_id, paths: result.changed_paths, counts: result.counts, warnings: result.warnings });
  return createSuccessEnvelope(result, result.dry_run ? `Dry run checked ${result.files.length} changes.` : result.summary, { warnings: result.warnings });
});

export const writeHandoffHandler: ToolHandler = async (input, context) => safeTool<HandoffInput>("repo_write_handoff", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new HandoffService(
    repo.root,
    new PathSandbox(repo.root),
    new WritePolicy(repo.writes),
    new GitService(repo.root)
  ).write(args);
  audit({
    tool: "repo_write_handoff",
    repo_id: args.repo_id,
    paths: result.current_path ? [result.handoff_path, result.current_path] : [result.handoff_path],
    warnings: result.warnings
  });
  return createSuccessEnvelope(
    result,
    result.dry_run ? `Dry run checked handoff ${result.handoff_path}.` : `Wrote handoff ${result.handoff_path}.`,
    { warnings: result.warnings }
  );
});

export const listHandoffsHandler: ToolHandler = async (input, context) => safeTool<HandoffListInput>("repo_handoff_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const handoffDir = `${repo.root}/.chatgpt/handoffs`;
  const handoffs: Array<{ path: string; title: string; branch?: string; head_sha?: string; created_at?: string }> = [];
  let total = 0;
  try {
    const entries = await readdir(handoffDir);
    for (const entry of entries) {
      if (!entry.endsWith(".local.md") || entry === "current.local.md") continue;
      total++;
      const content = await readFile(`${handoffDir}/${entry}`, "utf8").catch(() => "");
      const titleMatch = content.match(/^# (.+)$/m);
      const branchMatch = content.match(/^- Branch: (.+)$/m);
      const shaMatch = content.match(/^- Head: ([0-9a-f]+)$/m);
      const dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})-(\d{4})/);
      handoffs.push({
        path: `.chatgpt/handoffs/${entry}`,
        title: titleMatch?.[1] ?? entry,
        branch: branchMatch?.[1],
        head_sha: shaMatch?.[1],
        created_at: dateMatch ? `${dateMatch[1]}T${dateMatch[2].slice(0, 2)}:${dateMatch[2].slice(2)}` : undefined
      });
    }
  } catch {
    // directory may not exist yet
  }
  handoffs.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const maxResults = args.max_results ?? 20;
  const truncated = total > maxResults;
  const result: HandoffListResult = {
    handoffs: handoffs.slice(0, maxResults),
    current_path: await readCurrentPointer(repo.root),
    total,
    truncated
  };
  audit({ tool: "repo_handoff_list", repo_id: args.repo_id, counts: { handoffs: result.handoffs.length, total }, warnings: [] });
  return createSuccessEnvelope(result, `Found ${result.handoffs.length} handoff(s)${truncated ? ` (truncated from ${total})` : ""}.`);
});

async function readCurrentPointer(root: string): Promise<string | undefined> {
  try {
    const content = await readFile(`${root}/.chatgpt/handoffs/current.local.md`, "utf8");
    const match = content.match(/^- Handoff: (.+)$/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export const actionListHandler: ToolHandler = async (input, context) => safeTool<ActionListInput>("repo_action_list", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = service.list();
  audit({ tool: "repo_action_list", repo_id: args.repo_id, counts: { actions: result.actions.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Listed ${result.actions.length} configured actions.`);
});

export const actionDescribeHandler: ToolHandler = async (input, context) => safeTool<ActionDescribeInput>("repo_action_describe", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = service.describe(args);
  audit({ tool: "repo_action_describe", repo_id: args.repo_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Described action: ${result.name}.`);
});

export const actionRunHandler: ToolHandler = async (input, context) => safeTool<ActionRunInput>("repo_action_run", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = await service.run(args);
  audit({ tool: "repo_action_run", repo_id: args.repo_id, run_id: result.run_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Action ${result.action} finished with status ${result.status}.`);
});

export const actionStatusHandler: ToolHandler = async (input, context) => safeTool<ActionStatusInput>("repo_action_status", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = await service.status(args);
  audit({ tool: "repo_action_status", repo_id: args.repo_id, run_id: result.run_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Action ${result.action} is ${result.status}.`);
});

export const actionLogsHandler: ToolHandler = async (input, context) => safeTool<ActionLogsInput>("repo_action_logs", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = await service.logs(args);
  audit({ tool: "repo_action_logs", repo_id: args.repo_id, run_id: result.run_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Retrieved logs for run ${result.run_id}.`);
});

export const actionCancelHandler: ToolHandler = async (input, context) => safeTool<ActionCancelInput>("repo_action_cancel", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = await service.cancel(args);
  audit({ tool: "repo_action_cancel", repo_id: args.repo_id, run_id: result.run_id, warnings: result.warnings });
  return createSuccessEnvelope(result, `Action ${result.action} cancelled.`);
});

export const actionRecentHandler: ToolHandler = async (input, context) => safeTool<ActionRecentInput>("repo_action_recent", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new ActionService(repo.root, repo.actions);
  const result = await service.recent(args);
  audit({ tool: "repo_action_recent", repo_id: args.repo_id, counts: { runs: result.count }, warnings: result.warnings });
  return createSuccessEnvelope(result, `Returned ${result.count} recent action runs.`);
});

export const createFilesHandler: ToolHandler = async (input, context) => safeTool<CreateFilesInput>("repo_create_files", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new FileCreateService(repo.root);
  const result = await service.createFiles(args);
  audit({ tool: "repo_create_files", repo_id: args.repo_id, paths: result.created_files.map(f => f.path), counts: { created: result.created_files.length, skipped: result.skipped.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.status === "previewed" ? `Previewed creation of ${result.skipped.length} files.` : `Created ${result.created_files.length} files.`);
});

export const applyPatchHandler: ToolHandler = async (input, context) => safeTool<ApplyPatchInput>("repo_apply_patch", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const service = new PatchService(repo.root);
  const result = await service.applyPatch(args);
  audit({ tool: "repo_apply_patch", repo_id: args.repo_id, paths: result.applied_files.map(f => f.path), counts: { applied: result.applied_files.length }, warnings: result.warnings });
  return createSuccessEnvelope(result, result.status === "previewed" ? "Previewed patch application." : `Applied patch to ${result.applied_files.length} files.`);
});

async function safeTool<TInput extends Record<string, unknown>>(
  tool: string,
  input: unknown,
  context: RuntimeContext,
  run: (args: TInput) => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await run(input as TInput);
  } catch (error) {
    audit({ tool, repo_id: typeof input === "object" && input && "repo_id" in input ? String(input.repo_id) : undefined, warnings: [toRepoReaderError(error).code] });
    return createErrorEnvelope(toRepoReaderError(error));
  }
}

async function readHeadSha(root: string): Promise<string | undefined> {
  try {
    return (await new GitService(root).status()).head_sha;
  } catch {
    return undefined;
  }
}

export const manifestHandler: ToolHandler = async (input, context) => safeTool<ManifestInput>("repo_manifest", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const tools = toolCatalog.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    effect: t.effect,
    readonly: t.annotations.readOnlyHint ?? true
  }));
  const result: ManifestResult = {
    profile: context.toolProfile,
    tool_count: tools.length,
    tools,
    policies: {
      writes_enabled: repo.writes?.enabled ?? false,
      operations_enabled: repo.operations?.enabled ?? false,
      actions_enabled: repo.actions?.enabled ?? false
    }
  };
  audit({ tool: "repo_manifest", repo_id: args.repo_id, counts: { tools: result.tool_count } });
  return createSuccessEnvelope(result, `Manifest: ${result.tool_count} tools (${result.profile} profile).`);
});

export const releaseNotesHandler: ToolHandler = async (input, context) => safeTool<ReleaseNotesInput>("repo_release_notes", input, context, async (args) => {
  const repo = context.registry.get(args.repo_id);
  const result = await new ReleaseNotesService(repo.root).generate(args);
  audit({ tool: "repo_release_notes", repo_id: args.repo_id, counts: { commits: result.commit_count } });
  return createSuccessEnvelope(result, `Release notes: ${result.commit_count} commits from ${result.from} to ${result.to}.`);
});
