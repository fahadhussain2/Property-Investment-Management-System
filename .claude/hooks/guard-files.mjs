#!/usr/bin/env node
// PreToolUse guard (Edit|Write|MultiEdit). Exit 2 = block, stderr is shown to Claude.
// 1. Migrations already committed on `main` are append-only.
// 2. Existing eval cases are frozen (they are the spec); set ALLOW_EVAL_EDIT=1 to override as a human.
// 3. Never write env/secret files.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const { tool_input = {}, cwd = process.cwd() } = JSON.parse(input || "{}");
  const file = tool_input.file_path;
  if (!file) process.exit(0);

  const rel = path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join("/");
  const block = (msg) => {
    process.stderr.write(msg);
    process.exit(2);
  };

  if (/(^|\/)\.env(\.|$)/.test(rel) && !rel.endsWith(".env.example")) {
    block(`Blocked: ${rel} holds secrets. Ask the human to edit it.`);
  }

  if (rel.startsWith("supabase/migrations/")) {
    try {
      execFileSync("git", ["cat-file", "-e", `main:${rel}`], { cwd, stdio: "ignore" });
      block(`Blocked: ${rel} is already on main. Migrations are append-only; create a new migration instead.`);
    } catch {
      /* not on main yet: editing is fine */
    }
  }

  if (rel.startsWith("evals/cases/") && existsSync(path.resolve(cwd, rel)) && process.env.ALLOW_EVAL_EDIT !== "1") {
    block(`Blocked: ${rel} is a frozen acceptance scenario. Fix the code, not the expectation. A human can change it with ALLOW_EVAL_EDIT=1.`);
  }

  process.exit(0);
});
