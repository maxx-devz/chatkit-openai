import { DriveSourceError } from "./drive-source-policy.js";
import { assertBoundedOfficeArchive } from "./drive-office.js";

export const SPREADSHEET_LIMITS = Object.freeze({ bytes: 4_000_000, expandedBytes: 8_000_000,
  entries: 2048, sheets: 30, cells: 50_000, characters: 1_000_000 });

// Check export ZIP sizes before the XML parser allocates workbook contents.
// Inputs come only from authorized Google exports or scoped XLSX media downloads.
export function assertBoundedSpreadsheetArchive(buffer) {
  const fail = () => { throw new DriveSourceError("spreadsheet_limit", "The spreadsheet export is invalid or exceeds safe extraction limits. No partial spreadsheet was indexed.", 413); };
  if (!Buffer.isBuffer(buffer) || buffer.length > SPREADSHEET_LIMITS.bytes || buffer.length < 22) fail();
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) fail();
  const count = buffer.readUInt16LE(end + 10);
  const start = buffer.readUInt32LE(end + 16);
  const length = buffer.readUInt32LE(end + 12);
  if (!count || count > SPREADSHEET_LIMITS.entries || start + length !== end) fail();
  let offset = start;
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) fail();
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    expanded += buffer.readUInt32LE(offset + 24);
    if (flags & 1 || ![0, 8].includes(method) || expanded > SPREADSHEET_LIMITS.expandedBytes) fail();
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (offset > end) fail();
  }
  if (offset !== end) fail();
}

export function spreadsheetValuesText(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > SPREADSHEET_LIMITS.sheets) {
    throw new DriveSourceError("spreadsheet_limit", "The spreadsheet has no readable sheets or exceeds the 30-sheet limit.", 413);
  }
  let cells = 0;
  const result = sheets.map(sheet => {
    if (!Array.isArray(sheet.data)) throw new DriveSourceError("spreadsheet_unreadable", "A worksheet could not be read completely.", 422);
    const rows = sheet.data.map(row => {
      cells += row.length;
      if (cells > SPREADSHEET_LIMITS.cells) throw new DriveSourceError("spreadsheet_limit", "The spreadsheet exceeds 50,000 cells. No partial spreadsheet was indexed.", 413);
      return row.map(value => value instanceof Date ? value.toISOString() : value);
    });
    return { sheet: sheet.sheet, rows };
  });
  const text = "Spreadsheet cell values from all worksheets follow as JSON. Formula results are cached export values; formulas are not executed. "
    + "Formatting, charts, drawings, comments and external linked sources are not included.\n" + JSON.stringify(result);
  if (text.length > SPREADSHEET_LIMITS.characters) throw new DriveSourceError("spreadsheet_limit", "The spreadsheet exceeds the text limit. It was not silently truncated.", 413);
  return text;
}

export async function extractDriveSpreadsheet(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new DriveSourceError("spreadsheet_unreadable", "Google returned no spreadsheet export.", 502);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SPREADSHEET_LIMITS.bytes) {
        await reader.cancel();
        throw new DriveSourceError("spreadsheet_limit", "The spreadsheet export exceeds 4 MB. No partial spreadsheet was indexed.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  assertBoundedSpreadsheetArchive(buffer);
  assertBoundedOfficeArchive(buffer);
  try {
    // Universal parser avoids starting an additional worker inside a serverless function.
    const { default: readExcelFile } = await import("read-excel-file/universal");
    return spreadsheetValuesText(await readExcelFile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), { trim: false }));
  } catch (error) {
    if (error instanceof DriveSourceError) throw error;
    throw new DriveSourceError("spreadsheet_unreadable", "The complete spreadsheet export could not be parsed. No partial content was indexed.", 422);
  }
}
