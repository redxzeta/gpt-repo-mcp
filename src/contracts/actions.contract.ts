import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const ActionListInputSchema = RepoInputSchema.describe("List configured actions for a repository.");

export const ActionDefinitionSchema = z.object({
  name: z.string().describe("Action name."),
  command: z.string().describe("Shell command to execute."),
  args: z.array(z.string()).describe("Arguments to pass to the command."),
  timeout_ms: z.number().int().positive().describe("Execution timeout in milliseconds."),
  mutates_files: z.boolean().describe("Whether this action may mutate files.")
});

export const ActionListResultSchema = z.object({
  actions: z.array(ActionDefinitionSchema).describe("Configured actions."),
  enabled: z.boolean().describe("Whether actions are enabled."),
  warnings: z.array(z.string()).default([])
});

export const ActionDescribeInputSchema = RepoInputSchema.extend({
  name: z.string().min(1).describe("Action name to describe.")
}).describe("Get detailed definition of a configured action.");

export const ActionDescribeResultSchema = z.object({
  name: z.string().describe("Action name."),
  command: z.string().describe("Shell command to execute."),
  args: z.array(z.string()).describe("Arguments to pass to the command."),
  timeout_ms: z.number().int().positive().describe("Execution timeout in milliseconds."),
  mutates_files: z.boolean().describe("Whether this action may mutate files."),
  warnings: z.array(z.string()).default([])
});

export const GitStatusSummarySchema = z.object({
  branch: z.string().describe("Current branch name."),
  head_sha: z.string().describe("Current HEAD SHA."),
  clean: z.boolean().describe("Whether the worktree is clean."),
  file_count: z.number().int().nonnegative().describe("Number of changed files.")
});

export const ActionRunInputSchema = RepoInputSchema.extend({
  name: z.string().min(1).describe("Action name to run."),
  reason: z.string().max(500).optional().describe("Optional reason for running the action.")
}).describe("Execute a configured action synchronously.");

export const ActionRunResultSchema = z.object({
  run_id: z.string().describe("Unique run identifier."),
  action: z.string().describe("Action name."),
  status: z.enum(["queued", "running", "completed", "failed", "timed_out", "cancelled"]).describe("Run status."),
  exit_code: z.number().int().optional().describe("Process exit code if completed."),
  started_at: z.string().describe("ISO timestamp when run started."),
  completed_at: z.string().optional().describe("ISO timestamp when run completed."),
  duration_ms: z.number().int().nonnegative().optional().describe("Execution duration in milliseconds."),
  stdout_excerpt: z.string().optional().describe("Bounded stdout excerpt."),
  stderr_excerpt: z.string().optional().describe("Bounded stderr excerpt."),
  output_truncated: z.boolean().describe("Whether output was truncated."),
  worktree_before: GitStatusSummarySchema.describe("Worktree state before execution."),
  worktree_after: GitStatusSummarySchema.optional().describe("Worktree state after execution."),
  changed_paths: z.array(z.string()).optional().describe("Paths changed during execution."),
  warnings: z.array(z.string()).default([])
});

export const ActionStatusInputSchema = RepoInputSchema.extend({
  run_id: z.string().min(1).describe("Run identifier to check.")
}).describe("Read status of a previous action run.");

export const ActionStatusResultSchema = z.object({
  run_id: z.string().describe("Run identifier."),
  action: z.string().describe("Action name."),
  status: z.enum(["queued", "running", "completed", "failed", "timed_out", "cancelled"]).describe("Run status."),
  exit_code: z.number().int().optional().describe("Process exit code if completed."),
  started_at: z.string().describe("ISO timestamp when run started."),
  completed_at: z.string().optional().describe("ISO timestamp when run completed."),
  duration_ms: z.number().int().nonnegative().optional().describe("Execution duration in milliseconds."),
  stdout_excerpt: z.string().optional().describe("Bounded stdout excerpt."),
  stderr_excerpt: z.string().optional().describe("Bounded stderr excerpt."),
  output_truncated: z.boolean().describe("Whether output was truncated."),
  worktree_before: GitStatusSummarySchema.describe("Worktree state before execution."),
  worktree_after: GitStatusSummarySchema.optional().describe("Worktree state after execution."),
  changed_paths: z.array(z.string()).optional().describe("Paths changed during execution."),
  warnings: z.array(z.string()).default([])
});

export const ActionLogsInputSchema = RepoInputSchema.extend({
  run_id: z.string().min(1).describe("Run identifier to get logs for."),
  max_bytes: z.number().int().positive().default(65536).describe("Maximum bytes per log stream.")
}).describe("Get bounded stdout/stderr excerpts from an action run.");

export const ActionLogsResultSchema = z.object({
  run_id: z.string().describe("Run identifier."),
  stdout: z.string().describe("Stdout excerpt."),
  stderr: z.string().describe("Stderr excerpt."),
  stdout_truncated: z.boolean().describe("Whether stdout was truncated."),
  stderr_truncated: z.boolean().describe("Whether stderr was truncated."),
  warnings: z.array(z.string()).default([])
});

export const ActionCancelInputSchema = RepoInputSchema.extend({
  run_id: z.string().min(1).describe("Run identifier to cancel.")
}).describe("Cancel a running action.");

export const ActionCancelResultSchema = z.object({
  run_id: z.string().describe("Run identifier."),
  action: z.string().describe("Action name."),
  status: z.enum(["cancelled"]).describe("Run status after cancellation."),
  warnings: z.array(z.string()).default([])
});

export const ActionRecentInputSchema = RepoInputSchema.extend({
  max_results: z.number().int().positive().max(20).default(20).describe("Maximum recent runs to return.")
}).describe("List recent action runs.");

export const ActionRecentResultSchema = z.object({
  runs: z.array(z.object({
    run_id: z.string().describe("Run identifier."),
    action: z.string().describe("Action name."),
    status: z.enum(["queued", "running", "completed", "failed", "timed_out", "cancelled"]).describe("Run status."),
    started_at: z.string().describe("ISO timestamp when run started."),
    completed_at: z.string().optional().describe("ISO timestamp when run completed."),
    duration_ms: z.number().int().nonnegative().optional().describe("Execution duration in milliseconds.")
  })).describe("Recent run summaries."),
  count: z.number().int().nonnegative().describe("Number of runs returned."),
  warnings: z.array(z.string()).default([])
});

export type ActionListInput = z.infer<typeof ActionListInputSchema>;
export type ActionDescribeInput = z.infer<typeof ActionDescribeInputSchema>;
export type ActionRunInput = z.infer<typeof ActionRunInputSchema>;
export type ActionStatusInput = z.infer<typeof ActionStatusInputSchema>;
export type ActionLogsInput = z.infer<typeof ActionLogsInputSchema>;
export type ActionCancelInput = z.infer<typeof ActionCancelInputSchema>;
export type ActionRecentInput = z.infer<typeof ActionRecentInputSchema>;
