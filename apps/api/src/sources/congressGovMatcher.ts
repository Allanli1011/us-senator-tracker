import type { Senator } from "../types.js";
import type { CongressGovMemberProfile, CongressGovRawMember, CongressGovTerm } from "./congressGovTypes.js";

const stateNameToCode = new Map([
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
  ["District of Columbia", "DC"]
]);

export function normalizeCongressGovMember(raw: CongressGovRawMember): CongressGovMemberProfile | null {
  if (!raw.bioguideId) {
    return null;
  }

  const terms = extractTerms(raw.terms);
  const latestTerm = latestTermForMember(terms);
  const latestParty = raw.partyHistory?.at(-1);
  const stateName = latestTerm?.stateName ?? raw.state;
  const stateCode = latestTerm?.stateCode ?? (stateName ? stateNameToCode.get(stateName) : undefined) ?? "Unknown";
  const partyName = latestParty?.partyName ?? raw.partyName;
  const directOrderName = raw.directOrderName ?? directNameFromInverted(raw.invertedOrderName ?? raw.name ?? "");
  const invertedOrderName = raw.invertedOrderName ?? raw.name ?? directOrderName;
  const chamber = normalizeChamber(latestTerm?.chamber);

  return {
    bioguideId: raw.bioguideId,
    directOrderName,
    invertedOrderName,
    firstName: raw.firstName,
    middleName: raw.middleName,
    lastName: raw.lastName,
    party: normalizeParty(latestParty?.partyAbbreviation, partyName),
    partyName,
    stateCode,
    stateName,
    chamber,
    currentMember: raw.currentMember ?? latestTerm?.endYear === undefined,
    termStartYear: latestTerm?.startYear,
    termEndYear: latestTerm?.endYear,
    congressGovUrl: raw.url,
    officialWebsiteUrl: raw.officialWebsiteUrl,
    imageUrl: raw.depiction?.imageUrl,
    updateDate: raw.updateDate
  };
}

export function senatorPatchFromCongressProfile(
  profile: CongressGovMemberProfile,
  score: number
): Partial<Senator> {
  return {
    bioguideId: profile.bioguideId,
    fullName: profile.directOrderName,
    state: profile.stateCode,
    stateName: profile.stateName,
    party: profile.party,
    partyName: profile.partyName,
    active: profile.currentMember,
    currentMember: profile.currentMember,
    chamber: profile.chamber,
    termStartYear: profile.termStartYear,
    termEndYear: profile.termEndYear,
    congressGovUrl: profile.congressGovUrl,
    officialWebsiteUrl: profile.officialWebsiteUrl,
    imageUrl: profile.imageUrl,
    congressGovUpdateDate: profile.updateDate,
    congressGovLastEnrichedAt: new Date().toISOString(),
    congressGovMatchScore: score,
    source: "congress-gov"
  };
}

export function scoreNameMatch(inputName: string, member: CongressGovMemberProfile): number {
  const input = parsePersonName(inputName);
  const candidate = parsePersonName(member.directOrderName || member.invertedOrderName);
  const invertedCandidate = parsePersonName(member.invertedOrderName);
  const bestCandidate = scoreParsedName(input, candidate) >= scoreParsedName(input, invertedCandidate)
    ? candidate
    : invertedCandidate;

  return scoreParsedName(input, bestCandidate);
}

function scoreParsedName(input: ParsedPersonName, candidate: ParsedPersonName): number {
  if (!input.last || !candidate.last) {
    return 0;
  }

  const inputTokens = new Set(input.tokens);
  const candidateTokens = new Set(candidate.tokens);
  const intersection = [...inputTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...inputTokens, ...candidateTokens]).size || 1;
  const tokenScore = Math.round((intersection / union) * 100);

  if (input.last !== candidate.last) {
    return tokenScore >= 70 ? tokenScore - 20 : 0;
  }

  let score = 70;
  if (input.first && candidate.first && input.first === candidate.first) {
    score = 92;
  } else if (input.first && candidate.first && input.first[0] === candidate.first[0]) {
    score = 82;
  }

  if (input.middleInitial && candidate.middleInitial && input.middleInitial === candidate.middleInitial) {
    score += 5;
  }

  if (tokenScore === 100) {
    score = 100;
  }

  return Math.min(score, 100);
}

interface ParsedPersonName {
  tokens: string[];
  first?: string;
  last?: string;
  middleInitial?: string;
}

function parsePersonName(value: string): ParsedPersonName {
  const direct = directNameFromInverted(value);
  const tokens = direct
    .toLowerCase()
    .replace(/^the honorable\s+/, "")
    .replace(/^sen\.\s+/, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !["jr", "sr", "ii", "iii", "iv"].includes(token));

  const first = tokens[0];
  const last = tokens.at(-1);
  const middle = tokens.length > 2 ? tokens[1] : undefined;
  return {
    tokens,
    first,
    last,
    middleInitial: middle?.[0]
  };
}

function directNameFromInverted(value: string): string {
  if (!value.includes(",")) {
    return value;
  }

  const [last, rest] = value.split(",", 2);
  return `${rest.trim()} ${last.trim()}`.trim();
}

function extractTerms(terms: CongressGovRawMember["terms"]): CongressGovTerm[] {
  if (Array.isArray(terms)) {
    return terms;
  }

  return terms?.item ?? [];
}

function latestTermForMember(terms: CongressGovTerm[]): CongressGovTerm | undefined {
  return [...terms].sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0)).at(0);
}

function normalizeChamber(chamber: string | undefined): CongressGovMemberProfile["chamber"] {
  if (chamber === "Senate") {
    return "Senate";
  }

  if (chamber === "House of Representatives") {
    return "House";
  }

  return "Unknown";
}

function normalizeParty(abbreviation: string | undefined, partyName: string | undefined): Senator["party"] {
  if (abbreviation === "D" || /democrat/i.test(partyName ?? "")) {
    return "D";
  }

  if (abbreviation === "R" || /republican/i.test(partyName ?? "")) {
    return "R";
  }

  if (abbreviation === "I" || /independent/i.test(partyName ?? "")) {
    return "I";
  }

  return "Unknown";
}
