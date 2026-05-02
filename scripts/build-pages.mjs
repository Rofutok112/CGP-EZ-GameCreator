import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const disabledRoot = ".pages-build-disabled";
const moves = [
  ["src/app/api", join(disabledRoot, "api")],
  ["src/app/teacher", join(disabledRoot, "teacher")]
];

let exitCode = 1;

try {
  rmSync(".next", { recursive: true, force: true });
  rmSync(disabledRoot, { recursive: true, force: true });
  mkdirSync(disabledRoot, { recursive: true });
  for (const [from, to] of moves) {
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "build"], {
    env: { ...process.env, GITHUB_PAGES: "true" },
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally {
  for (const [from, to] of moves.toReversed()) {
    try {
      renameSync(to, from);
    } catch {
      // If a move failed before build, there is nothing to restore.
    }
  }
  rmSync(disabledRoot, { recursive: true, force: true });
}

process.exit(exitCode);
