import type { Senator } from "../types.js";

export interface CongressGovTerm {
  chamber?: string;
  congress?: number;
  district?: number;
  endYear?: number;
  memberType?: string;
  startYear?: number;
  stateCode?: string;
  stateName?: string;
}

export interface CongressGovMemberProfile {
  bioguideId: string;
  directOrderName: string;
  invertedOrderName: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  party: Senator["party"];
  partyName?: string;
  stateCode: string;
  stateName?: string;
  chamber: "Senate" | "House" | "Unknown";
  currentMember: boolean;
  termStartYear?: number;
  termEndYear?: number;
  congressGovUrl?: string;
  officialWebsiteUrl?: string;
  imageUrl?: string;
  updateDate?: string;
}

export interface CongressGovMemberMatch {
  profile: CongressGovMemberProfile;
  score: number;
  searchedName: string;
}

export interface CongressGovRawMember {
  bioguideId?: string;
  currentMember?: boolean;
  depiction?: {
    imageUrl?: string;
  };
  directOrderName?: string;
  firstName?: string;
  invertedOrderName?: string;
  lastName?: string;
  middleName?: string;
  name?: string;
  officialWebsiteUrl?: string;
  partyHistory?: Array<{
    partyAbbreviation?: string;
    partyName?: string;
    startYear?: number;
  }>;
  partyName?: string;
  state?: string;
  terms?: Array<CongressGovTerm> | {
    item?: CongressGovTerm[];
  };
  updateDate?: string;
  url?: string;
}
