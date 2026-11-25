import { inflateRawSync } from "node:zlib";

export interface ExtractionResult {
  text: string;
  pageCount?: number;
}

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  sectionHeading: string | null;
  tokenCount: number;
}

const MAX_TEXT_LENGTH = 500_000;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024;

/**
 * Extract plain text from a local document buffer based on MIME type.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  switch (mimeType) {
    case "application/pdf":
      return extractFromPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractFromDocx(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractFromXlsx(buffer);
    case "text/plain":
    case "text/markdown":
    case "text/csv":
      return { text: normaliseExtractedText(buffer.toString("utf8")) };
    case "image/png":
    case "image/jpeg":
      return { text: "[Image file — stored as visual evidence]" };
    default:
      return { text: "" };
  }
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    const textResult = await parser.getText();
    return {
      text: normaliseExtractedText(textResult.text),
      pageCount: info.total,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: normaliseExtractedText(result.value) };
}

/**
 * Zero-dependency XLSX text extractor: reads the ZIP central directory,
 * inflates xl/sharedStrings.xml and xl/worksheets/sheet*.xml, and emits
 * readable tab-separated rows per sheet.
 */
function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Locate End of Central Directory signature (0x06054b50)
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return entries;

  const cdEntries = Math.min(buffer.readUInt16LE(eocdOffset + 10), MAX_ZIP_ENTRIES);
  let pos = buffer.readUInt32LE(eocdOffset + 16);
  let totalDecompressedBytes = 0;

  for (let i = 0; i < cdEntries && pos + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const compression = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localHeaderOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;

    if (
      !name.startsWith("xl/sharedStrings.xml") &&
      !/^xl\/worksheets\/sheet\d+\.xml$/.test(name) &&
      name !== "xl/workbook.xml"
    ) {
      continue;
    }

    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(`XLSX entry "${name}" exceeds safe uncompressed size limit.`);
    }
    if (localHeaderOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const lhNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    if (dataStart + compressedSize > buffer.length) continue;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let inflated: Buffer | null = null;
    if (compression === 0) {
      if (raw.length > MAX_ZIP_ENTRY_BYTES) {
        throw new Error(`XLSX entry "${name}" exceeds safe size limit.`);
      }
      inflated = raw;
    } else if (compression === 8) {
      try {
        inflated = inflateRawSync(raw, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ERR_BUFFER_TOO_LARGE") {
          throw new Error(`XLSX archive rejected: entry "${name}" exceeds decompression budget.`);
        }
        continue;
      }
    }
    if (inflated) {
      totalDecompressedBytes += inflated.length;
      if (totalDecompressedBytes > MAX_ZIP_TOTAL_BYTES) {
        throw new Error("XLSX archive rejected: total decompressed size exceeds safe budget.");
      }
      entries.set(name, inflated);
    }
  }
  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractFromXlsx(buffer: Buffer): ExtractionResult {
  const entries = readZipEntries(buffer);
  const sharedStrings: string[] = [];
  const ssBuf = entries.get("xl/sharedStrings.xml");
  if (ssBuf) {
    const ssXml = ssBuf.toString("utf8");
    const siMatches = ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
    for (const m of siMatches) {
      const textParts: string[] = [];
      for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
        textParts.push(decodeXmlEntities(t[1]));
      }
      sharedStrings.push(textParts.join(""));
    }
  }

  const sheetNames: string[] = [];
  const wbBuf = entries.get("xl/workbook.xml");
  if (wbBuf) {
    for (const m of wbBuf.toString("utf8").matchAll(/<sheet\b[^>]*name="([^"]+)"/g)) {
      sheetNames.push(decodeXmlEntities(m[1]));
    }
  }

  const sheetKeys = Array.from(entries.keys())
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = Number(a.match(/sheet(\d+)\.xml$/)?.[1] || 0);
      const nb = Number(b.match(/sheet(\d+)\.xml$/)?.[1] || 0);
      return na - nb;
    });

  const sections: string[] = [];
  for (let idx = 0; idx < sheetKeys.length; idx++) {
    const xml = entries.get(sheetKeys[idx])!.toString("utf8");
    const sheetTitle = sheetNames[idx] || `Sheet ${idx + 1}`;
    const rows: string[] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const typeMatch = attrs.match(/\bt="([^"]+)"/);
        const cellType = typeMatch?.[1] || "";
        if (cellType === "inlineStr") {
          const inlineParts: string[] = [];
          for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
            inlineParts.push(decodeXmlEntities(t[1]));
          }
          const val = inlineParts.join("").trim();
          if (val) cells.push(val);
        } else {
          const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
          if (!vMatch) continue;
          const rawVal = vMatch[1].trim();
          if (cellType === "s") {
            const str = sharedStrings[Number(rawVal)];
            if (str?.trim()) cells.push(str.trim());
          } else if (rawVal) {
            cells.push(decodeXmlEntities(rawVal));
          }
        }
      }
      if (cells.length > 0) rows.push(cells.join(" | "));
    }
    if (rows.length > 0) {
      sections.push(`## ${sheetTitle}\n${rows.join("\n")}`);
    }
  }

  return {
    text: normaliseExtractedText(sections.join("\n\n")),
    pageCount: sheetKeys.length || undefined,
  };
}

