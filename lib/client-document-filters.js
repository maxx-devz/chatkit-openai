import {assignmentError} from "./client-document-assignment-policy.js";
import {DOCUMENT_CATEGORIES} from "./client-document-categories.js";
export function clientDocumentFilters(input = {}) {
  const search = input.search ?? "", category = input.category ?? "", step = input.step ?? "";
  if (typeof search !== "string" || search.length > 180 || /[\x00-\x1f\x7f<>]/.test(search)) {
    throw assignmentError("invalid_search", "Search document titles using up to 180 plain-text characters.");
  }
  if (typeof category !== "string" || category !== "" && !Object.hasOwn(DOCUMENT_CATEGORIES, category)) {
    throw assignmentError("invalid_document_type", "Choose a listed document type.");
  }
  if (typeof step !== "string" || step !== "" && !/^[1-5]$/.test(step)) {
    throw assignmentError("invalid_document_step", "Choose one of the five client journey steps.");
  }
  return {search: search.trim(), category, step};
}
export function documentSearchPattern(search) {
  return search ? "%" + search.replace(/[\\%_]/g, "\\$&") + "%" : "";
}
