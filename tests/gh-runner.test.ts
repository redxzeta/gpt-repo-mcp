import { describe, expect, test } from "vitest";
import { createGhRunner } from "../src/services/gh-runner.js";

describe("GhRunner", () => {
  test("successful execution returns stdout", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    const result = await runner.run("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.stderr).toBe("");
  });

  test("nonzero exit rejects with GH_NONZERO_EXIT", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    await expect(runner.run("sh", ["-c", "exit 42"])).rejects.toMatchObject({
      code: "GH_NONZERO_EXIT"
    });
  });

  test("missing executable rejects with error", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    await expect(runner.run("nonexistent_binary_xyz_12345", [])).rejects.toThrow();
  });

  test("timeout rejects with GH_TIMEOUT", async () => {
    const runner = createGhRunner({ timeoutMs: 500 });
    await expect(runner.run("sleep", ["10"])).rejects.toMatchObject({
      code: "GH_TIMEOUT"
    });
  }, 5000);

  test("process that never exits is terminated at timeout", async () => {
    const runner = createGhRunner({ timeoutMs: 300 });
    const start = Date.now();
    await expect(runner.run("sleep", ["10"])).rejects.toMatchObject({ code: "GH_TIMEOUT" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  }, 5000);

  test("excessive stdout is bounded by maxBuffer", async () => {
    const runner = createGhRunner({ timeoutMs: 5000, maxBuffer: 1024 });
    const result = await runner.run("dd", ["if=/dev/zero", "bs=1024", "count=10"]);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(1024);
  });

  test("fixed argv: arguments are passed as array", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    const result = await runner.run("printf", ["%s\n%s\n", "arg1", "arg2"]);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toEqual(["arg1", "arg2"]);
  });

  test("sets GH_NO_INTERACTION=1 in environment", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    const result = await runner.run("printenv", ["GH_NO_INTERACTION"]);
    expect(result.stdout.trim()).toBe("1");
  });

  test("sets GIT_TERMINAL_PROMPT=0 in environment", async () => {
    const runner = createGhRunner({ timeoutMs: 5000 });
    const result = await runner.run("printenv", ["GIT_TERMINAL_PROMPT"]);
    expect(result.stdout.trim()).toBe("0");
  });
});
