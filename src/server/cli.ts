#!/usr/bin/env node

import { Command, Option } from "commander";
import { generateMarketplaceGit, resolveUnpackDirectory } from "./marketplace.js";

const program = new Command();
const unpackPreset = "__CURRENT_WORKING_PACKAGE__";
const unpackOption = new Option(
  "--unpack [directory]",
  "Also unpack the generated marketplace into a directory; defaults to the current directory",
).preset(unpackPreset);
const mcpMetaOption = new Option(
  "--mcp-meta <key>",
  "Include the specified _meta key in generated .mcp.json server entries",
).argParser((value: string, previous: string[] = []) => [...previous, value]);

program.configureHelp({
  optionDescription(option) {
    const description = option.description ?? "";
    if (option.attributeName() === "unpack" && option.presetArg === unpackPreset)
      return description;
    return option.description;
  },
});

program
  .argument("<serviceName>", "Region-unique API Center service name")
  .argument("<region>", "Region name")
  .argument("<workspaceName>", "Workspace to convert into marketplace zip")
  .addOption(unpackOption)
  .addOption(mcpMetaOption)
  .action(async (
    serviceName: string,
    region: string,
    workspaceName: string,
    options: { unpack?: string; mcpMeta?: string[] },
  ) => {
    const unpack = await resolveUnpackDirectory(options.unpack);
    const mcpMetaKeys = options.mcpMeta;

    const result = await generateMarketplaceGit(
      { serviceName, region, workspaceName },
      { unpack, mcpMetaKeys },
    );
    if (result.unpackPath) {
      console.log(`Unpacked marketplace into ${result.unpackPath}`);
      return;
    }

    console.log(`Wrote ${result.pluginCount} plugins to ${result.zipPath}`);
  });

program.parse();
