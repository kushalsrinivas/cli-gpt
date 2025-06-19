import * as pdfTools from "./pdfTools.js";
import * as convertTools from "./convertTools.js";
import * as fileOps from "./fileOps.js";

// Re-export core file operations that were moved into fileOps.js so that
// existing namespace imports (e.g. `import * as tools from "./tools"`) keep
// working without any code changes elsewhere.
export {
  executeCommand,
  createFile,
  writeFile,
  readFile,
  listDirectory,
  searchFiles,
  getSystemInfo,
  moveFile,
  copyFile,
  createDirectory,
  appendToFile,
  readJSONFile,
  writeJSONFile,
  pathExists,
} from "./fileOps.js";

// In addition to the core fileOps helpers above, surface every PDF and conversion helper
// directly at the top-level so the agent can invoke them without the nested "tools" object.
export * from "./pdfTools.js";
export * from "./convertTools.js";

// Aggregate export for convenience (spreads bring everything under one object)
export const tools = {
  ...fileOps,
  ...pdfTools,
  ...convertTools,
};

export default tools;
