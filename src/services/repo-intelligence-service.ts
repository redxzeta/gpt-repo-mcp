import { dirname, extname, posix } from "node:path";
import ts from "typescript";
import { DEFAULT_LIMITS } from "../policies/limits.js";
import { RepoReaderError } from "../runtime/errors.js";
import type { AgentContextInput, DependencyMapInput, SymbolOutlineInput, ValidationPlanInput } from "../contracts/repo-intelligence.contract.js";
import { FileClassifier } from "./file-classifier.js";
import { isExcludedByGlob, matchesGlob } from "./glob-service.js";
import { IgnoreEngine } from "./ignore-engine.js";
import { PathSandbox, validateRepoPath } from "./path-sandbox.js";
import { RepoTreeService } from "./repo-tree-service.js";
import { readFilePrefix } from "./bounded-read.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const OUTLINE_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ".md"]);
const DEFAULT_MAX_FILES = 40;
const DEFAULT_DEPENDENCY_MAX_FILES = 200;
const DEFAULT_MAX_SYMBOLS = 400;
const DEFAULT_MAX_EDGES = 800;

type RepoFile = {
  path: string;
  language?: string;
};

type ImportRecord = {
  specifier: string;
  line: number;
};

type SymbolRecord = {
  name: string;
  kind: "import" | "export" | "function" | "class" | "interface" | "type" | "enum" | "variable" | "markdown_heading";
  line: number;
  exported?: boolean;
};

type ImportEdge = {
  from: string;
  to: string;
  specifier: string;
  kind: "local" | "external" | "unresolved";
};

export class RepoIntelligenceService {
  private readonly ignoreEngine = new IgnoreEngine();
  private readonly classifier = new FileClassifier(this.ignoreEngine);

  constructor(private readonly root: string, private readonly sandbox: PathSandbox) {}

  async symbolOutline(options: Omit<SymbolOutlineInput, "repo_id">) {
    const warnings: string[] = [];
    const files = await this.selectFiles({
      paths: options.paths,
      include_globs: options.include_globs,
      exclude_globs: options.exclude_globs,
      extensions: OUTLINE_EXTENSIONS,
      max_files: options.max_files ?? DEFAULT_MAX_FILES,
      warnings
    });
    const maxSymbols = Math.min(options.max_symbols ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS);
    const outlined = [];
    let symbolCount = 0;
    let importCount = 0;
    let truncated = files.truncated;

    for (const file of files.files) {
      if (symbolCount >= maxSymbols) {
        truncated = true;
        break;
      }
      const text = await this.readText(file.path, warnings);
      if (text === undefined) {
        continue;
      }
      const parsed = file.path.endsWith(".md") ? outlineMarkdown(text) : outlineSource(file.path, text);
      const remaining = maxSymbols - symbolCount;
      const symbols = parsed.symbols.slice(0, remaining);
      if (parsed.symbols.length > symbols.length) {
        truncated = true;
      }
      symbolCount += symbols.length;
      importCount += parsed.imports.length;
      outlined.push({
        path: file.path,
        language: file.language,
        imports: parsed.imports,
        symbols
      });
    }

    return {
      files: outlined,
      counts: {
        files: outlined.length,
        symbols: symbolCount,
        imports: importCount
      },
      truncated,
      warnings
    };
  }

