import type { RootRegistry } from "../services/root-registry.js";
import type { DEFAULT_LIMITS } from "../policies/limits.js";
import type { SessionCache } from "./session-cache.js";

export type ToolProfile = "core" | "full";

export type RuntimeContext = {
  registry: RootRegistry;
  limits: Required<typeof DEFAULT_LIMITS>;
  toolProfile: ToolProfile;
  cache: SessionCache;
};
