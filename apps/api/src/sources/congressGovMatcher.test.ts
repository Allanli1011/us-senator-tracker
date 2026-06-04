import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCongressGovMember, scoreNameMatch, senatorPatchFromCongressProfile } from "./congressGovMatcher.js";

const rawCapito = {
  bioguideId: "C001047",
  currentMember: true,
  directOrderName: "Shelley Moore Capito",
  firstName: "Shelley",
  invertedOrderName: "Capito, Shelley Moore",
  lastName: "Capito",
  middleName: "Moore",
  officialWebsiteUrl: "https://www.capito.senate.gov",
  partyHistory: [
    {
      partyAbbreviation: "R",
      partyName: "Republican",
      startYear: 2001
    }
  ],
  state: "West Virginia",
  terms: [
    {
      chamber: "House of Representatives",
      congress: 108,
      endYear: 2005,
      startYear: 2003,
      stateCode: "WV",
      stateName: "West Virginia"
    },
    {
      chamber: "Senate",
      congress: 119,
      memberType: "Senator",
      startYear: 2025,
      stateCode: "WV",
      stateName: "West Virginia"
    }
  ],
  updateDate: "2026-05-21T15:05:48Z",
  url: "https://api.congress.gov/v3/member/C001047?format=json"
};

test("normalizeCongressGovMember extracts current Senate profile fields", () => {
  const profile = normalizeCongressGovMember(rawCapito);

  assert.ok(profile);
  assert.equal(profile.bioguideId, "C001047");
  assert.equal(profile.directOrderName, "Shelley Moore Capito");
  assert.equal(profile.stateCode, "WV");
  assert.equal(profile.party, "R");
  assert.equal(profile.chamber, "Senate");
  assert.equal(profile.termStartYear, 2025);
});

test("scoreNameMatch handles eFD middle initials against Congress.gov names", () => {
  const profile = normalizeCongressGovMember(rawCapito);
  assert.ok(profile);

  assert.equal(scoreNameMatch("Shelley M Capito", profile), 97);
  assert.equal(scoreNameMatch("Unrelated Person", profile), 0);
});

test("senatorPatchFromCongressProfile produces tracker metadata", () => {
  const profile = normalizeCongressGovMember(rawCapito);
  assert.ok(profile);
  const patch = senatorPatchFromCongressProfile(profile, 97);

  assert.equal(patch.bioguideId, "C001047");
  assert.equal(patch.fullName, "Shelley Moore Capito");
  assert.equal(patch.state, "WV");
  assert.equal(patch.partyName, "Republican");
  assert.equal(patch.congressGovMatchScore, 97);
});
