import { createHmac } from "node:crypto";

export function signChatKitRequest(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("CHATKIT_BACKEND_SECRET must contain at least 32 characters.");
  }
  const date = String(timestamp);
  return {
    "x-chatkit-timestamp": date,
    "x-chatkit-signature": createHmac("sha256", secret)
      .update(`${date}.`).update(body).digest("hex"),
  };
}

export function chatKitBackendUrl(value, production = process.env.NODE_ENV === "production") {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && local && !production))
    || url.pathname !== "/") {
    throw new Error("CHATKIT_BACKEND_URL must be an HTTPS origin (local HTTP is allowed in development).");
  }
  return new URL("/chatkit", url);
}
