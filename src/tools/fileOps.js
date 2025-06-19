import fs from "fs-extra";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

/**
 * Move a file or directory
 * @param {Object} params
 * @param {string} params.from
 * @param {string} params.to
 * @param {boolean} [params.overwrite=false]
 */
export async function moveFile({ from, to, overwrite = false }) {
  try {
    if (!from || !to) throw new Error("from and to paths are required");
    const fromResolved = path.resolve(from);
    const toResolved = path.resolve(to);
    await fs.ensureDir(path.dirname(toResolved));
    await fs.move(fromResolved, toResolved, { overwrite });
    return {
      success: true,
      from: fromResolved,
      to: toResolved,
      overwritten: overwrite,
    };
  } catch (error) {
    return { success: false, error: error.message, from, to };
  }
}

/**
 * Copy a file or directory
 * @param {Object} params
 * @param {string} params.from
 * @param {string} params.to
 * @param {boolean} [params.overwrite=false]
 */
export async function copyFile({ from, to, overwrite = false }) {
  try {
    if (!from || !to) throw new Error("from and to paths are required");
    const fromResolved = path.resolve(from);
    const toResolved = path.resolve(to);
    await fs.ensureDir(path.dirname(toResolved));
    await fs.copy(fromResolved, toResolved, {
      overwrite,
      errorOnExist: !overwrite,
    });
    return {
      success: true,
      from: fromResolved,
      to: toResolved,
      overwritten: overwrite,
    };
  } catch (error) {
    return { success: false, error: error.message, from, to };
  }
}

// Create an async exec wrapper once, reused by multiple helpers
const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Generic Shell Execution ----------------------------------------------------
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
      maxBuffer: 1024 * 1024 * 10, // 10 MB
      timeout: 30000, // 30 s
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

// ---------------------------------------------------------------------------
// File helpers ---------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Directory helpers ----------------------------------------------------------
/**
 * Create a directory (and any parent directories if they do not exist).
 * @param {Object} params
 * @param {string} params.dirPath - Path of the directory to create.
 * @param {string} params.path - Alternative parameter name for the directory path.
 * @param {boolean} [params.recursive=true] - Whether to create parent directories as needed.
 */
export async function createDirectory({
  dirPath,
  path: pathParam,
  recursive = true,
}) {
  try {
    const targetPath = dirPath || pathParam;
    if (!targetPath) throw new Error("Directory path is required");
    const resolvedPath = path.resolve(targetPath);
    if (await fs.pathExists(resolvedPath)) {
      return {
        success: true,
        path: resolvedPath,
        alreadyExisted: true,
        timestamp: new Date().toISOString(),
      };
    }
    // fs.ensureDir always creates parent directories; mirrors recursive flag behaviour
    if (!recursive) {
      // For non-recursive, simply attempt to create the final directory only
      await fs.mkdir(resolvedPath);
    } else {
      await fs.ensureDir(resolvedPath);
    }
    return {
      success: true,
      path: resolvedPath,
      created: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: targetPath };
  }
}

// ---------------------------------------------------------------------------
// File modification helpers --------------------------------------------------
/**
 * Append text content to a file, creating it and its directories if necessary.
 * @param {Object} params
 * @param {string} params.filePath - Path of the file to append to.
 * @param {string} params.content - Content to append.
 */
export async function appendToFile({ filePath, content = "" }) {
  try {
    if (!filePath) throw new Error("File path is required");
    const resolvedPath = path.resolve(filePath);
    const dirPath = path.dirname(resolvedPath);
    await fs.ensureDir(dirPath);
    await fs.appendFile(resolvedPath, content, "utf8");
    const stats = await fs.stat(resolvedPath);
    return {
      success: true,
      path: resolvedPath,
      size: stats.size,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

// ---------------------------------------------------------------------------
// JSON helpers ---------------------------------------------------------------
/**
 * Read and parse a JSON file.
 * @param {Object} params
 * @param {string} params.filePath - Path of the JSON file.
 */
export async function readJSONFile({ filePath }) {
  try {
    const result = await readFile({ filePath });
    if (!result.success) return result;
    const json = JSON.parse(result.content);
    return { ...result, json };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

/**
 * Write an object to a JSON file (pretty-printed by default).
 * @param {Object} params
 * @param {string} params.filePath - Path of the JSON file to write.
 * @param {any} params.data - Data to serialise as JSON.
 * @param {number} [params.space=2] - Number of spaces for indentation.
 */
export async function writeJSONFile({ filePath, data, space = 2 }) {
  try {
    const jsonString = JSON.stringify(data, null, space);
    return await writeFile({ filePath, content: jsonString });
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

// ---------------------------------------------------------------------------
// Existence helpers ----------------------------------------------------------
/**
 * Check whether a given path exists.
 * @param {Object} params
 * @param {string} params.targetPath - Path to check.
 */
export async function pathExists({ targetPath }) {
  try {
    if (!targetPath) throw new Error("Path is required");
    const resolvedPath = path.resolve(targetPath);
    const exists = await fs.pathExists(resolvedPath);
    return {
      success: true,
      path: resolvedPath,
      exists,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return { success: false, error: error.message, path: targetPath };
  }
}
