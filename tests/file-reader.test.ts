import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FileReader } from "../src/services/file-reader.js";
import { PathSandbox } from "../src/services/path-sandbox.js";
import { createRepoFixture } from "./fixtures/repo-fixture.js";

describe("FileReader", () => {
  test("reads a normal text file with line bounds and metadata", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const result = await reader.read({ path: "src/app.ts", start_line: 2, end_line: 2 });

    expect(result.path).toBe("src/app.ts");
    expect(result.language).toBe("typescript");
    expect(result.total_lines).toBe(3);
    expect(result.start_line).toBe(2);
    expect(result.end_line).toBe(2);
    expect(result.text).toBe("  return fetch('/api/users');");
    expect(typeof result.sha256).toBe("string");
  });

  test("blocks secret candidates even when default excludes are overridden", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: ".env", override_default_excludes: true })).rejects.toMatchObject({
      code: "SECRET_CANDIDATE_BLOCKED"
    });
  });

  test("reads safe files whose paths mention secret or credential", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));
    await writeFile(join(fixture.root, "docs", "secret-management.md"), "# Secret Management\nUse placeholders.\n");

    const result = await reader.read({ path: "docs/secret-management.md" });

    expect(result.path).toBe("docs/secret-management.md");
    expect(result.text).toContain("Use placeholders.");
  });

  test("still blocks files inside secrets directories", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));
    await mkdir(join(fixture.root, "secrets"), { recursive: true });
    await writeFile(join(fixture.root, "secrets", "foo.txt"), "not secret\n");

    await expect(reader.read({ path: "secrets/foo.txt" })).rejects.toMatchObject({
      code: "SECRET_CANDIDATE_BLOCKED"
    });
  });

  test("reads public env templates with placeholder-safe content", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));
    const safeContent = [
      "GPT_REPO_CONFIG=./config.local.json",
      "PORT=8787",
      "CONTROL_PLANE_API_KEY=",
      "TUNNEL_CLIENT_BIN=/path/to/tunnel-client",
      ""
    ].join("\n");

    for (const path of [".env.example", ".env.sample", ".env.template", "example.env"]) {
      await writeFile(join(fixture.root, path), safeContent);
      const result = await reader.read({ path, override_default_excludes: true });
      expect(result.path).toBe(path);
      expect(result.text).toContain("GPT_REPO_CONFIG=./config.local.json");
      expect(result.text).toContain("CONTROL_PLANE_API_KEY=");
    }
  });

  test("still blocks real env files and arbitrary env suffixes", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));
    await writeFile(join(fixture.root, ".env.local"), "PORT=8787\n");
    await writeFile(join(fixture.root, ".env.production"), "PORT=8787\n");
    await writeFile(join(fixture.root, ".env.anything"), "PORT=8787\n");

    for (const path of [".env", ".env.local", ".env.production", ".env.anything"]) {
      await expect(reader.read({ path, override_default_excludes: true })).rejects.toMatchObject({
        code: "SECRET_CANDIDATE_BLOCKED"
      });
    }
  });

  test("blocks public env templates containing secret-looking values", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));
    await writeFile(join(fixture.root, ".env.example"), "OPENAI_API_KEY=sk-realSecretValue123\n");

    await expect(reader.read({ path: ".env.example", override_default_excludes: true })).rejects.toMatchObject({
      code: "SECRET_CANDIDATE_BLOCKED"
    });
  });

  test("blocks binary files", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "binary.bin" })).rejects.toMatchObject({
      code: "BINARY_FILE_REJECTED"
    });
  });

  test("allows generated files only with an explicit override warning", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "dist/bundle.js" })).rejects.toMatchObject({
      code: "DEFAULT_EXCLUDE_BLOCKED"
    });

    const result = await reader.read({ path: "dist/bundle.js", override_default_excludes: true });
    expect(result.warnings).toEqual(["Read default-excluded path with override: dist/bundle.js"]);
  });

  test("enforces max_bytes on full read", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "src/app.ts", max_bytes: 10 })).rejects.toMatchObject({
      code: "SIZE_LIMIT_EXCEEDED"
    });
  });
});

