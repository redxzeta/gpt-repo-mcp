import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const GitHubIssueStateSchema = z.enum(["open", "closed", "all"]);

export const GitHubIssuesInputSchema = RepoInputSchema.extend({
  state: GitHubIssueStateSchema.default("open").describe("Issue state to return."),
  labels: z.array(z.string().min(1)).max(20).optional().describe("Labels that returned issues must have."),
  query: z.string().min(1).max(200).optional().describe("Optional GitHub issue search query."),
  max_results: z.number().int().positive().max(100).optional().describe("Maximum issues to return.")
});

export const GitHubIssuesResultSchema = z.object({
  repository: z.string().optional(),
  issues: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    labels: z.array(z.string()),
    author: z.string().optional(),
    updated_at: z.string().optional(),
    url: z.string(),
    body_excerpt: z.string().optional()
  })),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const GitHubIssueCreateInputSchema = RepoInputSchema.extend({
  title: z.string().min(1).max(256).describe("Issue title."),
  body: z.string().min(1).max(20000).optional().describe("Optional issue body."),
  labels: z.array(z.string().min(1)).max(20).optional().describe("Optional labels to add."),
  assignees: z.array(z.string().min(1)).max(10).optional().describe("Optional assignee logins."),
  milestone: z.string().min(1).max(200).optional().describe("Optional milestone name."),
  dry_run: z.boolean().default(false).describe("Preview the create command without creating the issue.")
});

