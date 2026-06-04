import "../loadEnv.js";
import { SenateEfdClient } from "../sources/senateEfdClient.js";
import { parseSenatePtrHtml } from "../sources/senateEfdParser.js";

const uuid = process.argv[2];

if (!uuid) {
  console.error("Usage: npm run senate-efd:preview --workspace apps/api -- <ptr-uuid>");
  process.exit(1);
}

const client = new SenateEfdClient();
const fetched = await client.fetchPtrReport(uuid);
const parsed = parseSenatePtrHtml(fetched.body, fetched.url);

console.log(
  JSON.stringify(
    {
      status: fetched.status,
      archive: fetched.archive,
      parsed
    },
    null,
    2
  )
);
