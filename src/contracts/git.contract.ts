import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const GitStatusInputSchema = RepoInputSchema;

export const GitDiffInputSchema = RepoInputSchema.extend({
  base: z.string().optional().describe("Second-pass refinement for comparing from a specific base ref. Omit on the first diff call."),
  compare: z.string().optional().describe("Second-pass refinement for comparing to a specific ref. Omit on the first diff call."),
  staged: z.boolean().optional().describe("Second-pass refinement to focus on staged changes only. Omit on the first diff call."),
  unstaged: z.boolean().optional().describe("Second-pass refinement to focus on unstaged changes only. Omit on the first diff call."),
  paths: z.array(z.string()).optional().describe("Second-pass refinement for explicit repo-relative paths. Omit on the first diff call unless the user asks for specific paths."),
  max_bytes: z.number().int().positive().optional().describe("Second-pass refinement for output size when the default diff is truncated or too broad. Omit on the first diff call."),
  context_lines: z.number().int().min(0).max(20).optional().describe("Second-pass refinement for hunk context when the default diff needs more or less context. Omit on the first diff call.")
});

export const GitStatusResultSchema = z.object({
  branch: z.string(),
  head_sha: z.string(),
  clean: z.boolean(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  files: z.array(z.object({
    path: z.string(),
    original_path: z.string().optional(),
    index: z.string(),
    worktree: z.string()
  }))
});

export const GitDiffResultSchema = z.object({
  base: z.string().optional(),
  compare: z.string().optional(),
  staged: z.boolean().optional(),
  unstaged: z.boolean().optional(),
  files: z.array(z.object({
    path: z.string(),
    original_path: z.string().optional(),
    status: z.string().optional(),
    hunks: z.array(z.string())
  })),
  truncated: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const GitLogInputSchema = RepoInputSchema.extend({
  ref: z.string().optional().describe("Optional ref, branch, or range to log (e.g. main, HEAD~5..HEAD)."),
  paths: z.array(z.string()).optional().describe("Optional repo-relative paths to filter log."),
  max_count: z.number().int().positive().optional().describe("Maximum commits to return. Defaults to 20, max 100."),
  max_bytes: z.number().int().positive().optional().describe("Output size limit.")
});

export const GitLogResultSchema = z.object({
  entries: z.array(z.object({
    sha: z.string(),
    short_sha: z.string(),
    author: z.string(),
    date: z.string(),
    subject: z.string()
  })),
  truncated: z.boolean(),
  total: z.number().int()
});

export const GitShowInputSchema = RepoInputSchema.extend({
  commit_sha: z.string().min(1).describe("Full or short commit SHA to inspect."),
  max_bytes: z.number().int().positive().optional().describe("Output size limit.")
});

export const GitShowResultSchema = z.object({
  sha: z.string(),
  content: z.string(),
  truncated: z.boolean()
});

export const GitBlameInputSchema = RepoInputSchema.extend({
  path: z.string().min(1).describe("Repo-relative file path to blame."),
  ref: z.string().optional().describe("Optional ref or branch to blame against."),
  max_bytes: z.number().int().positive().optional().describe("Output size limit.")
});

export const GitBlameResultSchema = z.object({
  file: z.string(),
  lines: z.array(z.object({
    line: z.number().int(),
    sha: z.string(),
    author: z.string(),
    date: z.string(),
    content: z.string()
  })),
  truncated: z.boolean(),
  total: z.number().int()
});

export const GitBranchesInputSchema = RepoInputSchema.extend({
  include_remotes: z.boolean().optional().describe("Include remote-tracking branches. Defaults to false."),
  max_count: z.number().int().positive().optional().describe("Maximum branches to return. Defaults to 50.")
});

export const GitBranchesResultSchema = z.object({
  branches: z.array(z.object({
    name: z.string(),
    current: z.boolean(),
    remote: z.string().optional()
  })),
  total: z.number().int(),
  truncated: z.boolean()
});
