import { z } from "zod";
import { RepoInputSchema } from "./repo.contract.js";

const PathListSchema = z.array(z.string().min(1)).max(50);
const GlobListSchema = z.array(z.string().min(1)).max(50);

export const SymbolKindSchema = z.enum(["import", "export", "function", "class", "interface", "type", "enum", "variable", "markdown_heading"]);

export const SymbolOutlineInputSchema = RepoInputSchema.extend({
  paths: PathListSchema.optional().describe("Explicit repo-relative paths to outline."),
  include_globs: GlobListSchema.optional().describe("Repo-relative globs to include when paths are not enough."),
  exclude_globs: GlobListSchema.optional().describe("Repo-relative globs to exclude from analysis."),
  max_files: z.number().int().positive().max(100).optional().describe("Maximum files to inspect."),
  max_symbols: z.number().int().positive().max(1000).optional().describe("Maximum symbols to return.")
});

export const SymbolOutlineResultSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    language: z.string().optional(),
    imports: z.array(z.object({
      specifier: z.string(),
      line: z.number().int().positive()
    })),
    symbols: z.array(z.object({
      name: z.string(),
      kind: SymbolKindSchema,
      line: z.number().int().positive(),
      exported: z.boolean().optional()
    }))
  })),
  counts: z.object({
    files: z.number().int().nonnegative(),
    symbols: z.number().int().nonnegative(),
    imports: z.number().int().nonnegative()
  }),
  truncated: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const DependencyDirectionSchema = z.enum(["imports", "imported_by", "both"]);

export const DependencyMapInputSchema = RepoInputSchema.extend({
  paths: PathListSchema.optional().describe("Explicit repo-relative source paths to use as focus files."),
  include_globs: GlobListSchema.optional().describe("Repo-relative globs to include in dependency analysis."),
  direction: DependencyDirectionSchema.default("both").describe("Whether to return imports, imported-by edges, or both."),
  max_edges: z.number().int().positive().max(2000).optional().describe("Maximum dependency edges to return.")
});

export const DependencyMapResultSchema = z.object({
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    specifier: z.string(),
    kind: z.enum(["local", "external", "unresolved"])
  })),
  hotspots: z.array(z.object({
    path: z.string(),
    imports: z.number().int().nonnegative(),
    imported_by: z.number().int().nonnegative()
  })),
  external_packages: z.array(z.string()),
  unresolved_imports: z.array(z.object({
    from: z.string(),
    specifier: z.string()
  })),
  counts: z.object({
    files: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative()
  }),
  truncated: z.boolean(),
  warnings: z.array(z.string()).default([])
});

export const ValidationPlanInputSchema = RepoInputSchema.extend({
  changed_paths: PathListSchema.optional().describe("Optional changed repo-relative paths to tailor validation."),
  goal: z.string().min(1).max(500).optional().describe("Optional user goal or change summary.")
});

export const ValidationPlanResultSchema = z.object({
  commands: z.array(z.object({
    command: z.string(),
    reason: z.string(),
    confidence: z.enum(["low", "medium", "high"])
  })),
  affected_areas: z.array(z.object({
    area: z.string(),
    paths: z.array(z.string())
  })),
  package_manager: z.string().optional(),
  warnings: z.array(z.string()).default([])
});

export const AgentContextInputSchema = RepoInputSchema.extend({
  focus: z.string().min(1).max(200).optional().describe("Optional focus phrase for selecting the most relevant guide snippets.")
});

export const AgentContextResultSchema = z.object({
  read_first: z.array(z.object({
    path: z.string(),
    reason: z.string()
  })),
  guidance: z.array(z.object({
    path: z.string(),
    summary: z.string()
  })),
  scripts: z.array(z.object({
    name: z.string(),
    command: z.string()
  })),
  warnings: z.array(z.string()).default([])
});

export type SymbolOutlineInput = z.infer<typeof SymbolOutlineInputSchema>;
export type DependencyMapInput = z.infer<typeof DependencyMapInputSchema>;
export type ValidationPlanInput = z.infer<typeof ValidationPlanInputSchema>;
export type AgentContextInput = z.infer<typeof AgentContextInputSchema>;
