import test from "node:test";
import assert from "node:assert/strict";

import {
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
    },
    _meta: {
      "x-ms-id": "012a108b-f8d7-465e-92d6-63228a9e7af4",
    },
  };

  assert.equal(mcpServerNameFromV0Entry(entry), "msdocs-mcp-server");
  assert.deepEqual(mcpServerFromV0Entry(entry), {
    transport: "sse",
    url: "https://learn.microsoft.com/api/mcp",
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
});
