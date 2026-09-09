export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_COUNT = 3;
export const UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/csv": [".csv"], "text/tab-separated-values": [".tsv"],
  "application/json": [".json"], "text/plain": [".txt", ".log", ".ts", ".py", ".sql"],
  "text/markdown": [".md"], "text/yaml": [".yaml", ".yml"],
  "application/xml": [".xml"], "text/html": [".html"], "text/css": [".css"], "text/javascript": [".js"],
  "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"], "image/gif": [".gif"],
};
const extensions = new Set(Object.values(UPLOAD_ACCEPT).flat());
const errors = {
  uploads_not_configured: "File attachments are not ready yet. Please contact Always Open Commerce.",
  upload_invalid_file: "This file is empty, damaged, encrypted, or does not match its file extension. Try exporting a new copy.",
  upload_type_not_allowed: "This file type is not supported. Use a document, spreadsheet, text/data file, or PNG, JPEG, WebP or GIF image.",
  upload_too_large: "Each file must be 2 MB or smaller. Please choose a smaller file.",
  upload_daily_limit: "You have reached the limit of 30 uploads today. Please try again tomorrow.",
  upload_storage_limit: "This account's attachment storage is full. Delete older chats with attachments or contact Always Open Commerce.",
  upload_already_attached: "This file belongs to another conversation. Please attach it again in this chat.",
  upload_failed: "The file could not be uploaded. Please try again.",
};
export function uploadErrorMessage(code) {
  return Object.hasOwn(errors, code) ? errors[code] : null;
}
export class UploadRequestError extends Error {
  constructor(code, status) {
    super(uploadErrorMessage(code));
    this.code = code;
    this.status = status;
  }
}

export async function readUpload(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data;")) throw new UploadRequestError("upload_invalid_file", 400);
  const maximumBody = MAX_UPLOAD_BYTES + 32_768;
  if (Number(request.headers.get("content-length")) > maximumBody) throw new UploadRequestError("upload_too_large", 413);
  if (!request.body) throw new UploadRequestError("upload_invalid_file", 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBody) {
        await reader.cancel();
        throw new UploadRequestError("upload_too_large", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } }).formData();
  } catch { throw new UploadRequestError("upload_invalid_file", 400); }
  const files = [...form.values()].filter(value => typeof value !== "string");
  if (files.length !== 1) throw new UploadRequestError("upload_invalid_file", 400);
  const file = files[0];
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadRequestError("upload_too_large", 413);
  if (!file.size || !file.name || file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name)) {
    throw new UploadRequestError("upload_invalid_file", 400);
  }
  if (!extensions.has(file.name.slice(file.name.lastIndexOf(".")).toLowerCase())) {
    throw new UploadRequestError("upload_type_not_allowed", 415);
  }
  return { filename: file.name, content: Buffer.from(await file.arrayBuffer()).toString("base64") };
}
