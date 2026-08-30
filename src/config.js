import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".config", "vuln-tracker");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const CACHE_PATH = path.join(CONFIG_DIR, "reports-cache.json");

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function loadCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    if (cache && typeof cache.fetchedAt === "number" && Array.isArray(cache.reports)) {
      return cache;
    }
  } catch {
    // no cache yet, or it's corrupt — treat as a cold start
  }
  return null;
}

export function saveCache(cache) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

export function clearCache() {
  try {
    fs.rmSync(CACHE_PATH);
  } catch {
    // already gone
  }
}
