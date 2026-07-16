import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The single source of truth for the running version: package.json.
 * Everything that reports a version (CLI --version, the UI footer) reads
 * this, so there is never a second place to bump.
 */
export const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();
