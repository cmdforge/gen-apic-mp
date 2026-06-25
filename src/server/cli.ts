#!/usr/bin/env node

import { Command, Option } from "commander";
import { generateMarketplaceGit, resolveUnpackDirectory } from "./marketplace.js";

const program = new Command();
const unpackPreset = "__CURRENT_WORKING_PACKAGE__";
const unpackOption = new Option(
  "--unpack [directory]",
  "Also unpack the generated marketplace into a directory; defaults to the current directory",
).preset(unpackPreset);

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
  .action(async (
    serviceName: string,
    region: string,
    workspaceName: string,
    options: { unpack?: string },
  ) => {
    const unpack = await resolveUnpackDirectory(options.unpack);
    const result = await generateMarketplaceGit({ serviceName, region, workspaceName }, { unpack });
    if (result.unpackPath) {
      console.log(`Unpacked marketplace into ${result.unpackPath}`);
      return;
    }

    console.log(`Wrote ${result.pluginCount} plugins to ${result.zipPath}`);
  });

program.parse();
