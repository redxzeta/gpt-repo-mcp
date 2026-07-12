import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { ActionsConfigDocument } from "../config/schema.js";
import type { ActionCancelInput, ActionDescribeInput, ActionLogsInput, ActionRecentInput, ActionRunInput, ActionStatusInput } from "../contracts/actions.contract.js";
import { RepoReaderError } from "../runtime/errors.js";
import { GitService } from "./git-service.js";

const execFileAsync = promisify(execFile);

type RunStatus = "queued" | "running" | "completed" | "failed" | "timed_out" | "cancelled";

type RunMetadata = {
  run_id: string;
  action: string;
  status: RunStatus;
  exit_code?: number;
  pid?: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  output_truncated: boolean;
  worktree_before: { branch: string; head_sha: string; clean: boolean; file_count: number };
  worktree_after?: { branch: string; head_sha: string; clean: boolean; file_count: number };
  changed_paths?: string[];
};

const MAX_OUTPUT_BYTES = 256 * 1024;
const OUTPUT_EXCERPT_BYTES = 4096;

export class ActionService {
  private readonly actionsDir: string;

  constructor(
    private readonly root: string,
    private readonly actionsConfig?: ActionsConfigDocument
  ) {
    this.actionsDir = join(root, ".chatgpt", "actions");
  }

  list() {
    const enabled = this.actionsConfig?.enabled ?? false;
    const definitions = this.actionsConfig?.definitions ?? {};
    const actions = Object.entries(definitions).map(([name, def]) => ({
      name,
      command: def.command,
      args: def.args ?? [],
      timeout_ms: def.timeout_ms ?? 120000,
      mutates_files: def.mutates_files ?? false
    }));
    return { actions, enabled, warnings: [] };
  }

  describe(input: Omit<ActionDescribeInput, "repo_id">) {
    const definitions = this.actionsConfig?.definitions ?? {};
    const def = definitions[input.name];
    if (!def) {
      throw new RepoReaderError("VALIDATION_ERROR", `Unknown action: ${input.name}`);
    }
    return {
      name: input.name,
      command: def.command,
      args: def.args ?? [],
      timeout_ms: def.timeout_ms ?? 120000,
      mutates_files: def.mutates_files ?? false,
      warnings: []
    };
  }

