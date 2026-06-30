import test from "node:test";
import assert from "node:assert/strict";
import {
  MarketplaceSchema as ClaudeMarketplaceSchema,
  PluginSchema as ClaudePluginSchema,
} from "@typeforged/claude-plugin-marketplaces/v1";

import {
  codexMcpJsonFromMcpJson,
  mcpServerFromV0Entry,
  mcpServerNameFromV0Entry,
  mcpServersFromServerJson,
} from "./marketplace.js";

test("translates stdio-style v0 server.json entries", () => {
  const server = mcpServerFromV0Entry({
    command: "npx",
    args: ["-y", "@example/server"],
    env: {
      API_KEY: "secret",
      PORT: 3000,
    },
  });

  assert.deepEqual(server, {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@example/server"],
    env: {
      API_KEY: "secret",
      PORT: "3000",
    },
  });
});

test("translates HTTP-style v0 server.json entries", () => {
  const server = mcpServerFromV0Entry({
    type: "streamable-http",
    url: "https://example.test/mcp",
    headers: {
      Authorization: "Bearer token",
    },
  });

  assert.deepEqual(server, {
    transport: "http",
    url: "https://example.test/mcp",
    headers: {
      Authorization: "Bearer token",
    },
  });
});

test("reads both mcpServers and servers roots", () => {
  assert.deepEqual(
    mcpServersFromServerJson({
      servers: {
        sample: {
          command: "node",
          args: ["server.js"],
        },
      },
    }),
    {
      sample: {
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      },
    },
  );
});

test("translates nested server remotes and uses nested name", () => {
  const entry = {
    server: {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "msdocs-mcp-server",
      title: "Microsoft docs",
      description: "AI assistant with real-time access to official Microsoft documentation.",
      version: "Original",
      remotes: [
        {
          type: "sse",
          url: "https://learn.microsoft.com/api/mcp",
        },
      ],
      _meta: {
        "custom.auth": {
          clientId: "client-id",
          publicClient: true,
        },
      },
    },
    _meta: {
      "registry.id": "placeholder-id",
      "custom.auth": {
        clientId: "wrong-level",
      },
    },
  };

  assert.equal(mcpServerNameFromV0Entry(entry), "msdocs-mcp-server");
  assert.deepEqual(mcpServerFromV0Entry(entry), {
    transport: "sse",
    url: "https://learn.microsoft.com/api/mcp",
  });
  assert.deepEqual(mcpServerFromV0Entry(entry, {
    metaKeys: ["custom.auth", "registry.id"],
  }), {
    transport: "sse",
    url: "https://learn.microsoft.com/api/mcp",
    clientId: "client-id",
    publicClient: true,
  });
});

test("falls back to first package when nested server has no remotes", () => {
  const entry = {
    server: {
      name: "pkg-server",
      packages: [
        {
          registryType: "npm",
          identifier: "@example/pkg-server",
          version: "1.2.3",
          transport: {
            type: "stdio",
          },
          environmentVariables: [
            {
              name: "API_KEY",
              value: "secret",
            },
          ],
          packageArguments: [
            {
              type: "named",
              name: "--mode",
              value: "test",
            },
          ],
        },
      ],
    },
    _meta: {
      "oauth-client": {
        client_name: "example",
      },
      ignored: true,
    },
  };

  assert.equal(mcpServerNameFromV0Entry(entry), "pkg-server");
  assert.deepEqual(mcpServerFromV0Entry(entry), {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@example/pkg-server@1.2.3", "--mode", "test"],
    env: {
      API_KEY: "secret",
    },
  });
  assert.deepEqual(mcpServerFromV0Entry(entry, {
    metaKeys: ["oauth-client"],
  }), {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@example/pkg-server@1.2.3", "--mode", "test"],
    env: {
      API_KEY: "secret",
    },
    client_name: "example",
  });
});

test("projects MCP config to Codex format and drops extra properties", () => {
  assert.deepEqual(
    codexMcpJsonFromMcpJson({
      mcpServers: {
        remote: {
          transport: "sse",
          url: "https://example.test/mcp",
          headers: {
            Authorization: "Bearer token",
          },
          oauthClientId: "client-id",
          oauthPublicClient: true,
        },
        stdio: {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@example/server"],
          env: {
            API_KEY: "secret",
          },
          cwd: "/tmp/example",
          extra: "ignored",
        },
      },
    }),
    {
      mcp_servers: {
        remote: {
          transport: "sse",
          url: "https://example.test/mcp",
          headers: {
            Authorization: "Bearer token",
          },
        },
        stdio: {
          command: "npx",
          args: ["-y", "@example/server"],
          env: {
            API_KEY: "secret",
          },
          cwd: "/tmp/example",
        },
      },
    },
  );
});

test("current Claude plugin manifest shape matches typeforged schema", () => {
  const currentPluginJson = {
    name: "example-plugin",
    description: "Example plugin",
    version: "1.0.0",
    mcpServers: "./.mcp.json",
    skills: ["./skills/"],
  };

  assert.deepEqual(
    ClaudePluginSchema.parse(currentPluginJson),
    currentPluginJson,
  );
});

test("current Claude marketplace manifest shape matches typeforged schema", () => {
  const currentMarketplaceJson = {
    name: "Example Marketplace",
    metadata: {
      description: "Example marketplace",
      version: "1.0.0",
    },
    owner: {
      name: "Example Owner",
    },
    plugins: [
      {
        name: "example-plugin",
        source: "./plugins/example-plugin",
        description: "Example plugin",
        version: "1.0.0",
        skills: [],
      },
    ],
  };

  assert.deepEqual(
    ClaudeMarketplaceSchema.parse(currentMarketplaceJson),
    {
      ...currentMarketplaceJson,
      plugins: currentMarketplaceJson.plugins.map(plugin => ({
        ...plugin,
        strict: true,
      })),
    },
  );
});
