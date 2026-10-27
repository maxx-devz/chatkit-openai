// Deterministic redaction, used before source text enters AI and before replies leave it.
// Heuristics cannot identify every unknown secret; never promise a complete DLP scan.
export function redactSensitiveText(value, knownSecrets = []) {
  let text = String(value ?? "").normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g, "");
  for (const secret of knownSecrets.filter(value => typeof value === "string" && value.length >= 8).sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join("[redacted]");
  }
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[private key redacted]")
    .replace(/\b(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:[^\r\n]+/gi, "[authentication header redacted]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}/gi, "[authorization redacted]")
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s<>"`]+/gi, "[connection string redacted]")
    .replace(/\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*\b["'`* _]*\s*[:=][ \t]*(?:\r?\n[ \t]*)?[^\r\n]+/g, "[credential value redacted]")
    .replace(/https?:\/\/[^\s<>"`)]+/gi, value => {
      try {
        const url = new URL(value);
        if (url.username || url.password || [...url.searchParams.keys()].some(key => /token|secret|password|api.?key|signature|credential|authorization|x-amz-/i.test(key))) return "[credential URL redacted]";
      } catch { return "[invalid URL omitted]"; }
      return value;
    })
    .replace(/\b(?:sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{12,}|hsoat_[A-Za-z0-9_-]{12,}|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16})\b/g, "[token redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
    .replace(/\b(?:user[ _-]?name|login|password|passwd|passcode|pwd|api[ _-]?(?:key|token)|access[ _-]?token|refresh[ _-]?token|token|client[ _-]?secret|secret|credentials?)\b["'`* _]*\s*(?::|=|\bis\b|\bare\b)[ \t]*(?:\r?\n[ \t]*)?[^\r\n]+/gi, "[credential value redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/(?<![A-Za-z0-9_/-])(?=[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_/-]))(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_/-])/g, "[token redacted]");
}

export function environmentSecrets(environment = process.env) {
  return Object.entries(environment).filter(([key]) => !key.startsWith("NEXT_PUBLIC_")
    && /SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL/.test(key)).map(([, value]) => value);
}
