import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const command = args[0];
const local = args.includes("--local");
const remote = args.includes("--remote");
const hashIndex = args.indexOf("--hash");
const suppliedHash = hashIndex >= 0 ? args[hashIndex + 1] : undefined;
const help = `Usage:
  node scripts/invite.mjs create --local
  node scripts/invite.mjs create --remote
  node scripts/invite.mjs revoke --local --hash <64-character-hash>
  node scripts/invite.mjs revoke --remote --hash <64-character-hash>

Creates a cryptographically random invitation and stores only its SHA-256 digest in D1.
The code is printed once after a successful insert. Give it privately to one friend.
No code is written to files or passed to Wrangler. Use the printed digest to revoke it.
Explicit --local or --remote is required; this script never chooses production implicitly.`;

function die(message) {
  console.error(message);
  process.exit(1);
}
if (args.includes("--help") || !command) {
  console.log(help);
  process.exit(0);
}
if (!["create", "revoke"].includes(command) || local === remote) die(help);
const accepted = new Set([
  command,
  local ? "--local" : "--remote",
  "--hash",
  suppliedHash,
]);
if (args.some((arg) => !accepted.has(arg))) die(help);
if (command === "create" && hashIndex >= 0)
  die("create generates its own invitation; --hash is not accepted.");
if (command === "revoke" && !/^[a-f0-9]{64}$/u.test(suppliedHash || ""))
  die("A valid SHA-256 digest is required.");

const token =
  command === "create"
    ? `lr_${randomBytes(32).toString("base64url")}`
    : undefined;
const digest = token
  ? createHash("sha256").update(`liuren-invite-v1\0${token}`).digest("hex")
  : suppliedHash;
const sql =
  command === "create"
    ? `INSERT INTO invitations (token_hash) VALUES ('${digest}');`
    : `UPDATE invitations SET revoked_at = unixepoch() WHERE token_hash = '${digest}';`;
// Only a validated hexadecimal digest reaches SQL and command arguments.
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "daliuren-private",
    local ? "--local" : "--remote",
    "--command",
    sql,
  ],
  { cwd: root, encoding: "utf8", windowsHide: true },
);
if (result.status !== 0) {
  console.error(
    result.stderr ||
      "D1 command failed. Verify login, database ID and migrations.",
  );
  process.exit(result.status || 1);
}
console.log(`Invitation digest: ${digest}`);
if (token) console.log(`Invitation code (shown once): ${token}`);
else console.log("Invitation revoked if the digest exists.");