describe("FileReader ranged reads", () => {
  test("small range from large file succeeds", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const lines = Array.from({ length: 5000 }, (_, i) => `line-${i + 1}: content for line ${i + 1}`);
    await writeFile(join(fixture.root, "large.txt"), lines.join("\n") + "\n");

    const result = await reader.read({ path: "large.txt", start_line: 100, end_line: 110 });

    expect(result.path).toBe("large.txt");
    expect(result.start_line).toBe(100);
    expect(result.end_line).toBe(110);
    expect(result.text.split("\n")).toHaveLength(11);
    expect(result.text).toContain("line-100: content for line 100");
    expect(result.text).toContain("line-110: content for line 110");
  });

  test("unbounded read of large file triggers size protection", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const lines = Array.from({ length: 10000 }, (_, i) => `line-${i + 1}: ${"x".repeat(20)}`);
    await writeFile(join(fixture.root, "large.txt"), lines.join("\n") + "\n");

    await expect(reader.read({ path: "large.txt" })).rejects.toMatchObject({
      code: "SIZE_LIMIT_EXCEEDED"
    });
  });

  test("range at beginning of large file returns correct lines", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const lines = Array.from({ length: 5000 }, (_, i) => `line-${i + 1}`);
    await writeFile(join(fixture.root, "large.txt"), lines.join("\n") + "\n");

    const result = await reader.read({ path: "large.txt", start_line: 1, end_line: 3 });

    expect(result.start_line).toBe(1);
    expect(result.end_line).toBe(3);
    expect(result.text).toBe("line-1\nline-2\nline-3");
  });

  test("range at end of large file returns correct lines", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const lines = Array.from({ length: 5000 }, (_, i) => `line-${i + 1}`);
    await writeFile(join(fixture.root, "large.txt"), lines.join("\n") + "\n");

    const result = await reader.read({ path: "large.txt", start_line: 4998, end_line: 5000 });

    expect(result.start_line).toBe(4998);
    expect(result.end_line).toBe(5000);
    expect(result.text).toBe("line-4998\nline-4999\nline-5000");
  });

  test("excessively large range is rejected", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const lines = Array.from({ length: 10000 }, (_, i) => `line-${i + 1}: ${"x".repeat(50)}`);
    await writeFile(join(fixture.root, "large.txt"), lines.join("\n") + "\n");

    await expect(reader.read({ path: "large.txt", start_line: 1, end_line: 10000 })).rejects.toMatchObject({
      code: "SIZE_LIMIT_EXCEEDED"
    });
  });

  test("invalid range (start > end) returns empty or corrected range", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const result = await reader.read({ path: "src/app.ts", start_line: 3, end_line: 2 });
    expect(result.start_line).toBe(3);
    expect(result.end_line).toBe(2);
    expect(result.text).toBe("");
  });

  test("start_line only reads from start_line to end of file", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const result = await reader.read({ path: "src/app.ts", start_line: 3 });

    expect(result.start_line).toBe(3);
    expect(result.text).toContain("}");
  });

  test("end_line only reads from beginning to end_line", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const result = await reader.read({ path: "src/app.ts", end_line: 2 });

    expect(result.start_line).toBe(1);
    expect(result.end_line).toBe(2);
    expect(result.text).toContain("export function rawFetch() {");
    expect(result.text).toContain("  return fetch('/api/users');");
  });

  test("binary file blocked even with range", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "binary.bin", start_line: 1, end_line: 1 })).rejects.toMatchObject({
      code: "BINARY_FILE_REJECTED"
    });
  });

  test("path security checks still pass for ranged reads", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "../outside/secret.txt", start_line: 1, end_line: 1 })).rejects.toMatchObject({
      code: "PATH_TRAVERSAL_REJECTED"
    });
  });

  test("default exclude checks still pass for ranged reads", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    await expect(reader.read({ path: "dist/bundle.js", start_line: 1, end_line: 1 })).rejects.toMatchObject({
      code: "DEFAULT_EXCLUDE_BLOCKED"
    });
  });

  test("ranged read of small file works correctly", async () => {
    const fixture = await createRepoFixture();
    const reader = new FileReader(new PathSandbox(fixture.root));

    const result = await reader.read({ path: "src/app.ts", start_line: 1, end_line: 2 });

    expect(result.start_line).toBe(1);
    expect(result.end_line).toBe(2);
    expect(result.text).toContain("export function rawFetch() {");
    expect(result.text).toContain("  return fetch('/api/users');");
  });
});
