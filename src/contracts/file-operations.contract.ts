import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

export const CreateFilesInputSchema = RepoInputSchema.extend({
  files: z.array(z.object({
    path: z.string().min(1).describe("Repo-relative POSIX path."),
    content: z.string().optional().describe("File content as UTF-8 text."),
    create_parent_directories: z.boolean().default(false).describe("Whether to create parent directories if missing.")
  })).min(1).max(25).describe("Files to create."),
  expected_head_sha: z.string().optional().describe("Expected HEAD SHA for safety check."),
  dry_run: z.boolean().default(false).describe("Preview creation without writing files."),
  reason: z.string().max(500).optional().describe("Optional reason for the operation.")
}).describe("Create new files without overwriting existing ones.");

export const CreatedFileSchema = z.object({
  path: z.string().describe("Repo-relative path of created file."),
  bytes: z.number().int().nonnegative().describe("Bytes written."),
  sha256: z.string().describe("SHA-256 hash of written content.")
});

export const SkippedFileSchema = z.object({
  path: z.string().describe("Repo-relative path."),
  reason: z.string().describe("Why the file was skipped.")
});

export const CreateFilesResultSchema = z.object({
  status: z.enum(["previewed", "created"]).describe("Operation status."),
  head_sha: z.string().optional().describe("HEAD SHA after operation."),
  created_files: z.array(CreatedFileSchema).describe("Files created."),
  created_directories: z.array(z.string()).describe("Directories created."),
  skipped: z.array(SkippedFileSchema).describe("Files skipped."),
  warnings: z.array(z.string()).default([])
});

export const ApplyPatchInputSchema = RepoInputSchema.extend({
  patch: z.string().min(1).describe("Unified diff patch content."),
  expected_head_sha: z.string().describe("Expected HEAD SHA for safety check."),
  expected_files: z.array(z.object({
    path: z.string().describe("Repo-relative path."),
    sha256: z.string().describe("Expected SHA-256 hash.")
  })).optional().describe("Optional expected file hashes for validation."),
  dry_run: z.boolean().default(false).describe("Preview patch application without modifying files."),
  reason: z.string().max(500).optional().describe("Optional reason for the operation.")
}).describe("Apply a unified diff patch to the repository.");

export const AppliedFileSchema = z.object({
  path: z.string().describe("Repo-relative path of modified file."),
  sha256: z.string().describe("SHA-256 hash after patch application.")
});

export const ApplyPatchResultSchema = z.object({
  status: z.enum(["previewed", "applied"]).describe("Operation status."),
  applied_files: z.array(AppliedFileSchema).describe("Files modified by patch."),
  rejected_hunks: z.array(z.string()).describe("Hunks that failed to apply."),
  diff_summary: z.string().describe("git diff --stat summary of changes."),
  warnings: z.array(z.string()).default([])
});

export type CreateFilesInput = z.infer<typeof CreateFilesInputSchema>;
export type ApplyPatchInput = z.infer<typeof ApplyPatchInputSchema>;
