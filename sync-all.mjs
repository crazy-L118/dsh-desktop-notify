import { copyFileSync, readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const ROOT = "D:\\dsh plugin\\dsh通知\\dsh-desktop-notify";
const INSTALL = "C:\\Users\\luiva\\.dsh\\profiles\\web\\node_modules\\dsh-desktop-notify";

const JOBS = [
  // lib -> install lib (authoritative load path)
  ["lib/client.js", "lib/client.js"],
  ["lib/index.js", "lib/index.js"],
  ["lib/notify.js", "lib/notify.js"],
  // lib -> install root (redundant legacy copies, kept in sync)
  ["lib/client.js", "client.js"],
  ["lib/index.js", "index.js"],
  ["lib/notify.js", "notify.js"],
  // assets
  ["assets/dsh-icon.svg", "assets/dsh-icon.svg"],
  ["assets/dsh-icon.png", "assets/dsh-icon.png"],
  ["assets/settings-zh.png", "assets/settings-zh.png"],
  ["assets/settings-en.png", "assets/settings-en.png"],
  // docs
  ["README.md", "README.md"],
  ["README_EN.md", "README_EN.md"]
];

function md5(p) {
  return createHash("md5").update(readFileSync(p)).digest("hex");
}

let ok = true;
for (const [relSrc, relDst] of JOBS) {
  const src = resolve(ROOT, relSrc);
  const dst = resolve(INSTALL, relDst);
  if (!existsSync(src)) {
    console.log(`MISSING-SRC ${relSrc}`);
    ok = false;
    continue;
  }
  mkdirSync(resolve(dst, ".."), { recursive: true });
  const srcMd5 = md5(src);
  copyFileSync(src, dst);
  const dstMd5 = md5(dst);
  const match = srcMd5 === dstMd5;
  if (!match) ok = false;
  console.log(`${match ? "OK " : "BAD"} ${relSrc}  ->  ${relDst}  (${statSync(dst).size}B)`);
}
console.log(ok ? "ALL_SYNCED" : "SYNC_FAILED");
process.exitCode = ok ? 0 : 1;
