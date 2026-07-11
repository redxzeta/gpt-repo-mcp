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

export type GitHubIssuesInput = z.infer<typeof GitHubIssuesInputSchema>;
export type GitHubIssueCreateInput = z.infer<typeof GitHubIssueCreateInputSchema>;
export type GitHubIssueCommentInput = z.infer<typeof GitHubIssueCommentInputSchema>;
export type GitHubPullRequestCommentInput = z.infer<typeof GitHubPullRequestCommentInputSchema>;
