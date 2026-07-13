import { open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type BoundedReadResult = {
  buffer: Buffer;
  truncated: boolean;
};

export async function readFilePrefix(absolutePath: string, maxBytes: number): Promise<BoundedReadResult> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return {
      buffer: buffer.subarray(0, Math.min(bytesRead, maxBytes)),
      truncated: bytesRead > maxBytes
    };
  } finally {
    await handle.close();
  }
}

export type LineRangeResult = {
  text: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  totalBytesRead: number;
};

export async function readLineRange(
  absolutePath: string,
  startLine: number,
  endLine: number,
  maxBytes: number
): Promise<LineRangeResult> {
  return new Promise<LineRangeResult>((resolve, reject) => {
    const lines: string[] = [];
    let totalLines = 0;
    let totalBytesRead = 0;
    let settled = false;

    const settle = (err: Error | null, result?: LineRangeResult) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result!);
    };

    const stream = createReadStream(absolutePath, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line: string) => {
      totalLines++;
      totalBytesRead += Buffer.byteLength(line, "utf8") + 1;

      if (totalBytesRead > maxBytes) {
        stream.destroy();
        settle(new Error("RANGE_SIZE_LIMIT_EXCEEDED"));
        return;
      }

      if (totalLines >= startLine && totalLines <= endLine) {
        lines.push(line);
      }

      if (totalLines > endLine) {
        rl.close();
        stream.destroy();
        settle(null, {
          text: lines.join("\n"),
          totalLines,
          startLine,
          endLine: Math.min(endLine, totalLines),
          totalBytesRead
        });
      }
    });

    rl.on("close", () => {
      settle(null, {
        text: lines.join("\n"),
        totalLines,
        startLine,
        endLine: Math.min(endLine, totalLines),
        totalBytesRead
      });
    });

    rl.on("error", (err) => {
      settle(err);
    });

    stream.on("error", (err) => {
      settle(err);
    });
  });
}