  async dependencyMap(options: Omit<DependencyMapInput, "repo_id">) {
    const warnings: string[] = [];
    const allSourceFiles = await this.selectFiles({
      include_globs: ["**/*"],
      extensions: SOURCE_EXTENSIONS,
      max_files: DEFAULT_DEPENDENCY_MAX_FILES,
      warnings
    });
    const sourcePaths = new Set(allSourceFiles.files.map((file) => file.path));
    const hasFocus = Boolean(options.paths?.length || options.include_globs?.length);
    const focusFiles = hasFocus
      ? await this.selectFiles({
          paths: options.paths,
          include_globs: options.include_globs,
          extensions: SOURCE_EXTENSIONS,
          max_files: DEFAULT_DEPENDENCY_MAX_FILES,
          warnings
        })
      : { files: [], truncated: false };
    const focusPaths = new Set(focusFiles.files.map((file) => file.path));
    const maxEdges = Math.min(options.max_edges ?? DEFAULT_MAX_EDGES, DEFAULT_MAX_EDGES);
    const edges: ImportEdge[] = [];
    const externalPackages = new Set<string>();
    const unresolvedImports: Array<{ from: string; specifier: string }> = [];

    for (const file of allSourceFiles.files) {
      const text = await this.readText(file.path, warnings);
      if (text === undefined) {
        continue;
      }
      for (const importRecord of outlineSource(file.path, text).imports) {
        const edge = edgeForImport(file.path, importRecord.specifier, sourcePaths);
        if (edge.kind === "external") {
          externalPackages.add(edge.to);
        }
        if (edge.kind === "unresolved") {
          unresolvedImports.push({ from: edge.from, specifier: edge.specifier });
        }
        if (shouldIncludeEdge(edge, focusPaths, options.direction ?? "both")) {
          edges.push(edge);
        }
      }
    }

    const truncated = allSourceFiles.truncated || focusFiles.truncated || edges.length > maxEdges;
    const returnedEdges = edges.slice(0, maxEdges);
    return {
      edges: returnedEdges,
      hotspots: hotspotSummary(returnedEdges),
      external_packages: [...externalPackages].sort(),
      unresolved_imports: unresolvedImports.slice(0, 100),
      counts: {
        files: allSourceFiles.files.length,
        edges: returnedEdges.length
      },
      truncated,
      warnings
    };
  }

  async validationPlan(options: Omit<ValidationPlanInput, "repo_id">) {
    const warnings: string[] = [];
    const packageJson = await this.readPackageJson(warnings);
    const scripts = normalizeScripts(packageJson?.scripts);
    const packageManager = await this.detectPackageManager();
    const changedPaths = (options.changed_paths ?? []).map(validateRepoPath);
    const affectedAreas = affectedAreasFor(changedPaths);
    const commands = commandsForValidation(scripts, packageManager, changedPaths, options.goal);

    if (commands.length === 0) {
      warnings.push("NO_VALIDATION_COMMANDS_DETECTED");
    }

    return {
      commands,
      affected_areas: affectedAreas,
      package_manager: packageManager,
      warnings
    };
  }

  async agentContext(options: Omit<AgentContextInput, "repo_id">) {
    const warnings: string[] = [];
    const allFiles = await this.listFiles(DEFAULT_LIMITS.max_tree_entries, warnings);
    const docs = selectAgentDocs(allFiles.map((file) => file.path), options.focus);
    const guidance = [];
    for (const doc of docs.slice(0, 8)) {
      const text = await this.readTextPrefix(doc.path, warnings);
      if (text !== undefined) {
        guidance.push({
          path: doc.path,
          summary: summarizeGuidance(text, options.focus)
        });
      }
    }
    const packageJson = await this.readPackageJson(warnings);
    return {
      read_first: docs.slice(0, 10),
      guidance,
      scripts: normalizeScripts(packageJson?.scripts).slice(0, 25),
      warnings
    };
  }

  private async selectFiles(options: {
    paths?: string[];
    include_globs?: string[];
    exclude_globs?: string[];
    extensions: Set<string>;
    max_files: number;
    warnings: string[];
  }): Promise<{ files: RepoFile[]; truncated: boolean }> {
    const maxFiles = Math.min(options.max_files, DEFAULT_LIMITS.max_tree_entries);
    const explicitPaths = options.paths?.map(validateRepoPath) ?? [];
    const selected = new Map<string, RepoFile>();
    let hitFileLimit = false;

    for (const path of explicitPaths) {
      if (options.exclude_globs && isExcludedByGlob(path, options.exclude_globs)) {
        continue;
      }
      const file = await this.fileIfReadable(path, options.extensions, options.warnings);
      if (file) {
        selected.set(path, file);
      }
    }

    if (options.include_globs && options.include_globs.length > 0) {
      const allFiles = await this.listFiles(DEFAULT_LIMITS.max_tree_entries, options.warnings);
      for (const file of allFiles) {
        if (selected.size >= maxFiles) {
          hitFileLimit = true;
          break;
        }
        if (!options.include_globs.some((glob) => matchesGlob(file.path, glob))) {
          continue;
        }
        if (options.exclude_globs && isExcludedByGlob(file.path, options.exclude_globs)) {
          continue;
        }
        if (!options.extensions.has(extname(file.path).toLowerCase())) {
          continue;
        }
        selected.set(file.path, file);
      }
    }

    if (explicitPaths.length === 0 && (!options.include_globs || options.include_globs.length === 0)) {
      const allFiles = await this.listFiles(DEFAULT_LIMITS.max_tree_entries, options.warnings);
      for (const file of allFiles) {
        if (selected.size >= maxFiles) {
          hitFileLimit = true;
          break;
        }
        if (options.extensions.has(extname(file.path).toLowerCase())) {
          selected.set(file.path, file);
        }
      }
    }

    return {
      files: [...selected.values()].slice(0, maxFiles),
      truncated: hitFileLimit || selected.size > maxFiles
    };
  }

