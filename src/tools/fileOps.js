import fs from "fs-extra";
import path from "path";

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

/**
 * Delete a file or directory
 * @param {Object} params
 * @param {string} params.path
 */
export async function deleteFile({ path: targetPath }) {
  try {
    if (!targetPath) throw new Error("path is required");
    const resolved = path.resolve(targetPath);
    if (!(await fs.pathExists(resolved))) {
      return {
        success: false,
        error: `Path not found: ${targetPath}`,
        path: resolved,
      };
    }
    await fs.remove(resolved);
    return { success: true, path: resolved };
  } catch (error) {
    return { success: false, error: error.message, path: targetPath };
  }
}
