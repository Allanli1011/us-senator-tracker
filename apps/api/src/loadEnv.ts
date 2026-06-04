import dotenv from "dotenv";
import path from "node:path";
import { repoRoot } from "./paths.js";

dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });
