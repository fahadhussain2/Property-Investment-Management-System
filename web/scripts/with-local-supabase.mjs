#!/usr/bin/env node
// Runs a command with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY taken from the local Supabase stack,
// so local development needs no .env file. Values already set in the environment win
// (production builds get them from Cloudflare Pages settings).
// Usage: node scripts/with-local-supabase.mjs <command> [...args]
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  const cli = path.join(repoRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
  let out
  try {
    out = execFileSync(process.execPath, [cli, 'status', '-o', 'env'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    console.error('Local Supabase is not running. Start it with `npm run db:start` in the repo root.')
    process.exit(1)
  }
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => l.match(/^(\w+)="(.*)"$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
  process.env.VITE_SUPABASE_URL ??= env.API_URL
  process.env.VITE_SUPABASE_ANON_KEY ??= env.ANON_KEY
}

// Run local package binaries (vite, …) straight through node. Going through the Windows .cmd shims
// breaks on paths containing "&", and this repo's folder name has one.
function resolveLocalBin(cmd) {
  const pkgJson = path.join(repoRoot, 'web', 'node_modules', cmd, 'package.json')
  try {
    const { bin } = JSON.parse(readFileSync(pkgJson, 'utf8'))
    const rel = typeof bin === 'string' ? bin : bin?.[cmd]
    return rel ? path.join(path.dirname(pkgJson), rel) : null
  } catch {
    return null
  }
}

const [cmd, ...args] = process.argv.slice(2)
const localBin = resolveLocalBin(cmd)
const child = localBin
  ? spawn(process.execPath, [localBin, ...args], { stdio: 'inherit' })
  : spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
child.on('exit', (code) => process.exit(code ?? 1))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
