import "../loadEnv.js";
import { CongressGovClient } from "../sources/congressGovClient.js";

const name = process.argv.slice(2).join(" ").trim();

if (!name) {
  console.error("Usage: npm run congress-gov:match --workspace apps/api -- <member name>");
  process.exit(1);
}

const client = new CongressGovClient();
const match = await client.findCurrentSenatorByName(name);

console.log(JSON.stringify(match, null, 2));
