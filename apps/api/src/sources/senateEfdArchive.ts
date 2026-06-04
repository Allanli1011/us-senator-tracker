import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { rawDataDir, repoRoot } from "../paths.js";
import type { ArchivedResponse } from "./senateEfdTypes.js";

export async function archiveSenateEfdResponse(input: {
  kind: string;
  url: string;
  status: number;
  contentType: string;
  body: string;
}): Promise<ArchivedResponse> {
  const capturedAt = new Date().toISOString();
  const checksum = createHash("sha256").update(input.body).digest("hex");
  const datePart = capturedAt.slice(0, 10);
  const baseName = `${sanitizeFilePart(input.kind)}-${sanitizeFilePart(new URL(input.url).pathname)}-${capturedAt.replace(/[:.]/g, "-")}`;
  const folder = path.join(rawDataDir, "senate-efd", datePart);
  const rawPath = path.join(folder, `${baseName}.html`);
  const manifestPath = path.join(folder, `${baseName}.json`);

  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(rawPath, input.body, "utf8");

  const archive: ArchivedResponse = {
    source: "senate-efd",
    kind: input.kind,
    url: input.url,
    status: input.status,
    contentType: input.contentType,
    capturedAt,
    checksum,
    byteLength: Buffer.byteLength(input.body, "utf8"),
    rawPath: path.relative(repoRoot, rawPath).replace(/\\/g, "/"),
    manifestPath: path.relative(repoRoot, manifestPath).replace(/\\/g, "/")
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  return archive;
}

function sanitizeFilePart(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);

  return cleaned || "response";
}
