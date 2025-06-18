import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import path from "path";
import * as pdfTools from "./pdfTools.js";
import * as convertTools from "./convertTools.js";
import * as fileOps from "./fileOps.js";

const execAsync = promisify(exec);

/**
 * Execute a shell command.
 * @param {Object} params
 * @param {string} params.command
 */
export async function executeCommand({ command }) {
  if (!command || typeof command !== "string") {
    throw new Error("Invalid command: must be a non-empty string");
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10,
      timeout: 30000,
    });
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      command,
      exitCode: error.code,
      timestamp: new Date().toISOString(),
    };
  }
}

export async function createFile({ filePath, content = "" }) {
  try {
    if (!filePath) throw new Error("File path is required");
    const resolvedPath = path.resolve(filePath);
    const dirPath = path.dirname(resolvedPath);
    await fs.ensureDir(dirPath);
    if (await fs.pathExists(resolvedPath)) {
      return {
        success: false,
        error: `File already exists: ${filePath}`,
        path: resolvedPath,
      };
    }
    await fs.writeFile(resolvedPath, content, "utf8");
    return {
      success: true,
      path: resolvedPath,
      size: Buffer.byteLength(content, "utf8"),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

export async function writeFile({ filePath, content }) {
  try {
    if (!filePath) throw new Error("File path is required");
    const resolvedPath = path.resolve(filePath);
    const dirPath = path.dirname(resolvedPath);
    await fs.ensureDir(dirPath);
    await fs.writeFile(resolvedPath, content || "", "utf8");
    return {
      success: true,
      path: resolvedPath,
      size: Buffer.byteLength(content || "", "utf8"),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

export async function readFile({ filePath }) {
  try {
    if (!filePath) throw new Error("File path is required");
    const resolvedPath = path.resolve(filePath);
    if (!(await fs.pathExists(resolvedPath))) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
        path: resolvedPath,
      };
    }
    const content = await fs.readFile(resolvedPath, "utf8");
    const stats = await fs.stat(resolvedPath);
    return {
      success: true,
      content,
      path: resolvedPath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

export async function listDirectory({ dirPath = "." }) {
  try {
    const resolvedPath = path.resolve(dirPath);
    if (!(await fs.pathExists(resolvedPath))) {
      return {
        success: false,
        error: `Directory not found: ${dirPath}`,
        path: resolvedPath,
      };
    }
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${dirPath}`,
        path: resolvedPath,
      };
    }
    const items = await fs.readdir(resolvedPath);
    const detailedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const itemPath = path.join(resolvedPath, item);
          const itemStats = await fs.stat(itemPath);
          return {
            name: item,
            type: itemStats.isDirectory() ? "directory" : "file",
            size: itemStats.size,
            modified: itemStats.mtime.toISOString(),
          };
        } catch (err) {
          return { name: item, type: "unknown", error: err.message };
        }
      })
    );
    return {
      success: true,
      path: resolvedPath,
      items: detailedItems,
      count: detailedItems.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: dirPath };
  }
}

export async function searchFiles({ pattern, directory = "." }) {
  try {
    const resolvedDir = path.resolve(directory);
    // Attempt to use native find for performance; fallback handled by error path.
    const result = await executeCommand({
      command: `find "${resolvedDir}" -name "${pattern}" -type f`,
    });
    if (result.success) {
      const files = result.stdout.split("\n").filter((f) => f.trim());
      return {
        success: true,
        pattern,
        directory: resolvedDir,
        files,
        count: files.length,
        timestamp: new Date().toISOString(),
      };
    }
    // TODO: Implement JS glob fallback for Windows where `find` may be unavailable.
    return result;
  } catch (error) {
    return { success: false, error: error.message, pattern, directory };
  }
}

export async function getSystemInfo() {
  try {
    const info = {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      cwd: process.cwd(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
    return { success: true, info, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Aggregate export for convenience
export const tools = {
  executeCommand,
  createFile,
  writeFile,
  readFile,
  listDirectory,
  searchFiles,
  getSystemInfo,
  ...pdfTools,
  ...convertTools,
  ...fileOps,
};

export default tools;
