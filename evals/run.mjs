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
    this.orgs = {} // key -> { id, accounts: {code|bank:Name -> id}, properties: {code -> id}, units: {key -> id}, holdings: {code -> id}, parties: {name -> id}, leases: {key -> id} }
    this.users = {} // key -> uuid
    this.vouchers = {} // step id -> voucher id
    this.entries = {} // register step id -> register entry id (spec 007)
    this.documents = {} // step document key -> document id
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
  const org = { id: rows[0].id, accounts: {}, properties: {}, units: {}, holdings: {}, parties: {}, leases: {}, registers: {} }
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
  // Spec 006: units of a property, { key, property, name }.
  for (const u of spec.units ?? []) {
    const r = await ctx.q('insert into public.property_units (org_id, property_id, name) values ($1, $2, $3) returning id', [
      org.id, org.properties[u.property], u.name,
    ])
    org.units[u.key] = r.rows[0].id
  }
  for (const h of spec.holdings ?? []) {
    const r = await ctx.q(
      'insert into public.holdings (org_id, class, code, name, purity) values ($1, $2, $3, $4, $5) returning id',
      [org.id, h.class, h.code, h.name ?? null, h.purity ?? null],
    )
    org.holdings[h.code] = r.rows[0].id
  }
  for (const r of spec.metal_rates ?? []) {
    await ctx.q('insert into public.metal_rates (org_id, metal, rate_date, rate_per_tola) values ($1, $2, $3, $4)', [
      org.id, r.metal, r.date, r.rate_per_tola,
    ])
  }
  for (const p of spec.parties ?? []) {
    const r = await ctx.q(
      'insert into public.parties (org_id, name, roles) values ($1, $2, $3) returning id',
      [org.id, p.name, p.roles ?? []],
    )
    org.parties[p.name] = r.rows[0].id
  }
  for (const l of spec.leases ?? []) await addLease(ctx, org, l)
  // Spec 007: registers, memo ledgers outside the books: { key, name, opening }.
  for (const g of spec.registers ?? []) {
    const r = await ctx.q('insert into public.registers (org_id, name, opening_balance) values ($1, $2, $3) returning id', [
      org.id, g.name, g.opening ?? '0.00',
    ])
    org.registers[g.key] = r.rows[0].id
  }
  if (opening.length) {
    await ctx.q('select public.post_voucher($1, $2)', [
      org.id,
      { type: 'opening', date: OPENING_DATE, lines: opening },
    ])
  }
  return org
}