/**
 * Strip non-printing control characters and cap maximum length without
 * corrupting legitimate ISO 27001 policy vocabulary. Prompt-injection
 * isolation is enforced structurally via XML framing in server/ai.ts.
 */
export function normaliseExtractedText(text: string): string {
  if (!text) return "";
  let cleaned = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }
    cleaned += text[i];
  }
  const trimmed = cleaned.trim();
  return trimmed.length > MAX_TEXT_LENGTH ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractHeading(line: string): string | null {
  const trimmed = line.trim();
  if (/^#{1,4}\s+/.test(trimmed)) return trimmed.replace(/^#{1,4}\s+/, "");
  if (
    trimmed.length > 3 &&
    trimmed.length < 100 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed)
  ) {
    return trimmed;
  }
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(trimmed) && trimmed.length < 120) {
    return trimmed;
  }
  return null;
}

export function chunkText(
  text: string,
  options: { maxTokensPerChunk?: number; overlapTokens?: number } = {},
): ChunkResult[] {
  const maxTokens = options.maxTokensPerChunk ?? 4000;
  const overlapTokens = options.overlapTokens ?? 200;
  if (!text.trim()) return [];

  if (estimateTokens(text) <= maxTokens) {
    return [
      {
        content: text,
        chunkIndex: 0,
        charStart: 0,
        charEnd: text.length,
        sectionHeading: extractHeading(text.split("\n")[0] || ""),
        tokenCount: estimateTokens(text),
      },
    ];
  }

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: ChunkResult[] = [];
  let currentContent = "";
  let currentCharStart = 0;
  let currentCharEnd = 0;
  let currentHeading: string | null = null;
  let charOffset = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    const heading = extractHeading(para.split("\n")[0] || "");
    if (heading) currentHeading = heading;

    if (estimateTokens(currentContent) + paraTokens > maxTokens && currentContent.length > 0) {
      chunks.push({
        content: currentContent.trim(),
        chunkIndex,
        charStart: currentCharStart,
        charEnd: currentCharEnd,
        sectionHeading: currentHeading,
        tokenCount: estimateTokens(currentContent),
      });
      chunkIndex++;
      const overlapChars = overlapTokens * 4;
      const overlapText =
        currentContent.length > overlapChars ? currentContent.slice(-overlapChars) : "";
      currentContent = overlapText;
      currentCharStart = Math.max(0, currentCharEnd - overlapText.length);
    }

    if (currentContent.length === 0) currentCharStart = charOffset;
    if (currentContent.length > 0) currentContent += "\n\n";
    currentContent += para;
    charOffset += para.length + 2;
    currentCharEnd = Math.min(charOffset, text.length);
  }

  if (currentContent.trim().length > 0) {
    chunks.push({
      content: currentContent.trim(),
      chunkIndex,
      charStart: currentCharStart,
      charEnd: currentCharEnd,
      sectionHeading: currentHeading,
      tokenCount: estimateTokens(currentContent),
    });
  }

  return chunks;
}
