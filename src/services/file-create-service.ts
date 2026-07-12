import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { ApplyPatchInput, CreateFilesInput } from "../contracts/file-operations.contract.js";
import { RepoReaderError } from "../runtime/errors.js";
import { validateRepoPath } from "./path-sandbox.js";
import { SecretScanner } from "./secret-scanner.js";
import { GitService } from "./git-service.js";

const execFileAsync = promisify(execFile);
const secretScanner = new SecretScanner();

export class FileCreateService {
  constructor(private readonly root: string) {}

  async createFiles(input: Omit<CreateFilesInput, "repo_id">) {
    const warnings: string[] = [];
    const createdFiles: Array<{ path: string; bytes: number; sha256: string }> = [];
    const createdDirectories: string[] = [];
    const skipped: Array<{ path: string; reason: string }> = [];

    if (input.files.length > 25) {
      throw new RepoReaderError("CREATE_BATCH_TOO_LARGE", `Batch too large: ${input.files.length} files (max 25)`);
    }

    // Validate all paths upfront
    for (const file of input.files) {
      const repoPath = validateRepoPath(file.path);
      const absolutePath = join(this.root, repoPath);

      if (existsSync(absolutePath)) {
        skipped.push({ path: repoPath, reason: "File already exists" });
        continue;
      }

      if (file.content !== undefined && file.content.length > 1048576) {
        throw new RepoReaderError("CREATE_CONTENT_TOO_LARGE", `Content too large for ${repoPath}: ${file.content.length} bytes`);
      }

      if (file.content !== undefined && secretScanner.hasSecretValue(file.content)) {
        throw new RepoReaderError("SECRET_CANDIDATE_BLOCKED", `Secret content blocked: ${repoPath}`);
      }
    }

    if (input.dry_run) {
      return {
        status: "previewed" as const,
        head_sha: undefined,
        created_files: [],
        created_directories: [],
        skipped,
        warnings
      };
    }

    // Create files
    for (const file of input.files) {
      const repoPath = validateRepoPath(file.path);
      const absolutePath = join(this.root, repoPath);

      if (skipped.some(s => s.path === repoPath)) {
        continue;
      }

      // Create parent directories if requested
      if (file.create_parent_directories) {
        const dir = dirname(absolutePath);
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
          createdDirectories.push(repoPath.substring(0, repoPath.lastIndexOf("/")));
        }
      }

      const content = file.content ?? "";
      const buffer = Buffer.from(content, "utf8");
      const sha256 = createHash("sha256").update(buffer).digest("hex");

      // Atomic write via temp file
      const tmpPath = `${absolutePath}.tmp.${randomUUID()}`;
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, absolutePath);

      createdFiles.push({
        path: repoPath,
        bytes: buffer.byteLength,
        sha256
      });
    }

    let headSha: string | undefined;
    try {
      headSha = (await new GitService(this.root).status()).head_sha;
    } catch {
      // Not a git repo or git unavailable
    }

    return {
      status: "created" as const,
      head_sha: headSha,
      created_files: createdFiles,
      created_directories: createdDirectories,
      skipped,
      warnings
    };
  }
}

export class PatchService {
  constructor(private readonly root: string) {}

  async applyPatch(input: Omit<ApplyPatchInput, "repo_id">) {
    const warnings: string[] = [];

    // Validate expected HEAD SHA
    let currentHead: string | undefined;
    try {
      currentHead = (await new GitService(this.root).status()).head_sha;
    } catch {
      warnings.push("GIT_HEAD_UNAVAILABLE");
    }

    if (input.expected_head_sha && currentHead && input.expected_head_sha !== currentHead) {
      throw new RepoReaderError("WRITE_STALE_EXPECTED_SHA", `HEAD mismatch: expected ${input.expected_head_sha}, got ${currentHead}`);
    }

    if (input.dry_run) {
      // Check if patch applies cleanly
      try {
        await this.execGitApply(["--check"], input.patch);
        return {
          status: "previewed" as const,
          applied_files: [],
          rejected_hunks: [],
          diff_summary: "Patch would apply cleanly.",
          warnings
        };
      } catch {
        return {
          status: "previewed" as const,
          applied_files: [],
          rejected_hunks: ["Patch would not apply cleanly"],
          diff_summary: "Patch would fail to apply.",
          warnings
        };
      }
    }

    // Apply patch
    try {
      await this.execGitApply([], input.patch);
    } catch {
      throw new RepoReaderError("PATCH_FAILED", "Failed to apply patch");
    }

    // Get diff summary
    let diffSummary = "";
    try {
      const { stdout } = await execFileAsync("git", ["diff", "--stat"], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      diffSummary = stdout.trim();
    } catch {
      diffSummary = "Unable to generate diff summary";
    }

    // Get affected files and their hashes
    const appliedFiles: Array<{ path: string; sha256: string }> = [];
    try {
      const { stdout } = await execFileAsync("git", ["diff", "--name-only"], {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      const paths = stdout.trim().split("\n").filter(Boolean);
      for (const path of paths) {
        try {
          const content = await readFile(join(this.root, path), "utf8");
          const sha256 = createHash("sha256").update(content).digest("hex");
          appliedFiles.push({ path, sha256 });
        } catch {
          // File may have been deleted by patch
        }
      }
    } catch {
      // Unable to get affected files
    }

    return {
      status: "applied" as const,
      applied_files: appliedFiles,
      rejected_hunks: [],
      diff_summary: diffSummary,
      warnings
    };
  }

  private execGitApply(args: string[], patchContent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["apply", ...args], {
        cwd: this.root,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stderr = "";
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `git apply exited with code ${code}`));
        }
      });

      child.on("error", reject);

      // Write patch content to stdin
      child.stdin.write(patchContent);
      child.stdin.end();
    });
  }
}
