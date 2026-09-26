#!/usr/bin/env node
// Runs every scenario in evals/cases against the local database.
// Each case runs in its own transaction as real `authenticated` users (RLS on) and is rolled back.
// Usage: npm run evals [-- <filter>]
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const DB_URL = process.env.EVALS_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const CASES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')
const OPENING_DATE = '2025-12-31'

class Ctx {
  constructor(client) {
    this.client = client
    this.orgs = {} // key -> { id, accounts: {code|bank:Name -> id}, properties: {code -> id}, parties: {name -> id} }
    this.users = {} // key -> uuid
    this.vouchers = {} // step id -> voucher id
  }
  q(sql, params) {
    return this.client.query(sql, params)
  }
  async admin() {
    await this.q('reset role')
  }
  async as(userKey) {
    await this.q('reset role')
    const claims = JSON.stringify({ sub: this.users[userKey], role: 'authenticated' })
    await this.q("select set_config('request.jwt.claims', $1, true)", [claims])
    await this.q('set local role authenticated')
  }
  async createUser(key) {
    const id = randomUUID()
    await this.admin()
    await this.q(
      `insert into auth.users (id, instance_id, email, aud, role)
       values ($1, '00000000-0000-0000-0000-000000000000', $2, 'authenticated', 'authenticated')`,
      [id, `${key}.${id.slice(0, 8)}@evals.local`],
    )
    this.users[key] = id
    return id
  }
  account(org, ref) {
    const id = org.accounts[ref]
    if (!id) throw new Error(`unknown account ref "${ref}"`)
    return id
  }
}

