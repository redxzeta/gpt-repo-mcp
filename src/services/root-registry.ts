import { readFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { RepoReaderConfigSchema, type RepoConfig as RepoConfigType } from "../config/schema.js";
import { DEFAULT_LIMITS } from "../policies/limits.js";
import { RepoReaderError } from "../runtime/errors.js";

export type RepoConfig = RepoConfigType;

export class RootRegistry {
  private constructor(
    private readonly repos: RepoConfig[],
    readonly limits: Required<typeof DEFAULT_LIMITS>,
    readonly toolProfile: "core" | "full"
  ) {}

  static async fromConfig(config: unknown): Promise<RootRegistry> {
    const parsed = RepoReaderConfigSchema.parse(config);
    const repos: RepoConfig[] = [];
    for (const repo of parsed.repos) {
      repos.push({ ...repo, root: await realpath(repo.root) });
    }
    const limits = { ...DEFAULT_LIMITS };
    for (const [key, value] of Object.entries(parsed.limits)) {
      if (value !== undefined) {
        (limits as Record<string, number>)[key] = value as number;
      }
    }
    return new RootRegistry(repos, limits, parsed.tool_profile);
  }

  static async fromFile(configPath: string): Promise<RootRegistry> {
    const raw = await readFile(configPath, "utf8");
    return RootRegistry.fromConfig(JSON.parse(raw));
  }

  list(): Array<Pick<RepoConfig, "repo_id" | "display_name" | "root">> {
    return this.repos.map((repo) => ({
      repo_id: repo.repo_id,
      display_name: repo.display_name,
      root: repo.root
    }));
  }

  get(repoId: string): RepoConfig {
    const repo = this.repos.find((candidate) => candidate.repo_id === repoId);
    if (!repo) {
      throw new RepoReaderError("UNKNOWN_REPO", `Unknown repo_id: ${repoId}`);
    }
    return repo;
  }
}
