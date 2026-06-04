import "../loadEnv.js";
import { CongressGovClient } from "../sources/congressGovClient.js";
import { SenateEfdClient } from "../sources/senateEfdClient.js";
import { DisclosureRepository } from "../repository.js";
import { CollectorStateRepository } from "../services/collectorStateRepository.js";
import { PtrCollector, collectorConfigFromEnv } from "../services/ptrCollector.js";
import { SenatePtrImporter } from "../services/senatePtrImporter.js";

const acknowledgeUseRestrictions =
  process.argv.includes("--acknowledge-use-restrictions") ||
  process.env.SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS?.toLowerCase() === "true";
const softFailSourceUnavailable =
  process.argv.includes("--soft-fail-source-unavailable") ||
  process.env.TRACKER_COLLECTOR_SOFT_FAIL_SOURCE_UNAVAILABLE?.toLowerCase() === "true";

if (!acknowledgeUseRestrictions) {
  console.error(
    "Refusing to run collector without --acknowledge-use-restrictions or SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS=true"
  );
  process.exit(1);
}

const repo = new DisclosureRepository();
const senateEfdClient = new SenateEfdClient();
const congressGovClient = new CongressGovClient();
const importer = new SenatePtrImporter(repo, senateEfdClient, congressGovClient);
const collector = new PtrCollector(
  repo,
  new CollectorStateRepository(),
  senateEfdClient,
  importer,
  collectorConfigFromEnv()
);

const run = await collector.runNow({
  acknowledgeUseRestrictions: true
});

console.log(JSON.stringify(run, null, 2));
process.exit(run.status === "failed" && !(softFailSourceUnavailable && run.sourceUnavailable) ? 1 : 0);
