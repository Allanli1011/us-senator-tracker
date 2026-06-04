import { CongressGovClient, CongressGovConfigurationError } from "../sources/congressGovClient.js";
import { senatorPatchFromCongressProfile } from "../sources/congressGovMatcher.js";
import { SenateEfdClient } from "../sources/senateEfdClient.js";
import { normalizeParsedSenatePtr, parseSenatePtrHtml } from "../sources/senateEfdParser.js";
import type { ArchivedResponse } from "../sources/senateEfdTypes.js";
import type { Senator } from "../types.js";
import { DisclosureRepository } from "../repository.js";

export interface SenatePtrImportInput {
  uuid: string;
  senatorId?: string;
  senatorName?: string;
}

export interface SenatePtrImportResult {
  senator: Senator;
  filing: ReturnType<typeof normalizeParsedSenatePtr>["filing"];
  inserted: number;
  skipped: number;
  parsedRows: number;
  enrichment: SenatePtrEnrichmentResult;
  archive: ArchivedResponse;
}

export type SenatePtrEnrichmentResult =
  | {
      status: "matched";
      senator: Senator;
      bioguideId: string;
      score: number;
      searchedName: string;
    }
  | {
      status: "not_configured";
      reason: string;
    }
  | {
      status: "no_match";
      searchedName: string;
    }
  | {
      status: "failed";
      searchedName: string;
      reason: string;
    };

export class SenatePtrImporter {
  constructor(
    private readonly repo: DisclosureRepository,
    private readonly senateEfdClient: SenateEfdClient,
    private readonly congressGovClient: CongressGovClient
  ) {}

  async importByUuid(input: SenatePtrImportInput): Promise<SenatePtrImportResult> {
    const fetched = await this.senateEfdClient.fetchPtrReport(input.uuid);
    const parsed = parseSenatePtrHtml(fetched.body, fetched.url);

    if (fetched.status !== 200) {
      throw new Error(`Senate eFD PTR ${input.uuid} returned HTTP ${fetched.status}`);
    }

    let senator = await this.resolveSenator(input, parsed.filerName);
    const enrichment = await this.enrichSenator(senator, parsed.filerName ?? senator.fullName, false);
    if (enrichment.status === "matched") {
      senator = enrichment.senator;
    }

    const normalized = normalizeParsedSenatePtr({
      parsed,
      senator,
      archive: fetched.archive
    });
    const result = await this.repo.upsertFilingWithTransactions(normalized.filing, normalized.transactions);

    return {
      senator: normalized.senator,
      filing: normalized.filing,
      inserted: result.inserted,
      skipped: result.skipped,
      parsedRows: parsed.transactions.length,
      enrichment,
      archive: fetched.archive
    };
  }

  async enrichSenator(
    senator: Senator,
    searchName: string,
    requireConfigured: boolean
  ): Promise<SenatePtrEnrichmentResult> {
    if (!this.congressGovClient.isConfigured) {
      return {
        status: "not_configured",
        reason: requireConfigured
          ? "CONGRESS_GOV_API_KEY is not configured"
          : "Skipped Congress.gov enrichment because CONGRESS_GOV_API_KEY is not configured"
      };
    }

    try {
      const match = await this.congressGovClient.findCurrentSenatorByName(searchName);
      if (!match) {
        return {
          status: "no_match",
          searchedName: searchName
        };
      }

      const updated = await this.repo.updateSenator(
        senator.id,
        senatorPatchFromCongressProfile(match.profile, match.score)
      );

      return {
        status: "matched",
        senator: updated,
        bioguideId: match.profile.bioguideId,
        score: match.score,
        searchedName: searchName
      };
    } catch (error) {
      if (error instanceof CongressGovConfigurationError) {
        throw error;
      }

      return {
        status: "failed",
        searchedName: searchName,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async resolveSenator(
    input: SenatePtrImportInput,
    parsedFilerName: string | null
  ): Promise<Senator> {
    if (input.senatorId) {
      const senator = await this.repo.getSenatorById(input.senatorId);
      if (!senator) {
        throw new Error(`Unknown senatorId: ${input.senatorId}`);
      }

      return senator;
    }

    const senatorName = input.senatorName ?? parsedFilerName;
    if (!senatorName) {
      throw new Error("senatorName is required when the PTR page does not expose a filer name");
    }

    return this.repo.findOrCreateSenatorByName(senatorName, "senate-efd");
  }
}
