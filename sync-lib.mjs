import { copyFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

const SRC = "D:\\dsh plugin\\dsh通知\\dsh-desktop-notify\\lib";
const INST_ROOT = "C:\\Users\\luiva\\.dsh\\profiles\\web\\node_modules\\dsh-desktop-notify";
const INST_LIB = "C:\\Users\\luiva\\.dsh\\profiles\\web\\node_modules\\dsh-desktop-notify\\lib";
const FILES = ["client.js", "index.js", "notify.js"];

function md5(p) {
  return createHash("md5").update(readFileSync(p)).digest("hex");
}

let ok = true;
for (const dstDir of [INST_ROOT, INST_LIB]) {
  if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
  for (const f of FILES) {
    const src = resolve(SRC, f);
    const dst = resolve(dstDir, f);
    const srcMd5 = md5(src);
    copyFileSync(src, dst);
    const dstMd5 = md5(dst);
    const match = srcMd5 === dstMd5;
    if (!match) ok = false;
    console.log(`${match ? "OK " : "BAD"} ${f} -> ${dstDir}  src=${srcMd5}  dst=${dstMd5}`);
  }
}
console.log(ok ? "ALL_SYNCED" : "SYNC_FAILED");
process.exitCode = ok ? 0 : 1;
