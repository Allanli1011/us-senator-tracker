import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(sourceDir, "../../..");
export const seedFilePath = path.join(repoRoot, "data", "seed", "senate-ptr-sample.json");
export const rawDataDir = path.join(repoRoot, "data", "raw");
export const processedDataDir = path.join(repoRoot, "data", "processed");
export const storeFilePath = path.join(processedDataDir, "disclosure-store.json");
export const collectorStateFilePath = path.join(processedDataDir, "collector-state.json");