  private async listFiles(pageSize: number, warnings: string[]): Promise<RepoFile[]> {
    const tree = await new RepoTreeService(this.root, this.sandbox).tree({
      include_files: true,
      respect_default_excludes: true,
      page_size: pageSize
    });
    if (tree.truncated) {
      warnings.push("TREE_TRUNCATED");
    }
    const files = [];
    for (const entry of tree.entries) {
      if (entry.type !== "file") {
        continue;
      }
      const file = await this.fileIfReadable(entry.path, undefined, warnings);
      if (file) {
        files.push(file);
      }
    }
    return files;
  }

  private async fileIfReadable(path: string, extensions: Set<string> | undefined, warnings: string[]): Promise<RepoFile | undefined> {
    if (this.ignoreEngine.isSensitiveCandidate(path)) {
      return undefined;
    }
    if (extensions && !extensions.has(extname(path).toLowerCase())) {
      return undefined;
    }
    try {
      const resolved = await this.sandbox.resolve(path);
      const classification = await this.classifier.classify(path, resolved.absolutePath);
      if (classification.is_binary || classification.is_secret_candidate) {
        return undefined;
      }
      return { path, language: classification.language };
    } catch (error) {
      if (error instanceof RepoReaderError) {
        warnings.push(`READ_SKIPPED:${path}:${error.code}`);
        return undefined;
      }
      throw error;
    }
  }

  private async readText(path: string, warnings: string[]): Promise<string | undefined> {
    try {
      const resolved = await this.sandbox.resolve(path);
      const result = await readFilePrefix(resolved.absolutePath, DEFAULT_LIMITS.max_bytes_per_file);
      if (result.truncated) {
        warnings.push(`FILE_TRUNCATED:${path}`);
      }
      return result.buffer.toString("utf8");
    } catch {
      warnings.push(`READ_SKIPPED:${path}`);
      return undefined;
    }
  }

  private async readTextPrefix(path: string, warnings: string[]): Promise<string | undefined> {
    try {
      const resolved = await this.sandbox.resolve(path);
      const result = await readFilePrefix(resolved.absolutePath, 24000);
      if (result.truncated) {
        warnings.push(`FILE_TRUNCATED:${path}`);
      }
      return result.buffer.toString("utf8");
    } catch {
      warnings.push(`READ_SKIPPED:${path}`);
      return undefined;
    }
  }

  private async readPackageJson(warnings: string[]): Promise<{ scripts?: Record<string, unknown> } | undefined> {
    const text = await this.readTextPrefix("package.json", warnings);
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text) as { scripts?: Record<string, unknown> };
    } catch {
      warnings.push("PACKAGE_JSON_PARSE_ERROR");
      return undefined;
    }
  }

  private async detectPackageManager(): Promise<string | undefined> {
    const candidates = [
      ["pnpm-lock.yaml", "pnpm"],
      ["package-lock.json", "npm"],
      ["yarn.lock", "yarn"],
      ["bun.lock", "bun"],
      ["bun.lockb", "bun"]
    ] as const;
    for (const [path, manager] of candidates) {
      try {
        await this.sandbox.resolve(path);
        return manager;
      } catch {
        // Try next candidate.
      }
    }
    return undefined;
  }
}

