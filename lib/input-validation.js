export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

const UNSAFE_PLAIN_TEXT_PATTERN = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/u;

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(value);
}

export function hasUnsafePlainText(value) {
  return UNSAFE_PLAIN_TEXT_PATTERN.test(value);
}

export function hasUnsafeMultilineText(value) {
  return UNSAFE_MULTILINE_PATTERN.test(value);
}

export function passwordValidationMessage(password, username = "") {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return "Passwords must contain 12-128 characters.";
  }

  if (/\p{Cc}|\p{Cf}/u.test(password)) {
    return "Passwords cannot contain hidden control characters.";
  }

  const normalizedUsername = normalizeUsername(username);
  if (
    normalizedUsername
    && password.toLowerCase().includes(normalizedUsername)
  ) {
    return "Passwords must not contain the account username.";
  }

  const characterGroups = [
    /\p{Ll}/u,
    /\p{Lu}/u,
    /\p{N}/u,
    /[^\p{L}\p{N}\s]/u,
  ].filter((pattern) => pattern.test(password)).length;

  if (characterGroups < 3) {
    return "Use at least three of: lowercase letters, uppercase letters, numbers, and symbols.";
  }

  return "";
}
