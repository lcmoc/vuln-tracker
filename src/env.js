import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

// The `vt` command runs from any directory, so resolve .env relative to the
// install location as well as the current directory. Real environment
// variables and a .env in the working directory both take precedence over the
// project's own .env (dotenv never overwrites an already-set variable).
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(packageRoot, ".env"), quiet: true });
