export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const assert = (ok, status, message) => {
  if (!ok) throw new HttpError(status, message);
};
export const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function challenge(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export const safeReturn = (p) =>
  typeof p === "string" &&
  /^\/#\/(?:desk|integrations|team|invite\/[a-f0-9]{64})$/.test(p)
    ? p
    : "/#/desk";
export function checkOrigin(req, origin) {
  assert(req.headers.get("origin") === origin, 403, "Request origin rejected.");
  assert(
    req.headers.get("content-type")?.startsWith("application/json"),
    415,
    "Use application/json.",
  );
}
async function key(secret) {
  assert(secret, 503, "Token encryption is not configured.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(secret), (x) => x.charCodeAt(0));
  } catch {
    throw new HttpError(503, "Token encryption is not configured.");
  }
  assert(bytes.length === 32, 503, "Token encryption is not configured.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(text, secret, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    await key(secret),
    new TextEncoder().encode(text),
  );
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(data)));
}
export async function unseal(text, secret, context) {
  const bytes = Uint8Array.from(atob(text), (x) => x.charCodeAt(0));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(0, 12),
        additionalData: new TextEncoder().encode(context),
      },
      await key(secret),
      bytes.slice(12),
    ),
  );
}
export const cookie = (name, value, age, secure = true) =>
  `${secure ? "__Host-" : ""}${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
export const getCookie = (req, name, secure = true) => {
  const prefix = (secure ? "__Host-" : "") + name + "=";
  return (
    (req.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(prefix))
      ?.slice(prefix.length) || ""
  );
};