export const GitHubIssueCreateResultSchema = z.object({
  repository: z.string().optional(),
  issue_number: z.number().int().positive().optional(),
  title: z.string(),
  url: z.string().optional(),
  dry_run: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const GitHubIssueCommentInputSchema = RepoInputSchema.extend({
  issue_number: z.number().int().positive().describe("Issue number to comment on."),
  body: z.string().min(1).max(20000).describe("Comment body."),
  dry_run: z.boolean().default(false).describe("Preview the comment command without posting.")
});

export const GitHubPullRequestCommentInputSchema = RepoInputSchema.extend({
  pr_number: z.number().int().positive().describe("Pull request number to comment on."),
  body: z.string().min(1).max(20000).describe("Comment body."),
  dry_run: z.boolean().default(false).describe("Preview the comment command without posting.")
});

export const GitHubCommentResultSchema = z.object({
  repository: z.string().optional(),
  dry_run: z.boolean(),
  target_number: z.number().int().positive().optional(),
  warnings: z.array(z.string()).default([])
});

export const GitHubIssueReadInputSchema = RepoInputSchema.extend({
  issue_number: z.number().int().positive().describe("Issue number to read.")
}).describe("Read full details of a GitHub issue.");

export const GitHubIssueReadResultSchema = z.object({
  repository: z.string().optional(),
  number: z.number().int().positive().describe("Issue number."),
  title: z.string().describe("Issue title."),
  state: z.string().describe("Issue state."),
  body: z.string().optional().describe("Issue body."),
  labels: z.array(z.string()).describe("Issue labels."),
  assignees: z.array(z.string()).describe("Issue assignees."),
  milestone: z.string().optional().describe("Issue milestone."),
  url: z.string().describe("Issue URL."),
  comments_count: z.number().int().nonnegative().describe("Number of comments."),
  warnings: z.array(z.string()).default([])
});

export const GitHubPrListInputSchema = RepoInputSchema.extend({
  state: z.enum(["open", "closed", "all"]).default("open").describe("PR state to return."),
  max_results: z.number().int().positive().max(100).default(25).describe("Maximum PRs to return.")
}).describe("List pull requests for a repository.");

export const GitHubPrListResultSchema = z.object({
  repository: z.string().optional(),
  prs: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    author: z.string().optional(),
    head: z.string().describe("Head branch."),
    base: z.string().describe("Base branch."),
    mergeable: z.string().optional().describe("Mergeable state."),
    url: z.string()
  })),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const GitHubPrReadInputSchema = RepoInputSchema.extend({
  pr_number: z.number().int().positive().describe("Pull request number to read.")
}).describe("Read full details of a GitHub pull request.");

export const GitHubPrReadResultSchema = z.object({
  repository: z.string().optional(),
  number: z.number().int().positive().describe("PR number."),
  title: z.string().describe("PR title."),
  state: z.string().describe("PR state."),
  body: z.string().optional().describe("PR body."),
  author: z.string().optional().describe("PR author."),
  head: z.string().describe("Head branch."),
  base: z.string().describe("Base branch."),
  mergeable: z.string().optional().describe("Mergeable state."),
  url: z.string().describe("PR URL."),
  labels: z.array(z.string()).describe("PR labels."),
  reviewers: z.array(z.string()).describe("PR reviewers."),
  warnings: z.array(z.string()).default([])
});

export const GitHubPrCreateInputSchema = RepoInputSchema.extend({
  title: z.string().min(1).max(256).describe("PR title."),
  body: z.string().min(1).max(20000).optional().describe("Optional PR body."),
  head: z.string().min(1).describe("Head branch name."),
  base: z.string().min(1).describe("Base branch name."),
  draft: z.boolean().default(false).describe("Create as draft PR."),
  labels: z.array(z.string().min(1)).max(20).optional().describe("Optional labels to add."),
  assignees: z.array(z.string().min(1)).max(10).optional().describe("Optional assignee logins."),
  reviewers: z.array(z.string().min(1)).max(10).optional().describe("Optional reviewer logins."),
  dry_run: z.boolean().default(false).describe("Preview the create command without creating the PR.")
}).describe("Create a GitHub pull request.");

export const GitHubPrCreateResultSchema = z.object({
  repository: z.string().optional(),
  pr_number: z.number().int().positive().optional(),
  url: z.string().optional(),
  status: z.enum(["previewed", "created", "failed"]).describe("Operation status."),
  dry_run: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const GitHubPrChecksInputSchema = RepoInputSchema.extend({
  pr_number: z.number().int().positive().describe("Pull request number to check.")
}).describe("Get CI check status for a pull request.");

export const GitHubPrChecksResultSchema = z.object({
  repository: z.string().optional(),
  checks: z.array(z.object({
    name: z.string().describe("Check name."),
    status: z.string().describe("Check status."),
    conclusion: z.string().optional().describe("Check conclusion."),
    url: z.string().optional().describe("Check URL.")
  })),
  overall_status: z.string().describe("Overall CI status."),
  warnings: z.array(z.string()).default([])
});

export type GitHubIssuesInput = z.infer<typeof GitHubIssuesInputSchema>;
export type GitHubIssueCreateInput = z.infer<typeof GitHubIssueCreateInputSchema>;
export type GitHubIssueCommentInput = z.infer<typeof GitHubIssueCommentInputSchema>;
export type GitHubPullRequestCommentInput = z.infer<typeof GitHubPullRequestCommentInputSchema>;
export type GitHubIssueReadInput = z.infer<typeof GitHubIssueReadInputSchema>;
export type GitHubPrListInput = z.infer<typeof GitHubPrListInputSchema>;
export type GitHubPrReadInput = z.infer<typeof GitHubPrReadInputSchema>;
export type GitHubPrCreateInput = z.infer<typeof GitHubPrCreateInputSchema>;
export type GitHubPrChecksInput = z.infer<typeof GitHubPrChecksInputSchema>;

// --- Project Schemas ---

export const GitHubProjectListInputSchema = RepoInputSchema.extend({
  state: z.enum(["open", "closed", "all"]).default("open").describe("Project state to return."),
  max_results: z.number().int().positive().max(100).default(25).describe("Maximum projects to return.")
}).describe("List GitHub projects for the repository owner.");

export const GitHubProjectListResultSchema = z.object({
  repository: z.string().optional(),
  owner: z.string().optional(),
  projects: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    url: z.string()
  })),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const GitHubProjectReadInputSchema = RepoInputSchema.extend({
  project_number: z.number().int().positive().describe("Project number to read.")
}).describe("Read full details of a GitHub project.");

export const GitHubProjectReadResultSchema = z.object({
  repository: z.string().optional(),
  owner: z.string().optional(),
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  description: z.string().optional(),
  url: z.string(),
  closed: z.boolean(),
  public: z.boolean(),
  short_description: z.string().optional(),
  warning: z.string().optional(),
  warnings: z.array(z.string()).default([])
});

export const GitHubProjectCreateInputSchema = RepoInputSchema.extend({
  title: z.string().min(1).max(256).describe("Project title."),
  body: z.string().min(1).max(20000).optional().describe("Optional project description."),
  private: z.boolean().default(false).describe("Create as private project."),
  dry_run: z.boolean().default(false).describe("Preview the create command without creating the project.")
}).describe("Create a GitHub project for the repository owner.");

export const GitHubProjectCreateResultSchema = z.object({
  repository: z.string().optional(),
  owner: z.string().optional(),
  project_number: z.number().int().positive().optional(),
  url: z.string().optional(),
  title: z.string(),
  dry_run: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const GitHubProjectItemListInputSchema = RepoInputSchema.extend({
  project_number: z.number().int().positive().describe("Project number to list items from."),
  max_results: z.number().int().positive().max(100).default(25).describe("Maximum items to return.")
}).describe("List items in a GitHub project.");

export const GitHubProjectItemListResultSchema = z.object({
  repository: z.string().optional(),
  owner: z.string().optional(),
  project_number: z.number().int().positive(),
  items: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string().optional(),
    url: z.string().optional()
  })),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const GitHubProjectItemAddInputSchema = RepoInputSchema.extend({
  project_number: z.number().int().positive().describe("Project number to add item to."),
  url: z.string().min(1).describe("URL of the issue or PR to add to the project."),
  dry_run: z.boolean().default(false).describe("Preview the add command without adding.")
}).describe("Add an issue or pull request to a GitHub project.");

export const GitHubProjectItemAddResultSchema = z.object({
  repository: z.string().optional(),
  owner: z.string().optional(),
  project_number: z.number().int().positive(),
  item_url: z.string(),
  dry_run: z.boolean(),
  warnings: z.array(z.string()).default([])
});

// --- Milestone Schemas ---

export const GitHubMilestoneListInputSchema = RepoInputSchema.extend({
  state: z.enum(["open", "closed", "all"]).default("open").describe("Milestone state to return."),
  max_results: z.number().int().positive().max(100).default(25).describe("Maximum milestones to return.")
}).describe("List GitHub milestones for a repository.");

export const GitHubMilestoneListResultSchema = z.object({
  repository: z.string().optional(),
  milestones: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    description: z.string().optional(),
    due_on: z.string().optional(),
    open_issues: z.number().int().nonnegative(),
    closed_issues: z.number().int().nonnegative(),
    url: z.string()
  })),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const GitHubMilestoneReadInputSchema = RepoInputSchema.extend({
  milestone_number: z.number().int().positive().describe("Milestone number to read.")
}).describe("Read full details of a GitHub milestone.");

export const GitHubMilestoneReadResultSchema = z.object({
  repository: z.string().optional(),
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  description: z.string().optional(),
  due_on: z.string().optional(),
  open_issues: z.number().int().nonnegative(),
  closed_issues: z.number().int().nonnegative(),
  url: z.string(),
  warnings: z.array(z.string()).default([])
});

export const GitHubMilestoneCreateInputSchema = RepoInputSchema.extend({
  title: z.string().min(1).max(256).describe("Milestone title."),
  description: z.string().min(1).max(20000).optional().describe("Optional milestone description."),
  due_on: z.string().optional().describe("Optional due date in ISO 8601 format."),
  dry_run: z.boolean().default(false).describe("Preview the create command without creating the milestone.")
}).describe("Create a GitHub milestone for a repository.");

export const GitHubMilestoneCreateResultSchema = z.object({
  repository: z.string().optional(),
  milestone_number: z.number().int().positive().optional(),
  url: z.string().optional(),
  title: z.string(),
  dry_run: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export type GitHubProjectListInput = z.infer<typeof GitHubProjectListInputSchema>;
export type GitHubProjectReadInput = z.infer<typeof GitHubProjectReadInputSchema>;
export type GitHubProjectCreateInput = z.infer<typeof GitHubProjectCreateInputSchema>;
export type GitHubProjectItemListInput = z.infer<typeof GitHubProjectItemListInputSchema>;
export type GitHubProjectItemAddInput = z.infer<typeof GitHubProjectItemAddInputSchema>;
export type GitHubMilestoneListInput = z.infer<typeof GitHubMilestoneListInputSchema>;
export type GitHubMilestoneReadInput = z.infer<typeof GitHubMilestoneReadInputSchema>;
export type GitHubMilestoneCreateInput = z.infer<typeof GitHubMilestoneCreateInputSchema>;
