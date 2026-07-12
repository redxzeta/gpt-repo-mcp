import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RuntimeContext } from "../runtime/context.js";
import type { ToolDefinition } from "./catalog.js";
import { annotationsForEffect } from "./annotations.js";

export function registerCatalogTool(server: McpServer, context: RuntimeContext, tool: ToolDefinition): void {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema.shape,
      outputSchema: tool.outputSchema.shape,
      annotations: tool.annotations ?? annotationsForEffect(tool.effect)
    },
    async (args) => tool.handler(args, context)
  );
}
