import { crc32, inflateRawSync } from "node:zlib";
import { DriveSourceError } from "./drive-source-policy.js";

export const OFFICE_LIMITS = Object.freeze({ bytes: 4_000_000, expandedBytes: 8_000_000, entries: 2048 });
const invalid = () => { throw new DriveSourceError("office_archive_limit", "The Office file is invalid or exceeds safe extraction limits. No partial content was indexed.", 413); };

// Validate actual inflation, CRC and local/central agreement before either parser.
// Never extract files to disk, resolve external references, or trust declared ZIP sizes.
export function assertBoundedOfficeArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > OFFICE_LIMITS.bytes || buffer.length < 22) invalid();
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) invalid();
  const count = buffer.readUInt16LE(end + 10), start = buffer.readUInt32LE(end + 16);
  if (!count || count > OFFICE_LIMITS.entries || buffer.readUInt16LE(end + 8) !== count || start + buffer.readUInt32LE(end + 12) !== end) invalid();
  const names = new Set(), regions = [];
  let offset = start, expanded = 0;
  try {
    for (let index = 0; index < count; index++) {
      if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) invalid();
      const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10);
      const compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28), local = buffer.readUInt32LE(offset + 42);
      const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
      if (next > end || flags & 1 || ![0, 8].includes(method) || size > OFFICE_LIMITS.expandedBytes - expanded || local + 30 > start) invalid();
      const nameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength), name = nameBytes.toString("utf8");
      if (!name || names.has(name) || name.startsWith("/") || /\\|\x00|(^|\/)\.\.(\/|$)/.test(name)) invalid();
      names.add(name);
      if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) invalid();
      const localNameLength = buffer.readUInt16LE(local + 26);
      const body = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
      if (body + compressed > start || !buffer.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)) invalid();
      if (regions.some(([a, b]) => local < b && body + compressed > a)) invalid();
      regions.push([local, body + compressed]);
      const encoded = buffer.subarray(body, body + compressed);
      const decoded = method === 0 ? encoded : inflateRawSync(encoded, { maxOutputLength: Math.max(1, Math.min(size, OFFICE_LIMITS.expandedBytes - expanded)) });
      if (decoded.length !== size || crc32(decoded) !== buffer.readUInt32LE(offset + 16)) invalid();
      expanded += decoded.length;
      if (/\.(xml|rels)$/i.test(name) && /\x00|<!DOCTYPE|<!ENTITY/i.test(decoded.toString("utf8"))) invalid();
      offset = next;
    }
    if (offset !== end) invalid();
  } catch (error) {
    if (error instanceof DriveSourceError) throw error;
    invalid();
  }
}

export async function readBoundedOfficeBuffer(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new DriveSourceError("office_unreadable", "Google returned no Office file content.", 502);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > OFFICE_LIMITS.bytes) { await reader.cancel(); invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  assertBoundedOfficeArchive(buffer);
  return buffer;
}

export async function extractDriveDocx(response) {
  const buffer = await readBoundedOfficeBuffer(response);
  try {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim() || result.value.length > 1_000_000) throw new Error();
    return "DOCX body text follows. Formatting, images, charts, headers and embedded files are not included; linked content was not fetched.\n" + result.value;
  } catch {
    throw new DriveSourceError("docx_unreadable", "The Word document could not be read within the supported text limits. No partial text was indexed.", 422);
  }
}
