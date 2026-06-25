export type WorkspaceInfo = {
  serviceName: string;
  region: string;
  workspaceName: string;
};

export type PortalConfig = {
  dataApiHostName: string;
  title: string;
  capabilities: [];
};

export type JsonObject = Record<string, unknown>;

export type McpAssetItem = {
  name: string;
  title: string;
  summary: string;
  description: string;
  kind: 'mcp';
  lifecycleStage: string;
  externalDocumentation: [];
  contacts: [];
  customProperties: JsonObject;
  lastUpdated: string;
};

export type PluginAssetItem = {
  name: string;
  title: string;
  description: string;
  kind: 'plugin';
  lifecycleStage: string;
  externalDocumentation: [];
  contacts: [];
  customProperties: JsonObject;
  lastUpdated: string;
};

export type ApiAssetItem =
  | McpAssetItem
  | PluginAssetItem;

export type PluginMcpResource = {
  resourceId: string;
  title: string;
  summary: string;
  kind: 'mcp';
};

export type PluginResource =
  | PluginMcpResource;

export type PluginAsset = {
  name: string;
  title: string;
  summary: string;
  description: string;
  version: string;
  resources: PluginResource[];
  customProperties?: JsonObject;
};

export type PagedResponse<T> = {
  value: T[];
  nextLink?: string;
};

export type PlaneType = 'portal' | 'data';

export type V0HttpTransport = {
  transport?: 'http' | 'https' | 'sse' | 'streamable-http';
  type?: 'http' | 'https' | 'sse' | 'streamable-http';
  url: string;
  headers?: Record<string, string>;
};

export type V0StdioTransport = {
  transport?: 'stdio';
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type V0ServerJsonEntry =
  | V0HttpTransport
  | V0StdioTransport
  | JsonObject;

export type ServerJson = {
  mcpServers?: Record<string, V0ServerJsonEntry>;
  servers?: Record<string, V0ServerJsonEntry>;
};

export type V0ServerEntryResponse = V0ServerJsonEntry;

export type McpServerStdio = {
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpServerHttp = {
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
};

export type McpServer = (McpServerStdio | McpServerHttp) & JsonObject;

export type McpJson = {
  mcpServers: Record<string, McpServer>;
};

export type PluginJson = {
  name: string;
  description: string;
  version: string;
  mcpServers?: string;
  skills?: string[];
};

export type MarketplacePluginJson = {
  name: string;
  version: string;
  description: string;
  source: string | {
    source: string;
    repo: string;
    path: string;
  };
  author?: {
    name: string;
    url: string;
  };
  homepage?: string;
  keywords?: string[];
  license?: string;
  repository?: string;
  skills: string[];
};

export type MarketplaceJson = {
  name: string;
  metadata: {
    description: string;
    version: string;
  };
  owner: {
    name: string;
    email?: string;
  };
  plugins: MarketplacePluginJson[];
};

export type McpAsset = McpAssetItem & {
  version?: string;
  serverJson?: ServerJson;
  customProperties: JsonObject;
};
