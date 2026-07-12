import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RepoReaderError } from "../runtime/errors.js";
import type { ReleaseNotesInput, ReleaseNotesResult } from "../contracts/release-notes.contract.js";

const execFileAsync = promisify(execFile);

type CommitEntry = {
  sha: string;
  short_sha: string;
  subject: string;
  author: string;
};

type CommitCategory = {
  features: CommitEntry[];
  fixes: CommitEntry[];
  breaking: CommitEntry[];
  other: CommitEntry[];
};

const MAX_BYTES_DEFAULT = 64_000;

export class ReleaseNotesService {
  constructor(private readonly root: string) {}

  async generate(options: Omit<ReleaseNotesInput, "repo_id">): Promise<ReleaseNotesResult> {
    const warnings: string[] = [];
    const maxBytes = options.max_bytes ?? MAX_BYTES_DEFAULT;

    const from = options.from_ref ?? (await this.resolveLatestTag(warnings));
    const to = options.to_ref ?? "HEAD";

    if (!from) {
      warnings.push("NO_START_REF");
      const commits = await this.getLog(`HEAD~20..HEAD`, maxBytes, warnings);
      const categories = categorize(commits);
      const markdown = renderMarkdown("HEAD~20", to, categories, commits.length);
      return {
        from: "HEAD~20",
        to,
        commit_count: commits.length,
        categories,
        markdown,
        truncated: false,
        warnings
      };
    }

    const range = `${from}..${to}`;
    const commits = await this.getLog(range, maxBytes, warnings);

    const categories = categorize(commits);
    const markdown = renderMarkdown(from, to, categories, commits.length);

    return {
      from,
      to,
      commit_count: commits.length,
      categories,
      markdown,
      truncated: false,
      warnings
    };
  }

  private async resolveLatestTag(warnings: string[]): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["tag", "--sort=-creatordate", "--format=%(refname:short)", "-1"],
        { cwd: this.root, encoding: "utf8", maxBuffer: 64 * 1024, env: { PATH: process.env.PATH ?? "" } }
      );
      const tag = stdout.trim();
      return tag || undefined;
    } catch {
      warnings.push("NO_TAGS_FOUND");
      return undefined;
    }
  }

  private async getLog(range: string, maxBytes: number, warnings: string[]): Promise<CommitEntry[]> {
    const args = [
      "log",
      range,
      "--format=%H|%h|%s|%an",
      "--no-merges"
    ];
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.root,
        encoding: "utf8",
        maxBuffer: maxBytes + 1024,
        env: { PATH: process.env.PATH ?? "" }
      });
      const text = stdout;
      if (!text.trim()) {
        return [];
      }
      const entries: CommitEntry[] = text.split("\n").filter(Boolean).map((line) => {
        const [sha, short_sha, subject, ...authorParts] = line.split("|");
        return { sha, short_sha, subject: subject ?? "", author: authorParts.join("|") };
      });
      return entries;
    } catch {
      warnings.push("GIT_LOG_FAILED");
      return [];
    }
  }
}

function categorize(commits: CommitEntry[]): CommitCategory {
  const categories: CommitCategory = {
    features: [],
    fixes: [],
    breaking: [],
    other: []
  };

  for (const commit of commits) {
    const subject = commit.subject;
    if (/^BREAKING[\s-]CHANGE/i.test(subject) || subject.includes("!:")) {
      categories.breaking.push(commit);
    } else if (/^feat(?:\(|:)/i.test(subject)) {
      categories.features.push(commit);
    } else if (/^fix(?:\(|:)/i.test(subject)) {
      categories.fixes.push(commit);
    } else {
      categories.other.push(commit);
    }
  }

  return categories;
}

function renderMarkdown(from: string, to: string, categories: CommitCategory, totalCount: number): string {
  const lines: string[] = [];
  lines.push(`## Release Notes: ${from} → ${to}`);
  lines.push("");
  lines.push(`${totalCount} commits`);
  lines.push("");

  if (categories.breaking.length > 0) {
    lines.push("### Breaking Changes");
    lines.push("");
    for (const c of categories.breaking) {
      lines.push(`- ${c.subject} (${c.short_sha})`);
    }
    lines.push("");
  }

  if (categories.features.length > 0) {
    lines.push("### Features");
    lines.push("");
    for (const c of categories.features) {
      lines.push(`- ${c.subject} (${c.short_sha})`);
    }
    lines.push("");
  }

  if (categories.fixes.length > 0) {
    lines.push("### Bug Fixes");
    lines.push("");
    for (const c of categories.fixes) {
      lines.push(`- ${c.subject} (${c.short_sha})`);
    }
    lines.push("");
  }

  if (categories.other.length > 0) {
    lines.push("### Other Changes");
    lines.push("");
    for (const c of categories.other) {
      lines.push(`- ${c.subject} (${c.short_sha})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
