import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { types } from "../shared/index.js";

const execFileAsync = promisify(execFile);

export class ApiCenterClient {
  get serviceName() { return this.info.serviceName; }
  get region() { return this.info.region; }
  get workspaceName() { return this.info.workspaceName; }

  constructor(public readonly info: types.WorkspaceInfo) { }

  plane(plane: types.PlaneType) {
    return `https://${this.serviceName}.${plane}.${this.region}.azure-apicenter.ms`;
  }

  path(plane: types.PlaneType, path: string) {
    return `${this.plane(plane)}/${path}`;
  }

  url(plane: types.PlaneType, path: string, params: Record<string, unknown> = {}) {
    const url = new URL(this.path(plane, path));
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, `${value}`);
    return url.toString();
  }

  workspace(path: string, params: Record<string, unknown> = {}) {
    return this.url("data", `workspaces/${this.workspaceName}/${path}`, params);
  }

  async get<T>(url: string) {
    const response = await fetch(url);
    const body = await response.text();
    try {
      if (!response.ok) throw Error(`Could not read config from ${url}`);
      return JSON.parse(body) as T;
    } catch (e) {
      throw Error(`url: ${url}, e: ${e}, body: ${body}`);
    }
  }

  async *paged<T>(url: string) {
    let nextLink = url;
    do {
      const result = await this.get<types.PagedResponse<T>>(nextLink);
      if (result.value?.length > 0)
        yield result.value;
      nextLink = result.nextLink ?? "";
    } while (nextLink);
  }

  async config() {
    return this.get<types.PortalConfig>(this.url("portal", "config.json"));
  }

  apis($top = 50, $skip?: number) {
    return this.paged<types.ApiAssetItem>(this.workspace("apis", { $top, $skip }));
  }

  async plugin(name: string) {
    return this.get<types.PluginAsset>(this.workspace(`plugins/${name}`));
  }

  async mcp(resourceId: string) {
    return this.get<types.McpAsset>(this.url("data", resourceId));
  }

  async v0Server(name: string) {
    return this.get<types.V0ServerEntryResponse>(this.workspace(`v0/servers/${name}`));
  }
}

function sanitizeName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

function sanitizeKebabName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    result[key] = `${item}`;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const result = value.map(item => `${item}`);
  return result.length > 0 ? result : undefined;
}

function asObjectArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asObject).filter((item): item is Record<string, unknown> => !!item);
}

function pickObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  for (const key of keys) {
    if (key in value) {
      const candidate = (value as Record<string, unknown>)[key];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate))
        return candidate as Record<string, unknown>;
    }
  }
  return undefined;
}

