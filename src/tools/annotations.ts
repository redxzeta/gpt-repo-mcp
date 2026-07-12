export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true
} as const;

export const externalReadOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: true
} as const;

export const externalWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: false
} as const;

export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: false
} as const;

export type ToolEffect =
  | "local-read"
  | "external-read"
  | "local-write"
  | "external-write"
  | "process-read"
  | "process-write";

export function annotationsForEffect(effect: ToolEffect) {
  switch (effect) {
    case "local-read":
      return readOnlyAnnotations;
    case "external-read":
      return externalReadOnlyAnnotations;
    case "external-write":
      return externalWriteAnnotations;
    case "local-write":
    case "process-read":
    case "process-write":
      return writeAnnotations;
  }
}
