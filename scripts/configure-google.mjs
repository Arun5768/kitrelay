import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const file = process.argv[2];
if (!file) {
  console.error(
    "Usage: node scripts/configure-google.mjs <downloaded-google-oauth-json>",
  );
  process.exit(1);
}
const config = JSON.parse(await readFile(resolve(file), "utf8"));
const client = config.web;
if (!client?.client_id || !client?.client_secret)
  throw Error(
    "Download a Web application OAuth client JSON from Google Cloud.",
  );
const hosting = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const origin = hosting.vars?.APP_ORIGIN;
if (!origin || !client.redirect_uris?.includes(origin + "/api/auth/callback"))
  throw Error(
    "Add " +
      origin +
      "/api/auth/callback to the Google OAuth client authorized redirect URIs, then download the JSON again.",
  );
async function secret(name, value) {
  return new Promise((res, rej) => {
    const child = spawn(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", "secret", "put", name],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", rej);
    child.on("close", (code) =>
      code === 0
        ? res()
        : rej(
            Error(
              "Cloudflare secret upload failed for " +
                name +
                ". Check your Wrangler login.",
            ),
          ),
    );
    child.stdin.end(value + "\n");
  });
}
await secret("GOOGLE_CLIENT_ID", client.client_id);
await secret("GOOGLE_CLIENT_SECRET", client.client_secret);
console.log(
  "Google OAuth credentials installed securely in Cloudflare. Sign in at " +
    origin +
    "/#/login",
);
