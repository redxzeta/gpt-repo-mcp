import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const ManifestInputSchema = RepoInputSchema;

export const ManifestResultSchema = z.object({
  profile: z.string().describe("Active tool profile (core or full)."),
  tool_count: z.number().int().describe("Number of tools registered."),
  tools: z.array(z.object({
    name: z.string(),
    title: z.string(),
    description: z.string(),
    effect: z.string(),
    readonly: z.boolean()
  })).describe("Registered tools."),
  policies: z.object({
    writes_enabled: z.boolean(),
    operations_enabled: z.boolean(),
    actions_enabled: z.boolean(),
    github: z.object({
      issues_read: z.boolean(),
      issues_create: z.boolean(),
      issues_edit: z.boolean(),
      issues_delete: z.boolean(),
      issues_comment: z.boolean(),
      labels_read: z.boolean(),
      labels_create: z.boolean()
    }).optional()
  }).describe("Active per-repo policies.")
});

export type ManifestInput = z.infer<typeof ManifestInputSchema>;
export type ManifestResult = z.infer<typeof ManifestResultSchema>;