async function setupOrg(ctx, key, spec, ownerKey) {
  await ctx.as(ownerKey)
  const { rows } = await ctx.q('select public.create_organization($1) as id', [`Eval ${key}`])
  const org = { id: rows[0].id, accounts: {}, properties: {}, parties: {}, leases: {} }
  ctx.orgs[key] = org

  const accts = await ctx.q('select id, code from public.accounts where org_id = $1', [org.id])
  for (const a of accts.rows) org.accounts[a.code] = a.id

  const opening = []
  for (const b of spec.banks ?? []) {
    const r = await ctx.q("select public.add_money_account($1, 'bank', $2, $2) as id", [org.id, b.name])
    org.accounts[`bank:${b.name}`] = r.rows[0].id
    if (Number(b.opening) > 0) opening.push({ account_id: r.rows[0].id, debit: b.opening })
  }
  if (Number(spec.cash_opening ?? 0) > 0) {
    opening.push({ account_id: org.accounts['1000'], debit: spec.cash_opening })
  }
  for (const p of spec.properties ?? []) {
    const r = await ctx.q(
      'insert into public.properties (org_id, code, kind) values ($1, $2, $3) returning id',
      [org.id, p.code, p.kind],
    )
    org.properties[p.code] = r.rows[0].id
    if (p.opening_cost) {
      opening.push({ account_id: org.accounts['1200'], debit: p.opening_cost, property_id: r.rows[0].id })
    }
  }
  for (const p of spec.parties ?? []) {
    const r = await ctx.q(
      'insert into public.parties (org_id, name, roles) values ($1, $2, $3) returning id',
      [org.id, p.name, p.roles ?? []],
    )
    org.parties[p.name] = r.rows[0].id
  }
  for (const l of spec.leases ?? []) {
    const r = await ctx.q(
      `insert into public.leases (org_id, property_id, party_id, start_date, end_date, monthly_rent, rent_due_day)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [org.id, org.properties[l.property], org.parties[l.party], l.start, l.end ?? null, l.monthly_rent, l.rent_due_day ?? 1],
    )
    if (l.key) org.leases[l.key] = r.rows[0].id
  }
  if (opening.length) {
    await ctx.q('select public.post_voucher($1, $2)', [
      org.id,
      { type: 'opening', date: OPENING_DATE, lines: opening },
    ])
  }
  return org
}

// Scenario step (human-friendly refs) -> post_voucher payload (ids).
function toPayload(ctx, org, step) {
  const p = { type: step.type }
  for (const k of ['date', 'memo', 'period', 'price', 'paid_now', 'received_now', 'amount', 'direction']) {
    if (step[k] !== undefined) p[k] = step[k]
  }
  if (step.property) p.property_id = org.properties[step.property]
  if (step.party) p.party_id = org.parties[step.party]
  if (step.lease) p.lease_id = org.leases[step.lease]
  const money = step.from ?? step.into
  if (money) p.account_id = ctx.account(org, money)
  if (step.type === 'transfer') p.to_account_id = ctx.account(org, step.to)
  if (step.account) p.category_account_id = ctx.account(org, step.account)
  if (step.lines) {
    p.lines = step.lines.map((l) => ({
      account_id: ctx.account(org, l.account),
      ...(l.debit && { debit: l.debit }),
      ...(l.credit && { credit: l.credit }),
      ...(l.property && { property_id: org.properties[l.property] }),
      ...(l.party && { party_id: org.parties[l.party] }),
    }))
  }
  return p
}

async function statuses(ctx, org) {
  const { rows } = await ctx.q('select code, status from public.property_summary($1)', [org.id])
  return Object.fromEntries(rows.map((r) => [r.code, r.status]))
}

// Stable stringify: object key order must not matter when comparing results.
const canonical = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  )

function check(failures, label, actual, expected) {
  const a = canonical(actual)
  const e = canonical(expected)
  if (a !== e) failures.push(`${label}: expected ${e}, got ${a}`)
}

async function runSingleOrgCase(ctx, c, failures) {
  await ctx.createUser('owner')
  const org = await setupOrg(ctx, 'main', c.setup, 'owner')
  const history = {}
  const snap = async () => {
    for (const [code, s] of Object.entries(await statuses(ctx, org))) {
      history[code] ??= []
      if (history[code].at(-1) !== s) history[code].push(s)
    }
  }
  await snap()

  for (const step of c.steps) {
    let res
    if (step.type === 'edit') {
      res = await ctx.q('select public.edit_voucher($1, $2) as r', [ctx.vouchers[step.voucher], step.changes])
    } else {
      res = await ctx.q('select public.post_voucher($1, $2) as r', [org.id, toPayload(ctx, org, step)])
    }
    if (step.id) ctx.vouchers[step.id] = res.rows[0].r.id
    await snap()
  }

  const x = c.expect
  if (x.property_summary) {
    const { rows } = await ctx.q('select * from public.property_summary($1)', [org.id])
    for (const [code, fields] of Object.entries(x.property_summary)) {
      const row = rows.find((r) => r.code === code)
      for (const [f, v] of Object.entries(fields)) check(failures, `property_summary.${code}.${f}`, row?.[f], v)
    }
  }
  if (x.income_statement) {
    const { from, to, ...fields } = x.income_statement
    const { rows } = await ctx.q('select public.income_statement($1, $2, $3) as r', [org.id, from, to])
    for (const [f, v] of Object.entries(fields)) check(failures, `income_statement.${f}`, rows[0].r[f], v)
  }
  if (x.balances) {
    const { rows } = await ctx.q('select account_id, balance from public.account_balances($1)', [org.id])
    for (const [ref, v] of Object.entries(x.balances)) {
      const id = ctx.account(org, ref)
      check(failures, `balance[${ref}]`, rows.find((r) => r.account_id === id)?.balance, v)
    }
  }
  if (x.ledger) {
    const { rows } = await ctx.q('select * from public.account_ledger($1, $2, $3, $4) order by seq', [
      org.id, ctx.account(org, x.ledger.account), x.ledger.from, x.ledger.to,
    ])
    check(failures, 'ledger.opening', rows[0].balance, x.ledger.opening)
    check(failures, 'ledger.lines', rows.length - 1, x.ledger.lines)
    check(failures, 'ledger.closing', rows.at(-1).balance, x.ledger.closing)
  }
  if (x.status_history) {
    for (const [code, v] of Object.entries(x.status_history)) check(failures, `status_history.${code}`, history[code], v)
  }
  if (x.voucher_count) {
    for (const [type, n] of Object.entries(x.voucher_count)) {
      const { rows } = await ctx.q('select count(*)::int n from public.vouchers where org_id = $1 and type = $2', [org.id, type])
      check(failures, `voucher_count.${type}`, rows[0].n, n)
    }
  }
  if (x.voucher_status) {
    for (const [id, s] of Object.entries(x.voucher_status)) {
      const { rows } = await ctx.q('select status from public.vouchers where id = $1', [ctx.vouchers[id]])
      check(failures, `voucher_status.${id}`, rows[0]?.status, s)
    }
  }
  if (x.audit_log_entries_for) {
    for (const [id, { min }] of Object.entries(x.audit_log_entries_for)) {
      const { rows } = await ctx.q('select count(*)::int n from public.audit_log where voucher_id = $1', [ctx.vouchers[id]])
      if (rows[0].n < min) failures.push(`audit_log_entries_for.${id}: expected >= ${min}, got ${rows[0].n}`)
    }
  }
  if (x.party_balances) {
    const { rows } = await ctx.q('select * from public.party_balances($1)', [org.id])
    for (const [name, fields] of Object.entries(x.party_balances)) {
      const row = rows.find((r) => r.name === name)
      for (const [f, v] of Object.entries(fields)) check(failures, `party_balances.${name}.${f}`, row?.[f], v)
    }
  }
  if (x.balance_sheet) {
    const { as_of, ...fields } = x.balance_sheet
    const { rows } = await ctx.q('select public.balance_sheet($1, $2) as r', [org.id, as_of])
    for (const [f, v] of Object.entries(fields)) check(failures, `balance_sheet.${f}`, rows[0].r[f], v)
  }
  if (x.rent_roll) {
    const { as_of, ...byCode } = x.rent_roll
    const { rows } = await ctx.q('select * from public.rent_roll($1, $2)', [org.id, as_of])
    for (const [code, fields] of Object.entries(byCode)) {
      const row = rows.find((r) => r.property_code === code)
      for (const [f, v] of Object.entries(fields)) check(failures, `rent_roll.${code}.${f}`, row?.[f], v)
    }
  }
  if (x.voucher_lease) {
    for (const [id, key] of Object.entries(x.voucher_lease)) {
      const { rows } = await ctx.q('select lease_id from public.vouchers where id = $1', [ctx.vouchers[id]])
      check(failures, `voucher_lease.${id}`, rows[0]?.lease_id, org.leases[key])
    }
  }
  if (x.trial_balance_difference !== undefined) {
    check(failures, 'trial_balance_difference', await tbDifference(ctx, org), x.trial_balance_difference)
  }
}

async function tbDifference(ctx, org) {
  const { rows } = await ctx.q(
    'select (coalesce(sum(debit), 0) - coalesce(sum(credit), 0))::numeric(18,2)::text d from public.trial_balance($1)',
    [org.id],
  )
  return rows[0].d
}

async function runMultiOrgCase(ctx, c, failures) {
  for (const o of c.setup.orgs) {
    for (const m of o.members) await ctx.createUser(m.key)
    await setupOrg(ctx, o.key, o, o.members[0].key)
  }
  const ownerOf = (key) => c.setup.orgs.find((o) => o.key === key).members[0].key
  const x = c.expect

  for (const step of c.steps) {
    if (step.select) {
      const target = ctx.orgs[step.where_org]
      const tbBefore = x.org2_trial_balance_unchanged
        ? (await ctx.as(ownerOf(step.where_org)), await tbDifference(ctx, target))
        : null
      await ctx.as(step.as)
      for (const table of step.select) {
        const { rows } = await ctx.q(`select count(*)::int n from public.${table} where org_id = $1`, [target.id])
        check(failures, `rows_visible.${table}`, rows[0].n, x.rows_visible)
      }
      if (tbBefore !== null) ctx.tbBefore = { key: step.where_org, value: tbBefore }
    }
    if (step.post_voucher) {
      const target = ctx.orgs[step.post_voucher.org]
      const payload = toPayload(ctx, target, step.post_voucher)
      await ctx.as(step.as)
      await ctx.q('savepoint attempt')
      try {
        await ctx.q('select public.post_voucher($1, $2)', [target.id, payload])
        failures.push('post_voucher into another org unexpectedly succeeded')
      } catch (e) {
        if (!String(e.message).includes(x.post_voucher_error)) {
          failures.push(`post_voucher error: expected "${x.post_voucher_error}", got "${e.message}"`)
        }
      }
      await ctx.q('rollback to savepoint attempt')
    }
  }
  if (x.org2_trial_balance_unchanged && ctx.tbBefore) {
    await ctx.as(ownerOf(ctx.tbBefore.key))
    check(failures, 'org2_trial_balance', await tbDifference(ctx, ctx.orgs[ctx.tbBefore.key]), ctx.tbBefore.value)
  }
}

async function main() {
  const filter = process.argv[2] ?? ''
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json') && f.includes(filter)).sort()
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  let failed = 0

  for (const file of files) {
    const c = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf8'))
    const ctx = new Ctx(client)
    const failures = []
    await client.query('begin')
    try {
      if (c.setup.orgs) await runMultiOrgCase(ctx, c, failures)
      else await runSingleOrgCase(ctx, c, failures)
    } catch (e) {
      failures.push(`error: ${e.message}`)
    } finally {
      await client.query('rollback')
    }
    if (failures.length) {
      failed++
      console.log(`✗ ${file} — ${c.name}`)
      for (const f of failures) console.log(`    ${f}`)
    } else {
      console.log(`✓ ${file} — ${c.name}`)
    }
  }

  await client.end()
  console.log(`\n${files.length - failed}/${files.length} scenarios passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
