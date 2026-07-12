import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_LIMITS } from "../policies/limits.js";
import { RepoReaderError } from "../runtime/errors.js";
import { validateRepoPath } from "./path-sandbox.js";

const execFileAsync = promisify(execFile);

export type GitLogEntry = {
  sha: string;
  short_sha: string;
  author: string;
  date: string;
  subject: string;
};

export type GitBranchEntry = {
  name: string;
  current: boolean;
  remote?: string;
};

export type GitTagEntry = {
  name: string;
  ref: string;
  date?: string;
};

export type GitBlameLine = {
  line: number;
  sha: string;
  author: string;
  date: string;
  content: string;
};

export class GitService {
  constructor(private readonly root: string) {}

  async status() {
    const [branch, headSha, porcelain] = await Promise.all([
      this.git(["rev-parse", "--abbrev-ref", "HEAD"]),
      this.git(["rev-parse", "HEAD"]),
      this.git(["status", "--porcelain=v1", "--untracked-files=all"])
    ]);
    const files = porcelain.split("\n").filter(Boolean).map(parseStatusLine);
    const counts: Record<string, number> = {};
    for (const file of files) {
      const key = `${file.index}${file.worktree}`.trim() || "clean";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return {
      branch: branch.trim(),
      head_sha: headSha.trim(),
      clean: files.length === 0,
      files,
      counts
    };
  }

  async diff(options: {
    base?: string;
    compare?: string;
    staged?: boolean;
    unstaged?: boolean;
    paths?: string[];
    max_bytes?: number;
    context_lines?: number;
  }) {
    const paths = options.paths?.map(validateRepoPath);
    const args = ["diff", "--find-renames", `--unified=${options.context_lines ?? 3}`];
    if (options.staged) {
      args.push("--cached");
    }
    if (options.base && options.compare) {
      args.push(`${options.base}...${options.compare}`);
    } else if (options.base) {
      args.push(options.base);
    }
    if (paths?.length) {
      args.push("--", ...paths);
    }
    const maxBytes = Math.min(options.max_bytes ?? DEFAULT_LIMITS.max_diff_bytes, DEFAULT_LIMITS.max_diff_bytes);
    const raw = await this.git(args, DEFAULT_LIMITS.max_diff_bytes + 1);
    const truncated = Buffer.byteLength(raw) > maxBytes;
    const text = truncated ? raw.slice(0, maxBytes) : raw;
    return {
      base: options.base,
      compare: options.compare,
      staged: options.staged,
      unstaged: options.unstaged,
      files: parseDiff(text),
      truncated,
      warnings: truncated
        ? [`Diff truncated by max_bytes (${maxBytes}). Increase max_bytes or pass paths to narrow the diff before reviewing.`]
        : []
    };
  }

  async log(options: { ref?: string; paths?: string[]; max_count?: number; max_bytes?: number }) {
    const maxCount = Math.min(options.max_count ?? 20, 100);
    const args = [
      "log",
      `--max-count=${maxCount}`,
      "--format=%H|%h|%an|%ai|%s"
    ];
    if (options.ref) {
      args.push(options.ref);
    }
    if (options.paths?.length) {
      args.push("--", ...options.paths.map(validateRepoPath));
    }
    const raw = await this.git(args);
    const maxBytes = options.max_bytes ?? DEFAULT_LIMITS.max_diff_bytes;
    const truncated = Buffer.byteLength(raw) > maxBytes;
    const text = truncated ? raw.slice(0, maxBytes) : raw;
    const entries: GitLogEntry[] = text.split("\n").filter(Boolean).map((line) => {
      const [sha, short_sha, author, date, ...rest] = line.split("|");
      return { sha, short_sha, author, date, subject: rest.join("|") };
    });
    return { entries, truncated, total: entries.length };
  }

  async show(commitSha: string, maxBytes?: number) {
    const sha = commitSha.trim();
    const args = ["show", "--stat", "--format=%H|%h|%an|%ai|%s%n%b", sha];
    const raw = await this.git(args);
    const limit = maxBytes ?? DEFAULT_LIMITS.max_diff_bytes;
    const truncated = Buffer.byteLength(raw) > limit;
    const text = truncated ? raw.slice(0, limit) : raw;
    return { sha, content: text, truncated };
  }

  async blame(filePath: string, options?: { ref?: string; max_bytes?: number }) {
    const validatedPath = validateRepoPath(filePath);
    const args = ["blame", "--line-porcelain", validatedPath];
    if (options?.ref) {
      args.push(options.ref);
    }
    const raw = await this.git(args);
    const limit = options?.max_bytes ?? DEFAULT_LIMITS.max_diff_bytes;
    const truncated = Buffer.byteLength(raw) > limit;
    const text = truncated ? raw.slice(0, limit) : raw;
    const lines: GitBlameLine[] = [];
    let current: Partial<GitBlameLine> = {};
    let lineNum = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("author ")) {
        current.author = line.slice(7);
      } else if (line.startsWith("author-time ")) {
        current.date = new Date(Number(line.slice(12)) * 1000).toISOString();
      } else if (line.startsWith("\t")) {
        lineNum++;
        lines.push({
          line: lineNum,
          sha: current.sha ?? "",
          author: current.author ?? "",
          date: current.date ?? "",
          content: line.slice(1)
        });
        current = {};
      } else if (/^[0-9a-f]{40}/.test(line)) {
        current.sha = line.slice(0, 40);
      }
    }
    return { file: validatedPath, lines, truncated, total: lines.length };
  }

  async branches(options?: { include_remotes?: boolean; max_count?: number }) {
    const args = ["branch", "--format=%(refname:short)|%(HEAD)|%(upstream:short)"];
    if (options?.include_remotes) {
      args.push("-a");
    }
    const raw = await this.git(args);
    const maxCount = options?.max_count ?? 50;
    const entries: GitBranchEntry[] = raw.split("\n").filter(Boolean).map((line) => {
      const [name, current, remote] = line.split("|");
      return { name, current: current === "1", remote: remote || undefined };
    });
    return { branches: entries.slice(0, maxCount), total: entries.length, truncated: entries.length > maxCount };
  }

  async tags(options?: { max_count?: number }) {
    const maxCount = options?.max_count ?? 50;
    const args = ["tag", "--sort=-creatordate", "--format=%(refname:short)|%(objectname:short)|%(creatordate:iso)"];
    const raw = await this.git(args);
    const entries: GitTagEntry[] = raw.split("\n").filter(Boolean).map((line) => {
      const [name, ref, date] = line.split("|");
      return { name, ref, date: date || undefined };
    });
    return { tags: entries.slice(0, maxCount), total: entries.length, truncated: entries.length > maxCount };
  }

  private async git(args: string[], maxBuffer: number = DEFAULT_LIMITS.max_diff_bytes): Promise<string> {
    try {
      const result = await execFileAsync("git", args, {
        cwd: this.root,
        maxBuffer,
        env: { PATH: process.env.PATH ?? "" }
      });
      return result.stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Git command failed";
      throw new RepoReaderError("GIT_ERROR", message);
    }
  }
}

