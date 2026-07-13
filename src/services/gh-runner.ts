import { spawn } from "node:child_process";

export type GhRunResult = {
  stdout: string;
  stderr: string;
};

export type GhRunOptions = {
  cwd?: string;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  timeoutMs?: number;
};

export type GhRunner = {
  run(command: string, args: string[], options?: GhRunOptions): Promise<GhRunResult>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

export function createGhRunner(defaults?: { timeoutMs?: number; maxBuffer?: number }): GhRunner {
  const timeoutMs = defaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = defaults?.maxBuffer ?? DEFAULT_MAX_BUFFER;

  return {
    run(command: string, args: string[], options?: GhRunOptions): Promise<GhRunResult> {
      const cwd = options?.cwd;
      const bufLimit = options?.maxBuffer ?? maxBuffer;
      const timeLimit = options?.timeoutMs ?? timeoutMs;

      return new Promise<GhRunResult>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
          }
        };

        const settle = (err: Error | null, stdout: string, stderr: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (err) {
            reject(err);
          } else {
            resolve({ stdout, stderr });
          }
        };

        const env: Record<string, string | undefined> = {
          ...process.env,
          GH_NO_INTERACTION: "1",
          GIT_TERMINAL_PROMPT: "0"
        };

        const child = spawn(command, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"]
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let killed = false;

        child.stdout?.on("data", (chunk: Buffer) => {
          stdoutBytes += chunk.length;
          if (stdoutBytes <= bufLimit) {
            stdoutChunks.push(chunk);
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          stderrBytes += chunk.length;
          if (stderrBytes <= bufLimit) {
            stderrChunks.push(chunk);
          }
        });

        child.on("error", (err) => {
          settle(err, "", "");
        });

        child.on("close", (code, signal) => {
          if (settled) return;
          const stdout = Buffer.concat(stdoutChunks).toString("utf8");
          const stderr = Buffer.concat(stderrChunks).toString("utf8");
          cleanup();

          if (killed) {
            const timeoutErr = new Error(`Process timed out after ${timeLimit}ms: ${command} ${args.slice(0, 2).join(" ")}`);
            (timeoutErr as Error & { code?: string }).code = "GH_TIMEOUT";
            settle(timeoutErr, stdout, stderr);
            return;
          }

          if (signal === "SIGTERM" || signal === "SIGKILL") {
            const termErr = new Error(`Process killed with ${signal}: ${command}`);
            (termErr as Error & { code?: string }).code = "GH_PROCESS_KILLED";
            settle(termErr, stdout, stderr);
            return;
          }

          if (code !== 0) {
            const exitErr = new Error(`Command failed with exit code ${code}: ${command}`);
            (exitErr as Error & { code?: string; exitCode?: number }).code = "GH_NONZERO_EXIT";
            (exitErr as Error & { exitCode?: number }).exitCode = code ?? undefined;
            settle(exitErr, stdout, stderr);
            return;
          }

          settle(null, stdout, stderr);
        });

        timer = setTimeout(() => {
          if (settled || !child) return;
          killed = true;
          try {
            child.kill("SIGTERM");
            setTimeout(() => {
              if (child && !child.killed) {
                child.kill("SIGKILL");
              }
            }, 2000);
          } catch {
            // process may already be gone
          }
        }, timeLimit);
      });
    }
  };
}

export const defaultGhRunner = createGhRunner();