function pickString(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function pickTransport(entry: Record<string, unknown>) {
  const transport = pickString(entry, ["transport", "type", "protocol"]);
  if (!transport) return undefined;
  if (transport === "stdio") return "stdio";
  if (transport === "sse") return "sse";
  if (transport === "streamable-http" || transport === "http" || transport === "https")
    return "http";
  return undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function pickRequestedMeta(
  entry: types.V0ServerJsonEntry,
  metaKeys: string[] = [],
) {
  if (metaKeys.length === 0) return undefined;

  const record = asObject(entry);
  const nestedServer = asObject(record?.server);
  const metaSources = [
    asObject(nestedServer?._meta),
    asObject(record?._meta),
  ].filter((value): value is Record<string, unknown> => !!value);

  if (metaSources.length === 0) return undefined;

  const requested: Record<string, unknown> = {};
  for (const key of metaKeys) {
    for (const source of metaSources) {
      if (key in source) {
        requested[key] = source[key];
        break;
      }
    }
  }

  return Object.keys(requested).length > 0 ? requested : undefined;
}

function flattenRequestedMeta(
  entry: types.V0ServerJsonEntry,
  metaKeys: string[] = [],
) {
  const requestedMeta = pickRequestedMeta(entry, metaKeys);
  if (!requestedMeta) return undefined;

  const flattened: Record<string, unknown> = {};
  for (const value of Object.values(requestedMeta)) {
    const record = asObject(value);
    if (!record) continue;
    Object.assign(flattened, record);
  }

  return Object.keys(flattened).length > 0 ? flattened : undefined;
}

function argumentValue(argument: Record<string, unknown>) {
  const value = argument.value;
  if (value === undefined || value === null) return undefined;
  return `${value}`;
}

function packageEnv(packageEntry: Record<string, unknown>) {
  const environmentVariables = asObjectArray(packageEntry.environmentVariables);
  if (environmentVariables.length === 0) return undefined;

  const result: Record<string, string> = {};
  for (const variable of environmentVariables) {
    const name = pickString(variable, ["name"]);
    const value = argumentValue(variable);
    if (!name || value === undefined) continue;
    result[name] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function packageArgs(packageEntry: Record<string, unknown>) {
  const runtimeArguments = asObjectArray(packageEntry.runtimeArguments);
  const packageArguments = asObjectArray(packageEntry.packageArguments);
  const identifier = pickString(packageEntry, ["identifier"]);
  const version = pickString(packageEntry, ["version"]);
  const registryType = pickString(packageEntry, ["registryType"]);
  const command = pickString(packageEntry, ["runtimeHint"])
    ?? (registryType === "npm" ? "npx"
      : registryType === "pypi" ? "uvx"
        : registryType === "oci" ? "docker"
          : registryType === "nuget" ? "dnx"
            : undefined);

  const args: string[] = [];

  for (const argument of runtimeArguments) {
    const type = pickString(argument, ["type"]);
    const name = pickString(argument, ["name"]);
    const value = argumentValue(argument);

    if (type === "named" && name) {
      if (value === undefined || value === "true") {
        args.push(name);
      } else if (value !== "false") {
        args.push(name, value);
      }
      continue;
    }

    if (value !== undefined)
      args.push(value);
  }

  if (identifier) {
    if (command === "npx") {
      args.push("-y", version ? `${identifier}@${version}` : identifier);
    } else if (command === "uvx" || command === "dnx") {
      args.push(version ? `${identifier}@${version}` : identifier);
    } else if (command === "docker") {
      args.push("run", "--rm", version ? `${identifier}:${version}` : identifier);
    } else {
      args.push(version ? `${identifier}@${version}` : identifier);
    }
  }

  for (const argument of packageArguments) {
    const type = pickString(argument, ["type"]);
    const name = pickString(argument, ["name"]);
    const value = argumentValue(argument);

    if (type === "named" && name) {
      if (value === undefined || value === "true") {
        args.push(name);
      } else if (value !== "false") {
        args.push(name, value);
      }
      continue;
    }

    if (value !== undefined)
      args.push(value);
  }

  return {
    command,
    args: args.length > 0 ? args : undefined,
    env: packageEnv(packageEntry),
  };
}

function normalizeServerEntry(entry: types.V0ServerJsonEntry): Record<string, unknown> | undefined {
  const record = asObject(entry);
  if (!record) return undefined;

  const nestedServer = asObject(record.server);
  if (!nestedServer) return record;

  const remotes = asObjectArray(nestedServer.remotes);
  const primaryRemote = remotes.length > 0 ? remotes[0] : undefined;
  const packages = asObjectArray(nestedServer.packages);
  const primaryPackage = packages.length > 0 ? packages[0] : undefined;
  const packageTransport = asObject(primaryPackage?.transport);
  const packageLaunch = primaryPackage ? packageArgs(primaryPackage) : undefined;

  return compactObject({
    ...record,
    ...nestedServer,
    transport: pickString(primaryRemote, ["type"])
      ?? pickString(packageTransport, ["type", "transport"])
      ?? pickString(nestedServer, ["transport", "type"]),
    url: pickString(primaryRemote, ["url"])
      ?? pickString(packageTransport, ["url"])
      ?? pickString(nestedServer, ["url"]),
    headers: primaryRemote?.headers ?? packageTransport?.headers ?? nestedServer.headers,
    command: packageLaunch?.command ?? pickString(nestedServer, ["command", "cmd"]),
    args: packageLaunch?.args ?? nestedServer.args,
    env: packageLaunch?.env ?? nestedServer.env,
  });
}

export function mcpServerNameFromV0Entry(entry: types.V0ServerJsonEntry) {
  const record = normalizeServerEntry(entry);
  const name = pickString(record, ["name"]);
  if (!name) {
    throw new Error(
      `Could not determine MCP server name from v0 server.json entry:\n${JSON.stringify(entry, null, 2)}`,
    );
  }
  return name;
}

export function mcpServerFromV0Entry(
  entry: types.V0ServerJsonEntry,
  options: types.GenerateMcpServerOptions = {},
): types.McpServer {
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new Error("v0 server.json entry must be an object");

  const record = normalizeServerEntry(entry);
  if (!record)
    throw new Error("v0 server.json entry must be an object");

  const meta = flattenRequestedMeta(entry, options.metaKeys);
  const transport = pickTransport(record);
  const command = pickString(record, ["command", "cmd"]);
  const url = pickString(record, ["url", "endpoint"]);

  if (transport === "stdio" || command) {
    if (!command) throw new Error("stdio MCP server entry is missing command");

    return compactObject({
      transport: "stdio",
      command,
      args: asStringArray(record.args),
      env: asStringRecord(record.env),
      cwd: pickString(record, ["cwd"]),
      ...meta,
    }) as types.McpServer;
  }

  if (transport === "http" || transport === "sse" || url) {
    if (!url) throw new Error("HTTP MCP server entry is missing url");

    return compactObject({
      transport: transport === "sse" ? "sse" : "http",
      url,
      headers: asStringRecord(record.headers),
      ...meta,
    }) as types.McpServer;
  }

  throw new Error(
    `Could not determine MCP server transport from v0 server.json entry:\n${JSON.stringify(entry, null, 2)}`,
  );
}

export function mcpServersFromServerJson(serverJson: types.ServerJson) {
  const entries = serverJson.mcpServers ?? serverJson.servers ?? {};
  return Object.fromEntries(
    Object.entries(entries).map(([name, entry]) => [name, mcpServerFromV0Entry(entry)]),
  ) satisfies Record<string, types.McpServer>;
}

export function codexMcpFromMcpServer(server: types.McpServer): types.CodexMcp {
  if (server.transport === "stdio") {
    return compactObject({
      type: "stdio",
      command: server.command,
      args: asStringArray(server.args),
      env: asStringRecord(server.env),
      cwd: pickString(server, ["cwd"]),
    }) satisfies types.CodexMcp;
  }

  return compactObject({
    type: server.transport,
    url: server.url,
    headers: asStringRecord(server.headers),
  }) satisfies types.CodexMcp;
}

export function codexMcpJsonFromMcpJson(mcpJson: types.McpJson): types.CodexMcpJson {
  return {
    mcp_servers: Object.fromEntries(
      Object.entries(mcpJson.mcpServers).map(([name, server]) => [name, codexMcpFromMcpServer(server)]),
    ),
  };
}

type PluginBuildResult = {
  mcpJson: types.McpJson;
  codexMcpJson: types.CodexMcpJson;
  pluginJson: types.PluginJson;
  codexPluginJson: types.CodexPluginJson;
  marketplaceEntry: types.MarketplacePluginJson;
  codexMarketplaceEntry: types.CodexMarketplacePluginJson;
};

async function buildPlugin(
  client: ApiCenterClient,
  plugin: types.PluginAsset,
  options: types.GenerateMcpServerOptions = {},
): Promise<PluginBuildResult> {
  const pluginName = sanitizeName(plugin.name);
  const codexPluginName = sanitizeKebabName(plugin.name);
  const mcpServers: Record<string, types.McpServer> = {};

  for (const resource of plugin.resources) {
    if (resource.kind !== "mcp") continue;

    const mcpAsset = await client.mcp(resource.resourceId);
    const serverEntry = await client.v0Server(mcpAsset.name);
    mcpServers[mcpServerNameFromV0Entry(serverEntry)] = mcpServerFromV0Entry(serverEntry, options);
  }

  const skills: string[] = [];
  const pluginJson: types.PluginJson = {
    name: plugin.name,
    description: plugin.description || plugin.summary,
    version: plugin.version,
  };
  const codexPluginJson: types.CodexPluginJson = {
    name: codexPluginName,
    description: plugin.description || plugin.summary,
    version: plugin.version,
    interface: {
      displayName: plugin.title || plugin.name,
      shortDescription: plugin.description || plugin.summary,
      developerName: "Azure API Center",
      category: "Developer Tools",
    },
  };
  const mcpJson: types.McpJson = { mcpServers };

  if (Object.keys(mcpServers).length > 0) {
    pluginJson.mcpServers = "./.mcp.json";
    codexPluginJson.mcpServers = "./.codex.mcp.json";
  }

  if (skills.length > 0) {
    pluginJson.skills = ["./skills/"];
    codexPluginJson.skills = "./skills/";
  }

  return {
    mcpJson,
    codexMcpJson: codexMcpJsonFromMcpJson(mcpJson),
    pluginJson,
    codexPluginJson,
    marketplaceEntry: {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description || plugin.summary,
      source: `./plugins/${pluginName}`,
      skills,
    },
    codexMarketplaceEntry: {
      name: codexPluginName,
      source: {
        source: "local",
        path: `./plugins/${pluginName}`,
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_USE",
      },
      category: "Developer Tools",
      interface: {
        displayName: plugin.title || plugin.name,
        description: plugin.description || plugin.summary,
      },
    },
  };
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function zipDirectory(sourceDir: string, outputPath: string) {
  await execFileAsync("zip", ["-rq", outputPath, "."], { cwd: sourceDir });
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export type GenerateMarketplaceGitOptions = {
  unpack?: string;
  mcpMetaKeys?: string[];
};

export async function generateMarketplaceGit(
  info: types.WorkspaceInfo,
  options: GenerateMarketplaceGitOptions = {},
) {
  const client = new ApiCenterClient(info);
  const config = await client.config();
  const tempRoot = await mkdtemp(join(tmpdir(), "gen-apic-mp-"));
  const marketplaceRoot = join(tempRoot, "marketplace");
  const marketplacePlugins: types.MarketplacePluginJson[] = [];
  const codexMarketplacePlugins: types.CodexMarketplacePluginJson[] = [];

  try {
    for await (const page of client.apis()) {
      for (const item of page) {
        if (item.kind !== "plugin") continue;

        const pluginAsset = await client.plugin(item.name);
        const built = await buildPlugin(client, pluginAsset, { metaKeys: options.mcpMetaKeys });
        const pluginDir = join(marketplaceRoot, "plugins", sanitizeName(pluginAsset.name));

        marketplacePlugins.push(built.marketplaceEntry);
        codexMarketplacePlugins.push(built.codexMarketplaceEntry);
        await writeJson(join(pluginDir, "plugin.json"), built.pluginJson);
        await writeJson(join(pluginDir, ".codex-plugin", "plugin.json"), built.codexPluginJson);
        await writeJson(join(pluginDir, ".mcp.json"), built.mcpJson);
        await writeJson(join(pluginDir, ".codex.mcp.json"), built.codexMcpJson);
      }
    }

    const marketplaceJson: types.MarketplaceJson = {
      name: config.title,
      metadata: {
        description: `MCP server plugins from ${config.title}`,
        version: "1.0.0",
      },
      owner: {
        name: config.title,
      },
      plugins: marketplacePlugins,
    };
    const codexMarketplaceJson: types.CodexMarketplaceJson = {
      name: sanitizeKebabName(info.workspaceName || config.title),
      interface: {
        displayName: config.title,
      },
      plugins: codexMarketplacePlugins,
    };

    await writeJson(join(marketplaceRoot, ".github", "plugin", "marketplace.json"), marketplaceJson);
    await writeJson(join(marketplaceRoot, ".claude-plugin", "marketplace.json"), marketplaceJson);
    await writeJson(join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), codexMarketplaceJson);

    const unpackPath = options.unpack ? resolve(options.unpack) : undefined;
    if (unpackPath) {
      await mkdir(unpackPath, { recursive: true });
      await cp(marketplaceRoot, unpackPath, { recursive: true, force: true });
    }
    const zipPath = unpackPath
      ? undefined
      : join(process.cwd(), `${sanitizeName(info.workspaceName)}-marketplace.zip`);
    if (zipPath) {
      await rm(zipPath, { force: true });
      await zipDirectory(marketplaceRoot, zipPath);
    }

    const marketplacePreview = await readFile(
      join(marketplaceRoot, ".github", "plugin", "marketplace.json"),
      "utf8",
    );

    return {
      zipPath,
      unpackPath,
      pluginCount: marketplacePlugins.length,
      marketplaceJson: JSON.parse(marketplacePreview) as types.MarketplaceJson,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const currentWorkingPackageSentinel = "__CURRENT_WORKING_PACKAGE__";

export async function resolveUnpackDirectory(value: string | undefined) {
  if (!value) return undefined;

  if (value === currentWorkingPackageSentinel) {
    const packageJsonPath = join(process.cwd(), "package.json");
    if (!await pathExists(packageJsonPath)) {
      throw new Error(
        `--unpack without a path defaults to the current directory, but no package.json was found at ${packageJsonPath}`,
      );
    }

    return process.cwd();
  }

  return resolve(value);
}