type StatusFile = {
  path: string;
  original_path?: string;
  index: string;
  worktree: string;
};

type DiffFile = {
  path: string;
  original_path?: string;
  status?: string;
  hunks: string[];
};

function parseStatusLine(line: string): StatusFile {
  const index = line.slice(0, 1);
  const worktree = line.slice(1, 2);
  const rawPath = line.slice(3);
  if (index === "R" || index === "C") {
    const [originalPath, path] = rawPath.split(" -> ");
    return { index, worktree, path: path ?? rawPath, original_path: originalPath };
  }
  return { index, worktree, path: rawPath };
}

function parseDiff(diff: string) {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let currentHunk: string[] = [];

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        if (currentHunk.length) current.hunks.push(currentHunk.join("\n"));
        files.push(current);
      }
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = { path: match?.[2] ?? "unknown", hunks: [] };
      currentHunk = [];
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.original_path = line.slice("rename from ".length);
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("new file mode ")) {
      current.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("@@")) {
      current.status ??= "modified";
      if (currentHunk.length) current.hunks.push(currentHunk.join("\n"));
      currentHunk = [line];
      continue;
    }
    if (currentHunk.length) {
      currentHunk.push(line);
    }
  }
  if (current) {
    if (currentHunk.length) current.hunks.push(currentHunk.join("\n"));
    files.push(current);
  }
  return files;
}
