import assert from "node:assert/strict";
import test from "node:test";
import { chunkText, extractText, normaliseExtractedText } from "../server/document-processor";
import { buildZip } from "../server/zip-writer";

test("extractText parses a valid synthetic XLSX workbook with sharedStrings and sheet XML", async () => {
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
    <sst><si><t>Control ID</t></si><si><t>Status &amp; Owner</t></si><si><t>A.5.1</t></si></sst>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>Implemented</t></is></c></row>
    </sheetData></worksheet>`;

  const xlsx = buildZip([
    { name: "xl/sharedStrings.xml", content: sharedStrings },
    { name: "xl/worksheets/sheet1.xml", content: sheet1 },
  ]);

  const result = await extractText(
    xlsx,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.ok(result.text.includes("Control ID"));
  assert.ok(result.text.includes("Status & Owner"));
  assert.ok(result.text.includes("A.5.1"));
  assert.ok(result.text.includes("Implemented"));
  assert.equal(result.pageCount, 1);
});

test("extractText rejects crafted XLSX ZIP bombs exceeding decompression budget", async () => {
  // 25 MB of repeated bytes compresses to ~25 KB, exceeding the 20 MB per-entry decompression ceiling
  const bombPayload = Buffer.alloc(25 * 1024 * 1024, 0x41);
  const bombZip = buildZip([{ name: "xl/worksheets/sheet1.xml", content: bombPayload }]);
  assert.ok(bombZip.length < 200_000, "Compressed payload should be tiny (high ratio zip bomb)");

  await assert.rejects(
    () => extractText(bombZip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /uncompressed size limit|maxOutputLength|safety limit|too large|ERR_BUFFER_TOO_LARGE/i.test(
        msg,
      );
    },
  );
});

test("normaliseExtractedText strips non-printing control bytes and chunkText preserves headings", () => {
  const raw = "  Policy\x00 Section\x07 1\nISO/IEC 27001:2022\x1F  ";
  assert.equal(normaliseExtractedText(raw), "Policy Section 1\nISO/IEC 27001:2022");

  const sectionA = `# 1. Access Control Policy\n\n${"Multi-factor authentication is enforced on all corporate accounts. ".repeat(30)}`;
  const sectionB = `\n\n# 2. Incident Response\n\n${"Ransomware payments must be reported to ASD within 72 hours. ".repeat(30)}`;
  const chunks = chunkText(sectionA + sectionB, { maxTokensPerChunk: 300, overlapTokens: 40 });

  assert.ok(chunks.length >= 2, `Expected multiple chunks, got ${chunks.length}`);
  assert.equal(chunks[0].sectionHeading, "1. Access Control Policy");
  assert.ok(chunks.some((c) => c.sectionHeading === "2. Incident Response"));
  assert.ok(chunks.every((c) => c.tokenCount > 0 && c.charEnd > c.charStart));
});