// { key, property, unit (unit key, optional: whole property), party, start, end, monthly_rent, rent_due_day }
async function addLease(ctx, org, l) {
  if (l.unit && !org.units[l.unit]) throw new Error(`lease: unknown unit "${l.unit}"`)
  const r = await ctx.q(
    `insert into public.leases (org_id, property_id, unit_id, party_id, start_date, end_date, monthly_rent, rent_due_day)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [org.id, org.properties[l.property], l.unit ? org.units[l.unit] : null, org.parties[l.party], l.start, l.end ?? null,
     l.monthly_rent, l.rent_due_day ?? 1],
  )
  if (l.key) org.leases[l.key] = r.rows[0].id
}

// Scenario step (human-friendly refs) -> post_voucher payload (ids).
function toPayload(ctx, org, step) {
  const p = { type: step.type }
  for (const k of ['date', 'memo', 'period', 'price', 'paid_now', 'received_now', 'amount', 'direction', 'weight', 'unit', 'whole']) {
    if (step[k] !== undefined) p[k] = step[k]
  }
  if (step.property) p.property_id = org.properties[step.property]
  if (step.holding) p.holding_id = org.holdings[step.holding]
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
    if (step.type === 'attach') {
      await attachDocument(ctx, org, step)
      await snap()
      continue
    }
    if (step.type === 'lease') {
      await addLease(ctx, org, step)
      await snap()
      continue
    }
    // A step with "error" must fail with a message containing it, and changes nothing.
    if (step.error) await ctx.q('savepoint step')
    try {
      if (step.type === 'edit') {
        res = await ctx.q('select public.edit_voucher($1, $2) as r', [ctx.vouchers[step.voucher], step.changes])
      } else if (step.type === 'void') {
        res = await ctx.q('select public.reverse_voucher($1, $2) as r', [ctx.vouchers[step.voucher], step.reason ?? null])
      } else if (step.type === 'register') {
        res = await registerStep(ctx, org, step)
      } else {
        res = await ctx.q('select public.post_voucher($1, $2) as r', [org.id, toPayload(ctx, org, step)])
      }
    } catch (e) {
      if (!step.error) throw e
      if (!String(e.message).includes(step.error)) failures.push(`step error: expected "${step.error}", got "${e.message}"`)
      await ctx.q('rollback to savepoint step')
      continue
    }
    if (step.error) {
      failures.push(`step ${step.id ?? step.type} was expected to fail with "${step.error}" but succeeded`)
      await ctx.q('rollback to savepoint step')
      continue
    }
    if (step.id) (step.type === 'register' ? ctx.entries : ctx.vouchers)[step.id] = res.rows[0].r.id
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
  if (x.monthly_performance) {
    const { as_of, months, rows: byMonth = {}, totals = {} } = x.monthly_performance
    const { rows } = await ctx.q(
      "select to_char(month_start, 'YYYY-MM') as month, * from public.monthly_performance($1, $2, $3)",
      [org.id, months, as_of],
    )
    check(failures, 'monthly_performance.rows', rows.length, months)
    for (const [month, fields] of Object.entries(byMonth)) {
      const row = rows.find((r) => r.month === month)
      for (const [f, v] of Object.entries(fields)) check(failures, `monthly_performance.${month}.${f}`, row?.[f], v)
    }
    for (const [f, v] of Object.entries(totals)) {
      const { rows: t } = await ctx.q(
        `select sum(${pg.escapeIdentifier(f)})::numeric(18,2)::text as s from public.monthly_performance($1, $2, $3)`,
        [org.id, months, as_of],
      )
      check(failures, `monthly_performance.totals.${f}`, t[0].s, v)
    }
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
    // Keyed by property code, or by "lease:<key>" when a property has several leases (spec 006).
    const { as_of, ...byCode } = x.rent_roll
    const { rows } = await ctx.q('select * from public.rent_roll($1, $2)', [org.id, as_of])
    for (const [code, fields] of Object.entries(byCode)) {
      const row = code.startsWith('lease:')
        ? rows.find((r) => r.lease_id === org.leases[code.slice('lease:'.length)])
        : rows.find((r) => r.property_code === code)
      for (const [f, v] of Object.entries(fields)) check(failures, `rent_roll.${code}.${f}`, row?.[f], v)
    }
  }
  if (x.voucher_lease) {
    for (const [id, key] of Object.entries(x.voucher_lease)) {
      const { rows } = await ctx.q('select lease_id from public.vouchers where id = $1', [ctx.vouchers[id]])
      check(failures, `voucher_lease.${id}`, rows[0]?.lease_id, org.leases[key])
    }
  }
  if (x.holdings_overview) {
    const { rows } = await ctx.q('select * from public.holdings_overview where org_id = $1', [org.id])
    for (const [code, fields] of Object.entries(x.holdings_overview)) {
      const row = rows.find((r) => r.code === code)
      for (const [f, v] of Object.entries(fields)) check(failures, `holdings_overview.${code}.${f}`, row?.[f], v)
    }
  }
  if (x.holdings_valuation) {
    const { as_of, ...byClass } = x.holdings_valuation
    const { rows } = await ctx.q('select * from public.holdings_valuation($1, $2)', [org.id, as_of])
    for (const [cls, fields] of Object.entries(byClass)) {
      const row = rows.find((r) => r.class === cls)
      for (const [f, v] of Object.entries(fields)) check(failures, `holdings_valuation.${cls}.${f}`, row?.[f], v)
    }
  }
  if (x.documents) {
    for (const [key, fields] of Object.entries(x.documents)) {
      const { rows } = await ctx.q('select * from public.documents_overview where id = $1', [ctx.documents[key]])
      const row = rows[0]
      for (const [f, v] of Object.entries(fields)) {
        if (f === 'voucher') check(failures, `documents.${key}.voucher`, row?.voucher_id, ctx.vouchers[v])
        else check(failures, `documents.${key}.${f}`, row?.[f] === undefined ? undefined : String(row[f]), v)
      }
    }
  }
  if (x.register) {
    // { "<key>": { balance, total_in, total_out, entry_count, balances: [running balance of each ledger line, in order] } }
    const { rows } = await ctx.q('select * from public.registers_overview where org_id = $1', [org.id])
    for (const [key, fields] of Object.entries(x.register)) {
      const { balances, ...overview } = fields
      const row = rows.find((r) => r.id === org.registers[key])
      for (const [f, v] of Object.entries(overview)) check(failures, `register.${key}.${f}`, row?.[f], v)
      if (balances) {
        const led = await ctx.q('select running_balance from public.register_ledger($1) order by entry_date, seq', [org.registers[key]])
        check(failures, `register.${key}.balances`, led.rows.map((r) => r.running_balance), balances)
      }
    }
  }
  if (x.storage_used !== undefined) {
    const { rows } = await ctx.q('select public.storage_used($1)::text as n', [org.id])
    check(failures, 'storage_used', rows[0].n, x.storage_used)
  }
  if (x.trial_balance_difference !== undefined) {
    check(failures, 'trial_balance_difference', await tbDifference(ctx, org), x.trial_balance_difference)
  }
}

// Spec 007: { type: 'register', op: 'add' | 'correct' | 'void', register, entry (the step id of the line to correct or
// void), date, description, direction, amount, reason }. A step with an `id` names the line it creates.
async function registerStep(ctx, org, step) {
  const one = async (sql, params) => ({ rows: [{ r: { id: (await ctx.q(sql, params)).rows[0].id } }] })
  if (step.op === 'add') {
    return one('select public.add_register_entry($1, $2, $3, $4, $5) as id', [
      org.registers[step.register], step.date, step.description, step.direction, step.amount,
    ])
  }
  if (step.op === 'correct') {
    return one('select public.correct_register_entry($1, $2, $3, $4, $5, $6) as id', [
      ctx.entries[step.entry], step.date, step.description, step.direction, step.amount, step.reason ?? null,
    ])
  }
  if (step.op === 'void') {
    return one('select public.void_register_entry($1, $2)::text as id', [ctx.entries[step.entry], step.reason ?? null])
  }
  throw new Error(`register step: unknown op "${step.op}"`)
}

// Spec 004: "uploads" a file the way the Storage API does (as the current user, RLS on), then records it.
// { type: 'attach', document: key, file, size, mime, category, title, to: { property|lease|party|holding|voucher: ref } }
async function attachDocument(ctx, org, step) {
  const id = randomUUID()
  const storagePath = `${org.id}/${id}/${step.file}`
  await ctx.q(
    `insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('documents', $1, auth.uid()::text, jsonb_build_object('size', $2::bigint, 'mimetype', $3::text))`,
    [storagePath, step.size ?? 1000, step.mime ?? 'application/pdf'],
  )
  const [[kind, ref]] = Object.entries(step.to)
  const target = {
    property: org.properties, lease: org.leases, party: org.parties, holding: org.holdings, voucher: ctx.vouchers,
  }[kind][ref]
  if (!target) throw new Error(`attach: unknown ${kind} "${ref}"`)
  await ctx.q('select public.add_document($1, $2, $3, $4, $5, $6)', [
    org.id, id, storagePath, step.category ?? 'other', step.title ?? null, { [`${kind}_id`]: target },
  ])
  ctx.documents[step.document] = id
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
