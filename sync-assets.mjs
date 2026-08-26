import { copyFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ZH = "C:\\Users\\luiva\\.workbuddy\\clipboard-images\\clipboard-2026-08-26T13-53-30-668Z-1addafb1.png";
const SRC_EN = "C:\\Users\\luiva\\.workbuddy\\clipboard-images\\clipboard-2026-08-26T13-53-30-669Z-faa446c3.png";

const ASSETS = "D:\\dsh plugin\\dsh通知\\dsh-desktop-notify\\assets";
const INSTALL = "C:\\Users\\luiva\\.dsh\\profiles\\web\\node_modules\\dsh-desktop-notify\\assets";

const files = [
  { src: SRC_ZH, name: "settings-zh.png" },
  { src: SRC_EN, name: "settings-en.png" }
];

function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function size(p) {
  try {
    return statSync(p).size;
  } catch {
    return -1;
  }
}

ensure(ASSETS);
ensure(INSTALL);

for (const { src, name } of files) {
  const dstProject = resolve(ASSETS, name);
  const dstInstall = resolve(INSTALL, name);
  const srcSize = size(src);
  copyFileSync(src, dstProject);
  copyFileSync(src, dstInstall);
  const projectSize = size(dstProject);
  const installSize = size(dstInstall);
  const projectOk = projectSize === srcSize;
  const installOk = installSize === srcSize;
  console.log(`${name} src=${srcSize} project=${projectSize} install=${installSize} ${projectOk && installOk ? "OK" : "BAD"}`);
}
