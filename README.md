# gen-apic-mp

Generate marketplace repository contents from an Azure API Center workspace.

This tool reads plugin and MCP assets from API Center, translates legacy `v0/servers/{name}` data into MCP server entries, and emits the repository structure expected by marketplace-style plugin catalogs.

## What it generates

For a workspace, `gen-apic-mp` produces:

```text
.github/plugin/marketplace.json
.claude-plugin/marketplace.json
plugins/{pluginName}/plugin.json
plugins/{pluginName}/.mcp.json
```

The generated `.mcp.json` only contains normal MCP server launch configuration:

- stdio servers: `transport`, `command`, `args`, `env`, `cwd`
- remote servers: `transport`, `url`, `headers`

## Install

```bash
npm install
npm run build
```

To use the CLI directly from the repo during development:

```bash
node dist/server/cli.js --help
```

## CLI

```bash
gen-apic-mp <serviceName> <region> <workspaceName> [--unpack [directory]]
```

Arguments:

- `serviceName`: region-unique Azure API Center service name
- `region`: Azure region, like `eastus`
- `workspaceName`: API Center workspace to export

Option:

- `--unpack [directory]`: write the generated marketplace tree directly into a directory instead of creating a zip

If `--unpack` is provided without a value, it defaults to the current working directory, but only if that directory contains a `package.json`.

## Examples

Create a zip in the current directory:

```bash
gen-apic-mp my-api-center eastus marketplace
```

Unpack directly into the current repo:

```bash
gen-apic-mp my-api-center eastus marketplace --unpack
```

Unpack into a specific directory:

```bash
gen-apic-mp my-api-center eastus marketplace --unpack /path/to/marketplace-repo
```

## Output behavior

Without `--unpack`, the CLI writes:

```text
{workspaceName}-marketplace.zip
```

With `--unpack`, the CLI does not create a zip. It syncs the generated tree directly into the target directory.

## How MCP translation works

For each plugin resource with `kind: "mcp"`, the tool:

1. Fetches the MCP asset using the plugin resource `resourceId`
2. Fetches the legacy server entry from `workspaces/{workspaceName}/v0/servers/{mcp.name}`
3. Uses the `server.name` from that payload as the key in `.mcp.json`
4. Translates the server entry into a `types.McpServer`

The translator supports:

- direct stdio-style entries with `command`, `args`, and `env`
- direct remote-style entries with `url` and remote transport
- nested `server.remotes`
- nested `server.packages` as fallback when `remotes` is empty

## Current limitations

- Skill directories are not generated yet, so `plugin.json` only includes `skills` when that support is added
- The tool expects the target API Center workspace to expose:
  - portal config at `config.json`
  - plugin assets in the workspace API listing
  - MCP assets reachable from plugin resource IDs
  - legacy server entries at `v0/servers/{name}`

## Development

Build:

```bash
npm run build
```

Test:

```bash
npm test
```
