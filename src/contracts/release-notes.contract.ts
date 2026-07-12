import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const ReleaseNotesInputSchema = RepoInputSchema.extend({
  from_ref: z.string().optional().describe("Start ref for the range (tag, commit, or branch). Omit to use the latest tag."),
  to_ref: z.string().optional().describe("End ref for the range (tag, commit, or branch). Omit to use HEAD."),
  max_bytes: z.number().int().positive().optional().describe("Maximum output size in bytes. Defaults to 64KB.")
});

export const ReleaseCommitSchema = z.object({
  sha: z.string(),
  short_sha: z.string(),
  subject: z.string(),
  author: z.string()
});

export const ReleaseNotesResultSchema = z.object({
  from: z.string(),
  to: z.string(),
  commit_count: z.number().int(),
  categories: z.object({
    features: z.array(ReleaseCommitSchema),
    fixes: z.array(ReleaseCommitSchema),
    breaking: z.array(ReleaseCommitSchema),
    other: z.array(ReleaseCommitSchema)
  }),
  markdown: z.string(),
  truncated: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export type ReleaseNotesInput = z.input<typeof ReleaseNotesInputSchema>;
export type ReleaseNotesResult = z.output<typeof ReleaseNotesResultSchema>;
