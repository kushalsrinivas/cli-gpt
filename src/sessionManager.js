import fs from "fs-extra";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessionsDir =
      config.sessionsDir || path.join(os.homedir(), ".cliagent", "sessions");
  }

  generateSessionId() {
    return `${Date.now()}-${nanoid(6)}`;
  }

  getSessionDir(sessionId) {
    return path.join(this.sessionsDir, sessionId);
  }

  getContextFile(sessionId) {
    return path.join(this.getSessionDir(sessionId), "context_window.jsonl");
  }

  async ensureSessionDir(sessionId) {
    const dir = this.getSessionDir(sessionId);
    await fs.ensureDir(dir);
    return dir;
  }

  async appendEntry(sessionId, obj) {
    await this.ensureSessionDir(sessionId);
    const fp = this.getContextFile(sessionId);
    await fs.appendFile(fp, JSON.stringify(obj) + "\n");
    await this.pruneIfNeeded(sessionId, this.config.contextWindowSize);
  }

  async readEntries(sessionId) {
    const fp = this.getContextFile(sessionId);
    if (!(await fs.pathExists(fp))) return [];
    const content = await fs.readFile(fp, "utf8");
    return content
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
  }

  async clear(sessionId) {
    const fp = this.getContextFile(sessionId);
    if (await fs.pathExists(fp)) {
      await fs.writeFile(fp, "");
    }
  }

  async pruneIfNeeded(sessionId, maxLines = 4000) {
    if (!maxLines || maxLines <= 0) return;
    const fp = this.getContextFile(sessionId);
    if (!(await fs.pathExists(fp))) return;
    const lines = (await fs.readFile(fp, "utf8")).split("\n");
    if (lines.length > maxLines) {
      const trimmed = lines.slice(-maxLines);
      await fs.writeFile(fp, trimmed.join("\n"));
    }
  }
}