  async run(input: Omit<ActionRunInput, "repo_id">) {
    const definitions = this.actionsConfig?.definitions ?? {};
    const def = definitions[input.name];
    if (!def) {
      throw new RepoReaderError("VALIDATION_ERROR", `Unknown action: ${input.name}`);
    }

    const runId = randomUUID();
    const runDir = join(this.actionsDir, runId);
    await mkdir(runDir, { recursive: true });

    const gitService = new GitService(this.root);
    const worktreeBefore = await gitService.status();

    const metadata: RunMetadata = {
      run_id: runId,
      action: input.name,
      status: "running",
      started_at: new Date().toISOString(),
      output_truncated: false,
      worktree_before: {
        branch: worktreeBefore.branch,
        head_sha: worktreeBefore.head_sha,
        clean: worktreeBefore.clean,
        file_count: worktreeBefore.files.length
      }
    };
    await this.writeAtomicJson(join(runDir, "run.json"), metadata);

    const args = [...(def.args ?? [])];
    const timeout = def.timeout_ms ?? 120000;

    try {
      const { stdout, stderr } = await execFileAsync(def.command, args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout
      });

      const stdoutExcerpt = truncateOutput(stdout);
      const stderrExcerpt = truncateOutput(stderr);
      const truncated = stdout.length > OUTPUT_EXCERPT_BYTES || stderr.length > OUTPUT_EXCERPT_BYTES;

      await writeFile(join(runDir, "stdout.log"), stdout, "utf8");
      await writeFile(join(runDir, "stderr.log"), stderr, "utf8");

      const worktreeAfter = await gitService.status();
      const changedPaths = diffPaths(worktreeBefore.files.map(f => f.path), worktreeAfter.files.map(f => f.path));

      metadata.status = "completed";
      metadata.exit_code = 0;
      metadata.completed_at = new Date().toISOString();
      metadata.duration_ms = Date.now() - new Date(metadata.started_at).getTime();
      metadata.output_truncated = truncated;
      metadata.worktree_after = {
        branch: worktreeAfter.branch,
        head_sha: worktreeAfter.head_sha,
        clean: worktreeAfter.clean,
        file_count: worktreeAfter.files.length
      };
      if (changedPaths.length > 0) {
        metadata.changed_paths = changedPaths;
      }
      await this.writeAtomicJson(join(runDir, "run.json"), metadata);

      return {
        run_id: runId,
        action: input.name,
        status: "completed" as const,
        exit_code: 0,
        started_at: metadata.started_at,
        completed_at: metadata.completed_at,
        duration_ms: metadata.duration_ms,
        stdout_excerpt: stdoutExcerpt,
        stderr_excerpt: stderrExcerpt,
        output_truncated: truncated,
        worktree_before: metadata.worktree_before,
        worktree_after: metadata.worktree_after,
        changed_paths: metadata.changed_paths,
        warnings: []
      };
    } catch (error: unknown) {
      const worktreeAfter = await gitService.status();
      const changedPaths = diffPaths(worktreeBefore.files.map(f => f.path), worktreeAfter.files.map(f => f.path));

      metadata.status = "failed";
      metadata.completed_at = new Date().toISOString();
      metadata.duration_ms = Date.now() - new Date(metadata.started_at).getTime();
      metadata.worktree_after = {
        branch: worktreeAfter.branch,
        head_sha: worktreeAfter.head_sha,
        clean: worktreeAfter.clean,
        file_count: worktreeAfter.files.length
      };
      if (changedPaths.length > 0) {
        metadata.changed_paths = changedPaths;
      }
      await this.writeAtomicJson(join(runDir, "run.json"), metadata);

      const err = error as { code?: string; stdout?: string; stderr?: string; killed?: boolean };
      return {
        run_id: runId,
        action: input.name,
        status: (err.killed ? "timed_out" : "failed") as RunStatus,
        exit_code: err.code === "ETIMEDOUT" ? undefined : undefined,
        started_at: metadata.started_at,
        completed_at: metadata.completed_at,
        duration_ms: metadata.duration_ms,
        stdout_excerpt: truncateOutput(err.stdout ?? ""),
        stderr_excerpt: truncateOutput(err.stderr ?? ""),
        output_truncated: Boolean(err.stdout) || Boolean(err.stderr),
        worktree_before: metadata.worktree_before,
        worktree_after: metadata.worktree_after,
        changed_paths: metadata.changed_paths,
        warnings: []
      };
    }
  }

  async status(input: Omit<ActionStatusInput, "repo_id">) {
    const metadata = await this.readRunMetadata(input.run_id);
    return {
      run_id: metadata.run_id,
      action: metadata.action,
      status: metadata.status,
      exit_code: metadata.exit_code,
      started_at: metadata.started_at,
      completed_at: metadata.completed_at,
      duration_ms: metadata.duration_ms,
      stdout_excerpt: undefined,
      stderr_excerpt: undefined,
      output_truncated: metadata.output_truncated,
      worktree_before: metadata.worktree_before,
      worktree_after: metadata.worktree_after,
      changed_paths: metadata.changed_paths,
      warnings: []
    };
  }

  async logs(input: Omit<ActionLogsInput, "repo_id">) {
    const runDir = join(this.actionsDir, input.run_id);
    const maxBytes = input.max_bytes ?? 65536;

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    try {
      const rawStdout = await readFile(join(runDir, "stdout.log"), "utf8");
      if (rawStdout.length > maxBytes) {
        stdout = rawStdout.slice(-maxBytes);
        stdoutTruncated = true;
      } else {
        stdout = rawStdout;
      }
    } catch {
      // No stdout log
    }

    try {
      const rawStderr = await readFile(join(runDir, "stderr.log"), "utf8");
      if (rawStderr.length > maxBytes) {
        stderr = rawStderr.slice(-maxBytes);
        stderrTruncated = true;
      } else {
        stderr = rawStderr;
      }
    } catch {
      // No stderr log
    }

    return {
      run_id: input.run_id,
      stdout,
      stderr,
      stdout_truncated: stdoutTruncated,
      stderr_truncated: stderrTruncated,
      warnings: []
    };
  }

  async cancel(input: Omit<ActionCancelInput, "repo_id">) {
    const metadata = await this.readRunMetadata(input.run_id);
    if (metadata.status !== "running" && metadata.status !== "queued") {
      throw new RepoReaderError("VALIDATION_ERROR", `Cannot cancel run in status: ${metadata.status}`);
    }

    if (metadata.pid) {
      try {
        process.kill(metadata.pid, "SIGTERM");
      } catch {
        // Process may have already exited
      }
    }

    metadata.status = "cancelled";
    metadata.completed_at = new Date().toISOString();
    await this.writeAtomicJson(join(this.actionsDir, input.run_id, "run.json"), metadata);

    return {
      run_id: input.run_id,
      action: metadata.action,
      status: "cancelled" as const,
      warnings: []
    };
  }

  async recent(input: Omit<ActionRecentInput, "repo_id">) {
    const maxResults = Math.min(input.max_results ?? 20, 20);
    const runs: Array<{ run_id: string; action: string; status: RunStatus; started_at: string; completed_at?: string; duration_ms?: number }> = [];

    try {
      const entries = await readdir(this.actionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const metadata = await this.readRunMetadata(entry.name);
          runs.push({
            run_id: metadata.run_id,
            action: metadata.action,
            status: metadata.status,
            started_at: metadata.started_at,
            completed_at: metadata.completed_at,
            duration_ms: metadata.duration_ms
          });
        } catch {
          // Skip invalid run directories
        }
      }
    } catch {
      // Actions directory doesn't exist yet
    }

    runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const limited = runs.slice(0, maxResults);

    return {
      runs: limited,
      count: limited.length,
      warnings: []
    };
  }

  private async readRunMetadata(runId: string): Promise<RunMetadata> {
    const runDir = join(this.actionsDir, runId);
    const raw = await readFile(join(runDir, "run.json"), "utf8");
    return JSON.parse(raw) as RunMetadata;
  }

  private async writeAtomicJson(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${randomUUID()}`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await rename(tmpPath, filePath);
  }
}

function truncateOutput(output: string): string {
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const bytes = new TextEncoder().encode(output);
  if (bytes.length <= OUTPUT_EXCERPT_BYTES) {
    return output;
  }
  return textDecoder.decode(bytes.slice(-OUTPUT_EXCERPT_BYTES));
}

function diffPaths(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const changed: string[] = [];
  for (const path of afterSet) {
    if (!beforeSet.has(path)) {
      changed.push(path);
    }
  }
  return changed;
}