function outlineSource(path: string, text: string): { imports: ImportRecord[]; symbols: SymbolRecord[] } {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  const imports: ImportRecord[] = [];
  const symbols: SymbolRecord[] = [];
  const lineFor = (position: number) => source.getLineAndCharacterOfPosition(position).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, line: lineFor(node.getStart(source)) });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, line: lineFor(node.getStart(source)) });
      symbols.push({ name: node.moduleSpecifier.text, kind: "export", line: lineFor(node.getStart(source)), exported: true });
    }
    if (isTopLevelDeclaration(node)) {
      const symbol = symbolForNode(node, source, lineFor(node.getStart(source)));
      if (symbol) {
        symbols.push(symbol);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return { imports, symbols };
}

function scriptKindFor(path: string): ts.ScriptKind {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isTopLevelDeclaration(node: ts.Node): boolean {
  return Boolean(node.parent && ts.isSourceFile(node.parent));
}

function symbolForNode(node: ts.Node, source: ts.SourceFile, line: number): SymbolRecord | undefined {
  const exported = hasExportModifier(node);
  if (ts.isFunctionDeclaration(node) && node.name) return { name: node.name.text, kind: "function", line, exported };
  if (ts.isClassDeclaration(node) && node.name) return { name: node.name.text, kind: "class", line, exported };
  if (ts.isInterfaceDeclaration(node)) return { name: node.name.text, kind: "interface", line, exported };
  if (ts.isTypeAliasDeclaration(node)) return { name: node.name.text, kind: "type", line, exported };
  if (ts.isEnumDeclaration(node)) return { name: node.name.text, kind: "enum", line, exported };
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (declaration && ts.isIdentifier(declaration.name)) {
      return { name: declaration.name.text, kind: "variable", line, exported };
    }
  }
  if (ts.isExportAssignment(node)) {
    return { name: node.expression.getText(source).slice(0, 80), kind: "export", line, exported: true };
  }
  return undefined;
}

function hasExportModifier(node: ts.Node): boolean | undefined {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) || undefined;
}

function outlineMarkdown(text: string): { imports: ImportRecord[]; symbols: SymbolRecord[] } {
  const symbols = text.split(/\r?\n/).flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    return match ? [{ name: match[2].trim().slice(0, 120), kind: "markdown_heading" as const, line: index + 1 }] : [];
  });
  return { imports: [], symbols };
}

function edgeForImport(from: string, specifier: string, sourcePaths: Set<string>): ImportEdge {
  if (!specifier.startsWith(".")) {
    return { from, to: packageNameFor(specifier), specifier, kind: "external" };
  }
  const resolved = resolveLocalImport(from, specifier, sourcePaths);
  return resolved
    ? { from, to: resolved, specifier, kind: "local" }
    : { from, to: specifier, specifier, kind: "unresolved" };
}

