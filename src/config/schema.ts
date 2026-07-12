import { z } from "zod";
import { DEFAULT_OPERATIONS_POLICY } from "../policies/operations-defaults.js";
import { DEFAULT_WRITE_POLICY } from "../policies/write-defaults.js";

const PositiveIntSchema = z.number().int().positive();

export const WritePolicyConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WRITE_POLICY.enabled),
  allowed_globs: z.array(z.string()).default(DEFAULT_WRITE_POLICY.allowed_globs),
  denied_globs: z.array(z.string()).default(DEFAULT_WRITE_POLICY.denied_globs),
  max_bytes_per_write: PositiveIntSchema.default(DEFAULT_WRITE_POLICY.max_bytes_per_write)
}).passthrough();

export const OperationsPolicyConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_OPERATIONS_POLICY.enabled),
  git_stage_enabled: z.boolean().default(DEFAULT_OPERATIONS_POLICY.git_stage_enabled),
  git_commit_enabled: z.boolean().default(DEFAULT_OPERATIONS_POLICY.git_commit_enabled),
  max_paths_per_operation: PositiveIntSchema.default(DEFAULT_OPERATIONS_POLICY.max_paths_per_operation),
  cleanup_enabled: z.boolean().default(DEFAULT_OPERATIONS_POLICY.cleanup_enabled),
  cleanup_allowed_globs: z.array(z.string()).default(DEFAULT_OPERATIONS_POLICY.cleanup_allowed_globs)
}).passthrough();

export const ActionDefinitionSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute."),
  args: z.array(z.string()).default([]).describe("Arguments to pass to the command."),
  timeout_ms: z.number().int().positive().default(120000).describe("Execution timeout in milliseconds."),
  mutates_files: z.boolean().default(false).describe("Whether this action may mutate files.")
}).passthrough();

export const ActionsConfigSchema = z.object({
  enabled: z.boolean().default(false).describe("Enable action execution tools."),
  max_concurrent: z.number().int().positive().default(2).describe("Maximum concurrent action runs."),
  definitions: z.record(z.string(), ActionDefinitionSchema).default({}).describe("Named action definitions.")
}).passthrough();

export const RepoConfigSchema = z.object({
  repo_id: z.string().min(1),
  display_name: z.string().min(1),
  root: z.string().min(1),
  allow_non_git: z.boolean().optional(),
  writes: WritePolicyConfigSchema.default(DEFAULT_WRITE_POLICY),
  operations: OperationsPolicyConfigSchema.default(DEFAULT_OPERATIONS_POLICY),
  actions: ActionsConfigSchema.optional()
}).passthrough();

export const LimitsConfigSchema = z.object({
  max_files: PositiveIntSchema.optional(),
  max_bytes_per_file: PositiveIntSchema.optional(),
  max_total_bytes: PositiveIntSchema.optional(),
  max_search_results: PositiveIntSchema.optional(),
  max_tree_entries: PositiveIntSchema.optional(),
  max_task_inventory_files: PositiveIntSchema.optional(),
  max_task_inventory_tree_pages: PositiveIntSchema.optional(),
  max_task_inventory_file_bytes: PositiveIntSchema.optional(),
  max_project_brief_doc_bytes: PositiveIntSchema.optional(),
  max_depth: PositiveIntSchema.optional(),
  max_diff_bytes: PositiveIntSchema.optional(),
  max_decision_log_source_bytes: PositiveIntSchema.optional(),
  max_decision_log_sources: PositiveIntSchema.optional(),
  max_change_plan_files: PositiveIntSchema.optional(),
  max_change_plan_tree_pages: PositiveIntSchema.optional()
}).passthrough();

export const RepoReaderConfigSchema = z.object({
  repos: z.array(RepoConfigSchema).default([]),
  limits: LimitsConfigSchema.default({}),
  tool_profile: z.enum(["core", "full"]).default("core").describe("Tool profile: 'core' (~30 tools) or 'full' (all tools).")
}).passthrough();

export type WritePolicyConfigDocument = z.input<typeof WritePolicyConfigSchema>;
export type OperationsPolicyConfigDocument = z.input<typeof OperationsPolicyConfigSchema>;
export type ActionsConfigDocument = z.input<typeof ActionsConfigSchema>;
export type RepoConfig = {
  repo_id: string;
  display_name: string;
  root: string;
  allow_non_git?: boolean;
  writes?: WritePolicyConfigDocument;
  operations?: OperationsPolicyConfigDocument;
  actions?: ActionsConfigDocument;
};
export type RepoReaderConfig = {
  repos: RepoConfig[];
  limits: z.input<typeof LimitsConfigSchema>;
  tool_profile: "core" | "full";
};
