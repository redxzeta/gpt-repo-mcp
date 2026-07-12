import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { toolCatalog } from "./tools/catalog.js";
import { registerCatalogTool } from "./tools/define-tool.js";
import { filterToolsByProfile } from "./tools/tool-profiles.js";
import type { RuntimeContext } from "./runtime/context.js";

export { SERVER_INSTRUCTIONS };

const { version: SERVER_VERSION } = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
) as { version: string };

export { SERVER_VERSION };

export function createMcpServer(context: RuntimeContext): McpServer {
  const server = new McpServer(
    {
      name: "gpt-repo-mcp",
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {}
      },
      instructions: SERVER_INSTRUCTIONS
    }
  );

  const tools = filterToolsByProfile(toolCatalog, context.toolProfile);
  for (const tool of tools) {
    registerCatalogTool(server, context, tool);
  }

  return server;
}