function resolveLocalImport(from: string, specifier: string, sourcePaths: Set<string>): string | undefined {
  const base = posix.normalize(posix.join(dirname(from), specifier));
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}/index${extension}`)
  ];
  return candidates.find((candidate) => sourcePaths.has(candidate));
}

function packageNameFor(specifier: string): string {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

function shouldIncludeEdge(edge: ImportEdge, focusPaths: Set<string>, direction: "imports" | "imported_by" | "both"): boolean {
  if (focusPaths.size === 0) {
    return true;
  }
  if (direction === "imports") {
    return focusPaths.has(edge.from);
  }
  if (direction === "imported_by") {
    return focusPaths.has(edge.to);
  }
  return focusPaths.has(edge.from) || focusPaths.has(edge.to);
}

function hotspotSummary(edges: ImportEdge[]) {
  const counts = new Map<string, { path: string; imports: number; imported_by: number }>();
  for (const edge of edges.filter((candidate) => candidate.kind === "local")) {
    const from = counts.get(edge.from) ?? { path: edge.from, imports: 0, imported_by: 0 };
    from.imports += 1;
    counts.set(edge.from, from);
    const to = counts.get(edge.to) ?? { path: edge.to, imports: 0, imported_by: 0 };
    to.imported_by += 1;
    counts.set(edge.to, to);
  }
  return [...counts.values()]
    .sort((a, b) => b.imported_by + b.imports - (a.imported_by + a.imports) || a.path.localeCompare(b.path))
    .slice(0, 25);
}

function normalizeScripts(scripts: Record<string, unknown> | undefined) {
  return Object.entries(scripts ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, command]) => ({ name, command }));
}

function commandsForValidation(
  scripts: Array<{ name: string; command: string }>,
  packageManager: string | undefined,
  changedPaths: string[],
  goal?: string
) {
  const run = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : packageManager === "bun" ? "bun run" : "npm run";
  const commands: Array<{ command: string; reason: string; confidence: "low" | "medium" | "high" }> = [];
  const scriptNames = new Set(scripts.map((script) => script.name));
  const addScript = (name: string, reason: string, confidence: "low" | "medium" | "high") => {
    if (scriptNames.has(name)) {
      commands.push({ command: `${run} ${name}`, reason, confidence });
    }
  };

  addScript("check", "Project exposes a single aggregate validation script.", "high");
  if (commands.length === 0) {
    addScript("lint", "Linting catches style and static issues for source changes.", "medium");
    addScript("typecheck", "Type checking validates TypeScript contracts and service wiring.", "high");
    addScript("test", "The test script is the broadest detected behavioral validation.", "medium");
    addScript("build", "Build verifies emitted server and CLI artifacts.", "medium");
  }
  if (changedPaths.some((path) => path.includes("robinhood") || path.includes("openclaw"))) {
    addScript("check:robinhood-fixtures", "Changed paths mention Robinhood/OpenClaw fixtures or contracts.", "high");
  }
  if (goal && /prod|production|smoke/i.test(goal)) {
    addScript("smoke:prod", "Goal mentions production or smoke validation.", "medium");
  }
  return commands;
}

function affectedAreasFor(paths: string[]) {
  const areas = new Map<string, string[]>();
  for (const path of paths) {
    const area = path.startsWith("src/routes/")
      ? "routes"
      : path.startsWith("src/services/")
        ? "services"
        : path.startsWith("src/models/")
          ? "models"
          : path.startsWith("docs/")
            ? "docs"
            : path.startsWith("config/")
              ? "config"
              : path.split("/")[0] || ".";
    areas.set(area, [...(areas.get(area) ?? []), path]);
  }
  return [...areas.entries()].map(([area, areaPaths]) => ({ area, paths: areaPaths.slice(0, 20) }));
}

function selectAgentDocs(paths: string[], focus?: string) {
  const preferred = [
    "AGENTS.md",
    "CONTRIBUTING.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/QUALITY.md",
    "docs/SECURITY.md",
    "docs/architecture/system-overview.md",
    "docs/architecture/robinhood-agentic-trading.md",
    "docs/architecture/effect-foundation.md",
    "docs/runbook/robinhood-agentic-operations.md",
    "docs/runbook/openclaw-production.md"
  ];
  const focusLower = focus?.toLowerCase();
  const docs = [];
  for (const path of preferred) {
    if (paths.includes(path)) {
      docs.push({ path, reason: reasonForDoc(path) });
    }
  }
  for (const path of paths) {
    if (!path.startsWith("docs/") || !path.endsWith(".md") || docs.some((doc) => doc.path === path)) {
      continue;
    }
    if (focusLower && path.toLowerCase().includes(focusLower)) {
      docs.push({ path, reason: "Matches the requested focus." });
    }
  }
  return docs;
}

function reasonForDoc(path: string): string {
  if (path === "AGENTS.md") return "Repository-specific agent instructions.";
  if (path === "CONTRIBUTING.md") return "Contributor rules and validation expectations.";
  if (path === "README.md") return "Project overview and public interface.";
  if (path.includes("runbook")) return "Operational workflow and recovery guidance.";
  if (path.includes("architecture")) return "Architecture and subsystem context.";
  return "Relevant project guidance.";
}

function summarizeGuidance(text: string, focus?: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const focusLower = focus?.toLowerCase();
  const selected = focusLower
    ? lines.filter((line) => line.toLowerCase().includes(focusLower)).slice(0, 4)
    : lines.filter((line) => line.startsWith("#") || line.startsWith("-")).slice(0, 8);
  return (selected.length > 0 ? selected : lines.slice(0, 5)).join(" ").slice(0, 600);
}
