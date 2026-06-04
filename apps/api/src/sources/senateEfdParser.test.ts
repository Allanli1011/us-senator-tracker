import assert from "node:assert/strict";
import test from "node:test";
import { parseSenatePtrHtml } from "./senateEfdParser.js";

const fixtureHtml = `
  <html>
    <body>
      <h2>Periodic Transaction Report for 06/13/2025</h2>
      <h3>The Honorable Shelley M Capito (Capito, Shelley Moore)</h3>
      <p>Filed 06/13/2025 @ 3:31 PM</p>
      <table class="table table-striped">
        <thead>
          <tr>
            <th>#</th>
            <th>Transaction Date</th>
            <th>Owner</th>
            <th>Ticker</th>
            <th>Asset Name</th>
            <th>Asset Type</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>05/08/2025</td>
            <td>Spouse</td>
            <td><a href="https://finance.yahoo.com/quote/GOOGL">GOOGL</a></td>
            <td>Alphabet Cl A</td>
            <td>Stock</td>
            <td>Purchase</td>
            <td>$1,001 - $15,000</td>
            <td>--</td>
          </tr>
        </tbody>
      </table>
    </body>
  </html>
`;

test("parseSenatePtrHtml extracts PTR metadata and transaction rows", () => {
  const parsed = parseSenatePtrHtml(
    fixtureHtml,
    "https://efdsearch.senate.gov/search/view/ptr/382eb074-7a02-42de-ac55-12372a6be649/"
  );

  assert.equal(parsed.uuid, "382eb074-7a02-42de-ac55-12372a6be649");
  assert.equal(parsed.reportDate, "2025-06-13");
  assert.equal(parsed.filingDate, "2025-06-13");
  assert.equal(parsed.filerName, "Shelley M Capito");
  assert.equal(parsed.transactions.length, 1);
  assert.deepEqual(parsed.transactions[0], {
    rowNumber: 1,
    transactionDate: "2025-05-08",
    owner: "Spouse",
    ticker: "GOOGL",
    assetName: "Alphabet Cl A",
    assetType: "Stock",
    transactionType: "Purchase",
    amountLabel: "$1,001 - $15,000",
    comment: ""
  });
});
