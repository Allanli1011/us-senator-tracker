import {
  normalizeCongressGovMember,
  scoreNameMatch
} from "./congressGovMatcher.js";
import type {
  CongressGovMemberMatch,
  CongressGovMemberProfile,
  CongressGovRawMember
} from "./congressGovTypes.js";

const baseUrl = "https://api.congress.gov/v3";
const defaultLimit = 250;
const matchThreshold = 75;

export class CongressGovConfigurationError extends Error {
  constructor() {
    super("CONGRESS_GOV_API_KEY is not configured");
    this.name = "CongressGovConfigurationError";
  }
}

export class CongressGovClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.CONGRESS_GOV_API_KEY) {
    this.apiKey = apiKey;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async findCurrentSenatorByName(name: string): Promise<CongressGovMemberMatch | null> {
    const members = await this.listCurrentMembers();
    const senators = members.filter((member) => member.currentMember && member.chamber === "Senate");
    const scored = senators
      .map((profile) => ({
        profile,
        score: scoreNameMatch(name, profile),
        searchedName: name
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best || best.score < matchThreshold) {
      return null;
    }

    const detailedProfile = await this.getMemberByBioguideId(best.profile.bioguideId);
    return {
      ...best,
      profile: detailedProfile ?? best.profile
    };
  }

  async getMemberByBioguideId(bioguideId: string): Promise<CongressGovMemberProfile | null> {
    const data = await this.getJson<{ member?: CongressGovRawMember }>(`/member/${bioguideId}`, {});
    return data.member ? normalizeCongressGovMember(data.member) : null;
  }

  async listCurrentMembers(): Promise<CongressGovMemberProfile[]> {
    const profiles: CongressGovMemberProfile[] = [];
    let offset = 0;
    let total: number | undefined;

    while (total === undefined || offset < total) {
      const data = await this.getJson<{
        members?: CongressGovRawMember[];
        pagination?: {
          count?: number;
        };
      }>("/member", {
        currentMember: "true",
        limit: String(defaultLimit),
        offset: String(offset)
      });
      const members = data.members ?? [];
      profiles.push(...members.map(normalizeCongressGovMember).filter((member): member is CongressGovMemberProfile => Boolean(member)));
      total = data.pagination?.count ?? profiles.length;

      if (members.length === 0 || members.length < defaultLimit) {
        break;
      }

      offset += members.length;
    }

    return profiles;
  }

  private async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      throw new CongressGovConfigurationError();
    }

    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("api_key", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: {
        "user-agent": "us-senator-tracker/0.1 public disclosure research",
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Congress.gov API failed with HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
