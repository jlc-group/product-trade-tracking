#!/usr/bin/env node
// SAFETY GUARD (2026-10-01): FlowTrade's `flowtrade` schema now holds real data, and this suite
// wipes the schema it runs against. It is disabled until it is moved to a throw-away database
// (see apps/api/test/README.md). Never point it at the real DATABASE_URL.
if (!process.env.E2E_DATABASE_URL) {
  console.error('e2e is disabled: it wipes its database. Set E2E_DATABASE_URL to a throw-away PostgreSQL (never the real one) — see apps/api/test/README.md.')
  process.exit(1)
}
// FlowTrade API — end-to-end test against the local TEST database (PostgreSQL schema "flowtrade" only).
//
//   cd apps/api && npm run build && npm run test:e2e
//
// What it does:
//   1. re-seeds the "flowtrade" schema with the demo dataset (node dist/seed/seed.js — no other schema is touched)
//   2. starts the built API (node dist/main.js) as a child process on PORT=3100 with ENABLE_DEMO_LOGIN=true
//      (.env is loaded by config.ts; env vars set here win over .env)
//   3. exercises every route in ENDPOINTS.md as admin / manager / users with separate cookie jars
//   4. ends with POST /dev/reset, so the schema is left holding clean demo data
// Prints PASS/FAIL per check and a summary; exits 1 on any failure. The child server is always stopped.
// Dependency-free: Node 20+ (global fetch, Headers#getSetCookie).
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHARED_DIST = path.resolve(API_DIR, '../../packages/shared/dist')
const PORT = process.env.E2E_PORT ?? '3100'
const BASE = `http://localhost:${PORT}/api/v1`
/** The only schema this test may write to (the seed wipes and refills it). */
const SCHEMA = 'flowtrade'

const { DEMO_PASSWORD } = await import(pathToFileURL(path.join(SHARED_DIST, 'demo-seed.js')).href)
const { addDays, diffDays, planFromTemplate, todayBangkok } = await import(pathToFileURL(path.join(SHARED_DIST, 'index.js')).href)

const childEnv = { ...process.env, PORT, ENABLE_DEMO_LOGIN: 'true', NODE_ENV: 'test', DB_SCHEMA: SCHEMA }

// ---------------------------------------------------------------------------------------------
// reporting

let passed = 0
const failures = []

function check(name, ok, detail) {
  if (ok) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? `\n        ${String(detail).replace(/\n/g, '\n        ')}` : ''}`)
  }
  return !!ok
}

const brief = (r) => `HTTP ${r.status} ${r.text.length > 500 ? `${r.text.slice(0, 500)}…` : r.text}`

/** Status (number or list) plus an optional predicate on the response. */
function expect(name, r, status, predicate) {
  const statusOk = Array.isArray(status) ? status.includes(r.status) : r.status === status
  let ok = statusOk
  let note = ''
  if (ok && predicate) {
    try {
      ok = !!predicate(r.json, r)
    } catch (e) {
      ok = false
      note = ` (predicate threw: ${e.message})`
    }
  }
  return check(name, ok, ok ? '' : brief(r) + note)
}

/** Error envelope: { status, code, message } with an optional Thai message fragment. */
function expectError(name, r, status, code, fragment) {
  const statuses = Array.isArray(status) ? status : [status]
  const codes = Array.isArray(code) ? code : [code]
  const ok =
    statuses.includes(r.status) &&
    r.json &&
    codes.includes(r.json.code) &&
    r.json.status === r.status &&
    typeof r.json.message === 'string' &&
    (!fragment || r.json.message.includes(fragment))
  return check(name, ok, ok ? '' : brief(r))
}

class Abort extends Error {}
/** Precondition for the rest of a section. */
function must(value, what) {
  if (!value) throw new Abort(`precondition failed: ${what}`)
  return value
}

async function section(title, fn) {
  console.log(`\n== ${title}`)
  try {
    await fn()
  } catch (e) {
    check(`${title}: completed without an exception`, false, e instanceof Abort ? e.message : (e?.stack ?? String(e)))
  }
}

// ---------------------------------------------------------------------------------------------
// HTTP client with a per-user cookie jar

class Client {
  constructor(name) {
    this.name = name
    this.jar = new Map()
  }

  storeCookies(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq < 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const expired = attrs.some((a) => {
        const [k, ...rest] = a.trim().split('=')
        const v = rest.join('=')
        const key = k.toLowerCase()
        return (key === 'max-age' && Number(v) <= 0) || (key === 'expires' && Date.parse(v) <= Date.now())
      })
      if (!value || expired) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  async req(method, url, { body, csrf = true, headers = {} } = {}) {
    const h = { Accept: 'application/json', ...headers }
    if (csrf && method !== 'GET') h['X-FlowTrade-Request'] = '1'
    if (body !== undefined) h['Content-Type'] = 'application/json'
    if (this.jar.size) h.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    this.storeCookies(res)
    const text = await res.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
    }
    return { status: res.status, text, json }
  }

  get(url, opts) {
    return this.req('GET', url, opts)
  }
  post(url, body, opts = {}) {
    return this.req('POST', url, { ...opts, body })
  }
  put(url, body, opts = {}) {
    return this.req('PUT', url, { ...opts, body })
  }
  patch(url, body, opts = {}) {
    return this.req('PATCH', url, { ...opts, body })
  }
  del(url, opts) {
    return this.req('DELETE', url, opts)
  }
}

// ---------------------------------------------------------------------------------------------
// helpers

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v)
const today = todayBangkok()
const byTitle = (list, title) => list.find((x) => x.title === title)
const ids = (list) => list.map((x) => x.id)
const sortedBy = (list, cmp) => list.every((x, i) => i === 0 || cmp(list[i - 1], x) <= 0)
/** Key-order-insensitive JSON for deep comparisons. */
const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))
const hasKeys = (obj, keys) => obj && keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))

/** Level rules of a flat task list: level 1 ⇔ no parent, child = parent + 1, max 3, parent in the same list. */
function treeIsValid(tasks) {
  const map = new Map(tasks.map((t) => [t.id, t]))
  return tasks.every((t) => {
    if (t.level < 1 || t.level > 3) return false
    if (t.parentId === null) return t.level === 1
    const parent = map.get(t.parentId)
    return !!parent && parent.level + 1 === t.level
  })
}

const PROPOSAL_KEYS = ['id', 'code', 'title', 'channel', 'storeId', 'shelfTypeId', 'targetDate', 'status', 'ownerId', 'memberIds', 'productIds', 'templateId', 'note', 'createdAt', 'updatedAt', 'completedAt']
const TASK_KEYS = ['id', 'proposalId', 'parentId', 'level', 'title', 'description', 'startDate', 'dueDate', 'assigneeIds', 'priority', 'isDone', 'completedAt', 'completedById', 'sortOrder', 'createdById', 'createdAt', 'updatedAt']
const LIST_ITEM_KEYS = [...PROPOSAL_KEYS, 'progress', 'overdueCount', 'openTaskCount', 'nextDueDate', 'store', 'shelfType', 'owner', 'products']
const USER_KEYS = ['id', 'email', 'name', 'nickname', 'department', 'position', 'role', 'isActive', 'mustChangePassword', 'avatarColor', 'lastLoginAt', 'createdAt']
const CONTEXT_KEYS = ['task', 'proposal', 'store', 'path']

// ---------------------------------------------------------------------------------------------
// server lifecycle

let server = null
const serverLog = []

function runSeed() {
  const r = spawnSync(process.execPath, ['--enable-source-maps', 'dist/seed/seed.js'], { cwd: API_DIR, env: childEnv, encoding: 'utf8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  return { ok: r.status === 0, out }
}

function startServer() {
  server = spawn(process.execPath, ['--enable-source-maps', 'dist/main.js'], { cwd: API_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  const collect = (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) serverLog.push(line)
  }
  server.stdout.on('data', collect)
  server.stderr.on('data', collect)
  server.on('exit', (code, signal) => {
    serverLog.push(`[server exited code=${code} signal=${signal}]`)
    server = null
  })
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!server) return false
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return true
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

async function stopServer() {
  if (!server) return
  const proc = server
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  proc.kill('SIGTERM')
  const timer = setTimeout(() => proc.kill('SIGKILL'), 5_000)
  await exited
  clearTimeout(timer)
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server?.kill('SIGKILL')
    process.exit(130)
  })
}

// ---------------------------------------------------------------------------------------------
// shared state between sections

const anon = new Client('anon')
const admin = new Client('admin')
const manager = new Client('manager')
const nattida = new Client('nattida')
const pakorn = new Client('pakorn')
const kamon = new Client('kamon')
const teerawat = new Client('teerawat')
const S = {} // ids and fixtures discovered along the way

// =============================================================================================

async function main() {
  console.log(`FlowTrade API e2e — ${BASE} (schema "${SCHEMA}", business date ${today})`)

  await section('Setup: seed the test schema and start the API', async () => {
    const seed = runSeed()
    check('seed (node dist/seed/seed.js) succeeds', seed.ok, seed.out)
    if (seed.ok) console.log(`      ${seed.out.replace(/\s+/g, ' ')}`)
    must(seed.ok, 'seed ran')
    startServer()
    const up = await waitForHealth()
    must(check(`API answers GET /health on :${PORT}`, up, serverLog.slice(-20).join('\n')), 'server is up')
  })
  if (failures.length) return

  // -------------------------------------------------------------------------------------------
  await section('Health, CSRF and authentication', async () => {
    let r = await anon.get('/health')
    expect('GET /health → { ok, schema: flowtrade, dbTime, demo: true }', r, 200, (j) => j.ok === true && j.schema === SCHEMA && !!j.dbTime && j.demo === true)
    must(r.json?.schema === SCHEMA, 'server uses the flowtrade schema')

    r = await anon.get('/auth/me')
    check('GET /auth/me without a session → 200 with empty body (null)', r.status === 200 && r.text === '', brief(r))
    r = await anon.get('/stores')
    expectError('GET /stores without a session → 401 UNAUTHENTICATED', r, 401, 'UNAUTHENTICATED')
    r = await anon.post('/tasks', { proposalId: randomUUID(), parentId: null, title: 'x' })
    expectError('POST /tasks without a session → 401 UNAUTHENTICATED', r, 401, 'UNAUTHENTICATED')

    r = await anon.get('/auth/demo-users')
    expect('GET /auth/demo-users → active users only', r, 200, (j) => Array.isArray(j) && j.length === 6 && j.every((u) => u.isActive && hasKeys(u, USER_KEYS)) && !j.some((u) => u.email === 'attapon@flowtrade.local'))
    const demo = must(r.json, 'demo users')
    const byEmail = Object.fromEntries(demo.map((u) => [u.email, u]))
    S.users = {
      admin: must(byEmail['admin@flowtrade.local'], 'admin user'),
      manager: must(byEmail['manager@flowtrade.local'], 'manager user'),
      nattida: must(byEmail['nattida@flowtrade.local'], 'nattida user'),
      pakorn: must(byEmail['pakorn@flowtrade.local'], 'pakorn user'),
      kamon: must(byEmail['kamon@flowtrade.local'], 'kamon user'),
      teerawat: must(byEmail['teerawat@flowtrade.local'], 'teerawat user'),
    }
    check('demo users have the expected roles', S.users.admin.role === 'ADMIN' && S.users.manager.role === 'MANAGER' && S.users.nattida.role === 'USER' && S.users.pakorn.role === 'USER')

    r = await admin.post('/auth/demo-login', { userId: S.users.admin.id }, { csrf: false })
    expectError('POST without X-FlowTrade-Request header → 403 (CSRF)', r, 403, 'FORBIDDEN')
    check('CSRF-rejected login sets no cookie', admin.jar.size === 0)
    r = await admin.post('/auth/demo-login', { userId: S.users.admin.id }, { headers: { Origin: 'https://evil.example' } })
    expectError('POST with a foreign Origin → 403 (CSRF)', r, 403, 'FORBIDDEN')
    r = await admin.post('/auth/demo-login', { userId: 'not-a-uuid' })
    expectError('POST /auth/demo-login malformed id → 422', r, 422, 'VALIDATION')
    r = await admin.post('/auth/demo-login', { userId: randomUUID() })
    expectError('POST /auth/demo-login unknown user → 404', r, 404, 'NOT_FOUND')

    for (const [client, key] of [
      [admin, 'admin'],
      [manager, 'manager'],
      [nattida, 'nattida'],
      [pakorn, 'pakorn'],
      [teerawat, 'teerawat'],
    ]) {
      r = await client.post('/auth/demo-login', { userId: S.users[key].id })
      expect(`POST /auth/demo-login as ${key} → User + session cookie`, r, 200, (j) => j.id === S.users[key].id && client.jar.size > 0)
    }
    r = await admin.get('/auth/me')
    expect('GET /auth/me as admin → the admin user', r, 200, (j) => j.email === 'admin@flowtrade.local' && j.role === 'ADMIN' && !('passwordHash' in j))

    // Real password sign-in (DEMO_PASSWORD from packages/shared/dist/demo-seed.js).
    r = await kamon.post('/auth/login', { email: 'kamon@flowtrade.local', password: 'wrong-password' })
    expectError('POST /auth/login wrong password → 401 INVALID_CREDENTIALS', r, 401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    r = await kamon.post('/auth/login', { email: 'nobody@flowtrade.local', password: DEMO_PASSWORD })
    expectError('POST /auth/login unknown email → 401 INVALID_CREDENTIALS', r, 401, 'INVALID_CREDENTIALS')
    r = await kamon.post('/auth/login', { email: '', password: '' })
    expectError('POST /auth/login empty body fields → 422', r, 422, 'VALIDATION')
    r = await kamon.post('/auth/login', { email: '  KAMON@FlowTrade.local ', password: DEMO_PASSWORD })
    expect('POST /auth/login with DEMO_PASSWORD (email case-insensitive) → User + cookie', r, 200, (j) => j.id === S.users.kamon.id && j.lastLoginAt && kamon.jar.size > 0)
    r = await kamon.get('/auth/me')
    expect('GET /auth/me after password login → kamon', r, 200, (j) => j.id === S.users.kamon.id)
    r = await anon.post('/auth/login', { email: 'attapon@flowtrade.local', password: DEMO_PASSWORD })
    expectError('POST /auth/login inactive user → 403 INACTIVE', r, 403, 'INACTIVE')

    // Logout ends the session server-side, not just the cookie.
    const temp = new Client('temp')
    r = await temp.post('/auth/login', { email: 'teerawat@flowtrade.local', password: DEMO_PASSWORD })
    must(r.status === 200, 'temp login')
    const stolen = new Map(temp.jar)
    r = await temp.post('/auth/logout')
    expect('POST /auth/logout → true and clears the cookie', r, 200, (j) => j === true && temp.jar.size === 0)
    r = await temp.get('/auth/me')
    check('GET /auth/me after logout → null', r.status === 200 && r.text === '', brief(r))
    const replay = new Client('replay')
    replay.jar = stolen
    r = await replay.get('/stores')
    expectError('old session token after logout → 401', r, 401, 'UNAUTHENTICATED')
    r = await anon.post('/auth/logout')
    expect('POST /auth/logout without a session → true', r, 200, (j) => j === true)
  })
  must(S.users, 'auth section produced users')

  // -------------------------------------------------------------------------------------------
  await section('Users', async () => {
    let r = await nattida.get('/users')
    expectError('USER GET /users → 403', r, 403, 'FORBIDDEN')
    r = await manager.get('/users')
    expectError('MANAGER GET /users → 403', r, 403, 'FORBIDDEN')
    r = await nattida.get('/users/lookup')
    expect('GET /users/lookup → active users sorted by Thai name', r, 200, (j) => j.length === 6 && j.every((u) => u.isActive) && sortedBy(j, (a, b) => a.name.localeCompare(b.name, 'th')))
    r = await admin.get('/users')
    expect('ADMIN GET /users → all users incl. inactive', r, 200, (j) => j.length === 7 && j.some((u) => !u.isActive))
    S.users.former = r.json?.find((u) => u.email === 'attapon@flowtrade.local')

    const email = `e2e.tester.${Date.now()}@flowtrade.local`
    r = await manager.post('/users', { email, name: 'x', role: 'USER' })
    expectError('MANAGER POST /users → 403', r, 403, 'FORBIDDEN')
    r = await admin.post('/users', { email: email.toUpperCase(), name: '  ทดสอบ อีทูอี  ', role: 'USER', department: 'General', nickname: '' })
    expect('ADMIN POST /users → { user, tempPassword }', r, [200, 201], (j) => j.user.email === email && j.user.name === 'ทดสอบ อีทูอี' && j.user.nickname === null && j.user.mustChangePassword === true && j.user.role === 'USER' && typeof j.tempPassword === 'string' && j.tempPassword.length >= 8)
    const created = must(r.json?.user, 'created user')
    let tempPassword = r.json.tempPassword
    S.newUser = created

    r = await admin.post('/users', { email, name: 'ซ้ำ', role: 'USER' })
    expectError('POST /users duplicate email → 422', r, 422, 'VALIDATION', 'อีเมลนี้มีในระบบแล้ว')
    r = await admin.post('/users', { email: 'not-an-email', name: 'x', role: 'USER' })
    expectError('POST /users bad email → 422', r, 422, 'VALIDATION', 'รูปแบบอีเมลไม่ถูกต้อง')
    r = await admin.post('/users', { email: 'role@flowtrade.local', name: 'x', role: 'BOSS' })
    expectError('POST /users bad role → 422', r, 422, 'VALIDATION')

    // Temp password → forced change → normal access.
    const newbie = new Client('newbie')
    r = await newbie.post('/auth/login', { email, password: tempPassword })
    expect('new user logs in with the temp password (mustChangePassword)', r, 200, (j) => j.mustChangePassword === true)
    r = await newbie.get('/stores')
    expectError('GET /stores while the password change is pending → 403', r, 403, 'FORBIDDEN')
    r = await newbie.get('/auth/me')
    expect('GET /auth/me allowed while the password change is pending', r, 200, (j) => j.id === created.id)
    r = await newbie.post('/auth/change-password', { currentPassword: 'wrong-current', newPassword: 'E2e-New-Pass-2026' })
    expectError('change-password wrong current → 422', r, 422, 'VALIDATION', 'รหัสผ่านปัจจุบันไม่ถูกต้อง')
    r = await newbie.post('/auth/change-password', { currentPassword: tempPassword, newPassword: 'short' })
    expectError('change-password too short → 422', r, 422, 'VALIDATION', 'อย่างน้อย 8 ตัวอักษร')
    r = await newbie.post('/auth/change-password', { currentPassword: tempPassword, newPassword: tempPassword })
    expectError('change-password same as current → 422', r, 422, 'VALIDATION')
    r = await newbie.post('/auth/change-password', { currentPassword: tempPassword, newPassword: 'E2e-New-Pass-2026' })
    expect('POST /auth/change-password → User (mustChangePassword false)', r, 200, (j) => j.mustChangePassword === false)
    r = await newbie.get('/stores')
    expect('GET /stores after the password change → 200', r, 200, (j) => Array.isArray(j))

    r = await admin.patch(`/users/${created.id}`, { nickname: 'อีทู', position: 'Tester', department: '' })
    expect('PATCH /users/:id → User', r, 200, (j) => j.nickname === 'อีทู' && j.position === 'Tester' && j.department === null)
    r = await admin.patch(`/users/${S.users.admin.id}`, { role: 'USER' })
    expectError('PATCH own role → 422', r, 422, 'VALIDATION', 'ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้')
    r = await admin.patch(`/users/${S.users.nattida.id}`, { email: 'manager@flowtrade.local' })
    expectError('PATCH email to an existing one → 422', r, 422, 'VALIDATION', 'อีเมลนี้มีในระบบแล้ว')
    r = await admin.patch(`/users/${randomUUID()}`, { name: 'x' })
    expectError('PATCH /users/<unknown uuid> → 404', r, 404, 'NOT_FOUND')
    r = await admin.patch('/users/not-a-uuid', { name: 'x' })
    expectError('PATCH /users/<malformed id> → 404', r, 404, 'NOT_FOUND')
    r = await admin.post(`/users/${S.users.admin.id}/active`, { isActive: false })
    expectError('deactivate yourself → 422', r, 422, 'VALIDATION', 'ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้')

    // Reset password revokes sessions.
    r = await admin.post(`/users/${created.id}/reset-password`)
    expect('POST /users/:id/reset-password → { user, tempPassword }', r, 200, (j) => j.user.mustChangePassword === true && typeof j.tempPassword === 'string')
    tempPassword = r.json?.tempPassword
    r = await newbie.get('/stores')
    expectError('session after reset-password → 401', r, 401, 'UNAUTHENTICATED')
    r = await newbie.post('/auth/login', { email, password: 'E2e-New-Pass-2026' })
    expectError('old password after reset → 401', r, 401, 'INVALID_CREDENTIALS')
    r = await newbie.post('/auth/login', { email, password: tempPassword })
    expect('login with the new temp password', r, 200, (j) => j.mustChangePassword === true)
    r = await newbie.post('/auth/change-password', { currentPassword: tempPassword, newPassword: 'E2e-Second-Pass-2026' })
    expect('change-password after reset', r, 200, (j) => j.mustChangePassword === false)

    // Deactivate → that user's session is rejected.
    r = await admin.post(`/users/${created.id}/active`, { isActive: false })
    expect('POST /users/:id/active false → { user, openTasks }', r, 200, (j) => j.user.isActive === false && j.openTasks === 0)
    r = await newbie.get('/stores')
    expectError('deactivated user session → 401', r, 401, 'UNAUTHENTICATED')
    r = await newbie.get('/auth/me')
    check('deactivated user GET /auth/me → null', r.status === 200 && r.text === '', brief(r))
    r = await newbie.post('/auth/login', { email, password: 'E2e-Second-Pass-2026' })
    expectError('deactivated user login → 403 INACTIVE', r, 403, 'INACTIVE')
    r = await admin.get('/users/lookup')
    expect('lookup excludes the deactivated user', r, 200, (j) => !ids(j).includes(created.id))
    r = await admin.post(`/users/${created.id}/active`, { isActive: true })
    expect('POST /users/:id/active true → re-activated', r, 200, (j) => j.user.isActive === true)
    r = await newbie.post('/auth/login', { email, password: 'E2e-Second-Pass-2026' })
    expect('re-activated user can sign in again', r, 200, (j) => j.id === created.id)
    r = await admin.post(`/users/${created.id}/active`, { isActive: 'yes' })
    expectError('POST /users/:id/active with a non-boolean → 422', r, 422, 'VALIDATION')
  })

  // -------------------------------------------------------------------------------------------
  await section('Stores', async () => {
    let r = await nattida.get('/stores')
    expect('GET /stores → active stores sorted by channel, sortOrder', r, 200, (j) => j.length === 10 && j.every((s) => s.isActive) && sortedBy(j, (a, b) => a.channel.localeCompare(b.channel) || a.sortOrder - b.sortOrder))
    const stores = must(r.json, 'stores')
    const byName = Object.fromEntries(stores.map((s) => [s.name, s]))
    S.stores = { bigc: byName['Big C'], watsons: byName.Watsons, cj: byName['CJ More'], eve: byName['Eve and Boy'], shopee: byName.Shopee }
    must(Object.values(S.stores).every(Boolean), 'seeded stores present')

    r = await nattida.get('/stores/usage')
    expect('GET /stores/usage → { storeId: proposalCount }', r, 200, (j) => j[S.stores.bigc.id] === 2 && Object.values(j).every((n) => Number.isInteger(n) && n > 0))
    const usedStoreId = must(Object.keys(r.json ?? {})[0], 'a store in use')

    const input = { name: 'E2E Mart', shortName: 'E2E', channel: 'OFFLINE', color: '#123456', description: 'ห้างทดสอบ' }
    r = await nattida.post('/stores', input)
    expectError('USER POST /stores → 403', r, 403, 'FORBIDDEN')
    r = await manager.post('/stores', input)
    expectError('MANAGER POST /stores → 403', r, 403, 'FORBIDDEN')
    r = await admin.post('/stores', input)
    expect('ADMIN POST /stores → Store (sortOrder appended)', r, [200, 201], (j) => isUuid(j.id) && j.name === 'E2E Mart' && j.shortName === 'E2E' && j.sortOrder === 7 && j.isActive === true)
    const store = must(r.json?.id && r.json, 'created store')
    r = await admin.post('/stores', { ...input, name: '  e2e MART ' })
    expectError('POST /stores duplicate name (case-insensitive) → 422/409', r, [422, 409], ['VALIDATION', 'CONFLICT'], 'มีชื่อนี้อยู่แล้ว')
    r = await admin.post('/stores', { ...input, channel: 'ONLINE' })
    expect('same name in the other channel is allowed', r, [200, 201], (j) => j.channel === 'ONLINE')
    const onlineTwin = r.json
    r = await admin.post('/stores', { ...input, name: '   ' })
    expectError('POST /stores blank name → 422', r, 422, 'VALIDATION')
    r = await admin.post('/stores', { ...input, name: 'E2E Bad Channel', channel: 'MOON' })
    expectError('POST /stores bad channel → 422', r, 422, 'VALIDATION')

    r = await admin.patch(`/stores/${store.id}`, { description: 'อัปเดตแล้ว', isActive: false })
    expect('PATCH /stores/:id (deactivate) → Store', r, 200, (j) => j.isActive === false && j.description === 'อัปเดตแล้ว')
    r = await nattida.get('/stores')
    expect('inactive store hidden from GET /stores', r, 200, (j) => !ids(j).includes(store.id))
    r = await admin.get('/stores?includeInactive=true')
    expect('GET /stores?includeInactive=true includes it', r, 200, (j) => ids(j).includes(store.id) && j.length === 12)
    r = await admin.patch(`/stores/${store.id}`, { isActive: true, name: 'E2E Mart 2' })
    expect('PATCH /stores/:id (rename + reactivate)', r, 200, (j) => j.isActive === true && j.name === 'E2E Mart 2')
    r = await admin.patch(`/stores/${store.id}`, { name: 'big c' })
    expectError('PATCH /stores/:id to a duplicate name → 422', r, [422, 409], ['VALIDATION', 'CONFLICT'], 'มีชื่อนี้อยู่แล้ว')
    r = await admin.patch(`/stores/${randomUUID()}`, { name: 'x' })
    expectError('PATCH /stores/<unknown> → 404', r, 404, 'NOT_FOUND')
    r = await admin.patch(`/stores/${S.stores.bigc.id}`, { channel: 'ONLINE' })
    expectError('PATCH channel of a store in use → 422', r, 422, 'VALIDATION', 'เปลี่ยนช่องทางไม่ได้')

    r = await admin.get('/stores')
    const offline = (r.json ?? []).filter((s) => s.channel === 'OFFLINE').map((s) => s.id)
    const order = [store.id, ...offline.filter((id) => id !== store.id)]
    r = await nattida.put('/stores/order', { ids: order })
    expectError('USER PUT /stores/order → 403', r, 403, 'FORBIDDEN')
    r = await admin.put('/stores/order', { ids: order })
    expect('PUT /stores/order → true', r, 200, (j) => j === true)
    r = await admin.get('/stores')
    expect('GET /stores reflects the new order', r, 200, (j) => JSON.stringify(j.filter((s) => s.channel === 'OFFLINE').map((s) => s.id)) === JSON.stringify(order))
    r = await admin.put('/stores/order', { ids: 'nope' })
    expectError('PUT /stores/order bad body → 422', r, 422, 'VALIDATION')

    r = await admin.del(`/stores/${usedStoreId}`)
    expectError('DELETE store in use → 409 IN_USE', r, 409, 'IN_USE', 'ลบไม่ได้')
    r = await admin.del(`/stores/${store.id}`)
    expect('DELETE /stores/:id → true', r, 200, (j) => j === true)
    r = await admin.del(`/stores/${onlineTwin?.id}`)
    expect('DELETE the online twin → true', r, 200, (j) => j === true)
    r = await admin.del(`/stores/${store.id}`)
    expectError('DELETE the same store again → 404', r, 404, 'NOT_FOUND')
  })

  // -------------------------------------------------------------------------------------------
  await section('Shelf types', async () => {
    let r = await nattida.get('/shelf-types')
    expect('GET /shelf-types → active, sorted', r, 200, (j) => j.length === 6 && sortedBy(j, (a, b) => a.channel.localeCompare(b.channel) || a.sortOrder - b.sortOrder))
    const byName = Object.fromEntries((r.json ?? []).map((s) => [s.name, s]))
    S.shelves = { normal: byName['Normal Shelf'], exclusive: byName['Exclusive Shelf'], endcap: byName['หัวกอนโดลา (End Cap)'], mall: byName['Official Store / Mall'] }
    must(Object.values(S.shelves).every(Boolean), 'seeded shelf types present')

    r = await nattida.get('/shelf-types/usage')
    expect('GET /shelf-types/usage', r, 200, (j) => j[S.shelves.normal.id] === 4 && j[S.shelves.endcap.id] === 1 && j[S.shelves.mall.id] === 1)

    const input = { name: 'E2E Pallet', channel: 'OFFLINE', color: '#abcdef', description: 'ทดสอบ' }
    r = await manager.post('/shelf-types', input)
    expectError('MANAGER POST /shelf-types → 403', r, 403, 'FORBIDDEN')
    r = await admin.post('/shelf-types', input)
    expect('POST /shelf-types → ShelfType', r, [200, 201], (j) => isUuid(j.id) && j.sortOrder === 4 && j.isActive)
    const shelf = must(r.json?.id && r.json, 'created shelf type')
    r = await admin.post('/shelf-types', { ...input, name: 'e2e pallet' })
    expectError('POST /shelf-types duplicate → 422/409', r, [422, 409], ['VALIDATION', 'CONFLICT'], 'มีชื่อนี้อยู่แล้ว')
    r = await admin.post('/shelf-types', { ...input, color: 'red' })
    expectError('POST /shelf-types bad colour → 422', r, 422, 'VALIDATION')
    r = await admin.patch(`/shelf-types/${shelf.id}`, { name: 'E2E Pallet XL', isActive: false })
    expect('PATCH /shelf-types/:id', r, 200, (j) => j.name === 'E2E Pallet XL' && j.isActive === false)
    r = await admin.get('/shelf-types?includeInactive=true')
    expect('GET /shelf-types?includeInactive=true includes inactive', r, 200, (j) => ids(j).includes(shelf.id))
    r = await admin.get('/shelf-types')
    expect('GET /shelf-types hides inactive', r, 200, (j) => !ids(j).includes(shelf.id))
    const offline = (r.json ?? []).filter((s) => s.channel === 'OFFLINE').map((s) => s.id).reverse()
    r = await admin.put('/shelf-types/order', { ids: offline })
    expect('PUT /shelf-types/order → true', r, 200, (j) => j === true)
    r = await admin.get('/shelf-types')
    expect('order applied', r, 200, (j) => JSON.stringify(j.filter((s) => s.channel === 'OFFLINE').map((s) => s.id)) === JSON.stringify(offline))
    r = await nattida.put('/shelf-types/order', { ids: offline })
    expectError('USER PUT /shelf-types/order → 403', r, 403, 'FORBIDDEN')
    r = await admin.del(`/shelf-types/${S.shelves.normal.id}`)
    expectError('DELETE shelf type in use → 409 IN_USE', r, 409, 'IN_USE')
    r = await admin.del(`/shelf-types/${shelf.id}`)
    expect('DELETE /shelf-types/:id → true', r, 200, (j) => j === true)
    r = await admin.del(`/shelf-types/${shelf.id}`)
    expectError('DELETE again → 404', r, 404, 'NOT_FOUND')
  })

  // -------------------------------------------------------------------------------------------
  await section('Products', async () => {
    let r = await nattida.get('/products')
    expect('GET /products → active, sorted by brand then Thai name', r, 200, (j) => j.length === 10 && sortedBy(j, (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, 'th')))
    const bySku = Object.fromEntries((r.json ?? []).map((p) => [p.sku, p]))
    S.products = { serum: bySku['HB-SR-030'], lipbalm: bySku['HB-LP-004'], almond: bySku['PM-SN-075'] }
    must(Object.values(S.products).every(Boolean), 'seeded products present')
    r = await nattida.get('/products?q=hb-sr')
    expect('GET /products?q= matches SKU case-insensitively', r, 200, (j) => j.length === 2 && j.every((p) => p.sku.startsWith('HB-SR')))
    r = await nattida.get(`/products?q=${encodeURIComponent('มะพร้าว')}`)
    expect('GET /products?q= matches Thai names', r, 200, (j) => j.length === 1 && j[0].sku === 'PM-DR-250')
    r = await nattida.get('/products?q=hb%25sr')
    expect('GET /products?q=hb%sr treats % literally (no LIKE wildcard)', r, 200, (j) => j.length === 0)

    r = await nattida.post('/products', { sku: ' e2e-qa-001 ', name: 'สินค้าทดสอบ E2E', brand: 'E2E', category: 'Test', size: '', barcode: null })
    expect('USER quick-add POST /products → Product (SKU upper-cased)', r, [200, 201], (j) => j.sku === 'E2E-QA-001' && j.size === null && j.isActive)
    const product = must(r.json?.id && r.json, 'created product')
    r = await nattida.post('/products', { sku: 'E2E-qa-001', name: 'ซ้ำ', brand: 'E2E', category: 'Test' })
    expectError('POST /products duplicate SKU → 422', r, [422, 409], ['VALIDATION', 'CONFLICT'], 'รหัสสินค้า (SKU) นี้มีอยู่แล้ว')
    r = await nattida.post('/products', { sku: '', name: '', brand: 'E2E', category: 'Test' })
    expectError('POST /products blank SKU/name → 422', r, 422, 'VALIDATION')
    r = await nattida.patch(`/products/${product.id}`, { name: 'x' })
    expectError('USER PATCH /products/:id → 403', r, 403, 'FORBIDDEN')
    r = await manager.patch(`/products/${product.id}`, { size: '100 มล.', isActive: false })
    expect('MANAGER PATCH /products/:id', r, 200, (j) => j.size === '100 มล.' && j.isActive === false)
    r = await manager.patch(`/products/${product.id}`, { sku: 'hb-sr-030' })
    expectError('PATCH /products/:id to an existing SKU → 422', r, [422, 409], ['VALIDATION', 'CONFLICT'], 'รหัสสินค้า (SKU) นี้มีอยู่แล้ว')
    r = await nattida.get('/products')
    expect('inactive product hidden', r, 200, (j) => !ids(j).includes(product.id))
    r = await nattida.get('/products?includeInactive=true')
    expect('GET /products?includeInactive=true includes it', r, 200, (j) => ids(j).includes(product.id))
    r = await manager.del(`/products/${S.products.serum.id}`)
    expectError('DELETE product in use → 409 IN_USE', r, 409, 'IN_USE', 'ลบไม่ได้')
    r = await nattida.del(`/products/${product.id}`)
    expectError('USER DELETE /products/:id → 403', r, 403, 'FORBIDDEN')
    r = await manager.del(`/products/${product.id}`)
    expect('DELETE /products/:id → true', r, 200, (j) => j === true)
    r = await manager.del(`/products/${product.id}`)
    expectError('DELETE again → 404', r, 404, 'NOT_FOUND')
  })

  // -------------------------------------------------------------------------------------------
  await section('Task templates', async () => {
    must(S.stores && S.shelves, 'master data')
    let r = await nattida.get('/task-templates')
    expect('GET /task-templates → active templates', r, 200, (j) => j.length === 3 && j.every((t) => t.isActive && Array.isArray(t.items)))
    const seeded = r.json ?? []
    r = await nattida.get(`/task-templates/${seeded[0]?.id}`)
    expect('GET /task-templates/:id', r, 200, (j) => j.id === seeded[0].id && j.items.length > 0)
    r = await nattida.get(`/task-templates/${randomUUID()}`)
    expectError('GET /task-templates/<unknown> → 404', r, 404, 'NOT_FOUND', 'ไม่พบแม่แบบ')

    // Temp ids, nested, children listed before parents — server re-keys and orders parents first.
    const items = [
      { id: 'tmp-a', parentId: null, level: 1, title: 'E2E: เตรียมเอกสาร', startOffsetDays: -40, dueOffsetDays: -30, responsible: 'Trade/KAM', sortOrder: 1000 },
      { id: 'tmp-a1', parentId: 'tmp-a', level: 2, title: 'E2E: ขอใบเสนอราคา', startOffsetDays: -40, dueOffsetDays: -35, responsible: null, sortOrder: 1000 },
      { id: 'tmp-a1x', parentId: 'tmp-a1', level: 3, title: 'E2E: ส่งอีเมล', startOffsetDays: -40, dueOffsetDays: -38, responsible: null, sortOrder: 1000 },
      { id: 'tmp-a2', parentId: 'tmp-a', level: 2, title: 'E2E: เซ็นสัญญา', startOffsetDays: -34, dueOffsetDays: -30, responsible: 'Legal', sortOrder: 2000 },
      { id: 'tmp-b', parentId: null, level: 1, title: 'E2E: วางสินค้า', startOffsetDays: -5, dueOffsetDays: 0, responsible: 'Sales', sortOrder: 2000 },
    ]
    const body = { name: 'E2E Template', description: 'แม่แบบทดสอบ', channel: 'OFFLINE', shelfTypeId: S.shelves.normal.id, storeId: S.stores.bigc.id, items: [...items].reverse() }
    r = await nattida.post('/task-templates', body)
    expectError('USER POST /task-templates → 403', r, 403, 'FORBIDDEN')
    r = await manager.post('/task-templates', body)
    expect('POST /task-templates with temp ids → TaskTemplate', r, [200, 201], (j) => isUuid(j.id) && j.items.length === 5)
    const tpl = must(r.json?.items && r.json, 'created template')
    const t = (title) => byTitle(tpl.items, title)
    check('template items re-keyed to UUIDs', tpl.items.every((i) => isUuid(i.id) && !String(i.id).startsWith('tmp-') && (i.parentId === null || isUuid(i.parentId))))
    check(
      'template parent links preserved after re-keying',
      t('E2E: ส่งอีเมล')?.parentId === t('E2E: ขอใบเสนอราคา')?.id && t('E2E: ขอใบเสนอราคา')?.parentId === t('E2E: เตรียมเอกสาร')?.id && t('E2E: เซ็นสัญญา')?.parentId === t('E2E: เตรียมเอกสาร')?.id && t('E2E: วางสินค้า')?.parentId === null,
      JSON.stringify(tpl.items),
    )
    check('template item levels valid', treeIsValid(tpl.items))
    S.tplId = tpl.id

    const bad = (patchItems) => ({ ...body, name: 'E2E Bad', items: patchItems })
    r = await manager.post('/task-templates', bad([...items, { id: 'tmp-x', parentId: 'tmp-a1x', level: 4, title: 'ลึกเกิน', startOffsetDays: 0, dueOffsetDays: 0, responsible: null, sortOrder: 1 }]))
    expectError('template with a 4th level → 422', r, 422, 'VALIDATION')
    r = await manager.post('/task-templates', bad([{ ...items[0], startOffsetDays: -10, dueOffsetDays: -20 }]))
    expectError('template item due before start → 422', r, 422, 'VALIDATION', 'วันครบกำหนดอยู่ก่อนวันเริ่ม')
    r = await manager.post('/task-templates', bad([items[0], { ...items[1], parentId: 'tmp-missing' }]))
    expectError('template item with a missing parent → 422', r, 422, 'VALIDATION')
    r = await manager.post('/task-templates', { ...body, name: '  ' })
    expectError('template without a name → 422', r, 422, 'VALIDATION', 'กรุณาระบุชื่อแม่แบบ')
    r = await manager.post('/task-templates', { ...body, name: 'E2E Wrong channel', shelfTypeId: S.shelves.mall.id })
    expectError('template shelf type of another channel → 422', r, 422, 'VALIDATION')

    // Preview = planFromTemplate(items, targetDate, today, excluded).
    const target = addDays(today, 60)
    r = await nattida.get(`/task-templates/${tpl.id}/preview?targetDate=${target}`)
    const expected = planFromTemplate(tpl.items, target, today).map(({ sortOrder, ...rest }) => rest)
    expect('GET /task-templates/:id/preview → dates back-scheduled from the target date', r, 200, (j) => canonical(j) === canonical(expected))
    check('preview dates = target + offsets', byTitle(r.json ?? [], 'E2E: เตรียมเอกสาร')?.startDate === addDays(target, -40) && byTitle(r.json ?? [], 'E2E: วางสินค้า')?.dueDate === target)
    r = await nattida.get(`/task-templates/${tpl.id}/preview?targetDate=${target}&excluded=${t('E2E: เตรียมเอกสาร').id},${randomUUID()}`)
    expect('preview with excluded=<parent> drops the whole subtree', r, 200, (j) => j.length === 1 && j[0].title === 'E2E: วางสินค้า')
    r = await nattida.get(`/task-templates/${tpl.id}/preview?targetDate=${addDays(today, 10)}`)
    expect('preview clamps start dates before today', r, 200, (j) => j.find((i) => i.title === 'E2E: เตรียมเอกสาร')?.clamped === true && j.every((i) => i.startDate >= today && i.dueDate >= i.startDate))
    r = await nattida.get(`/task-templates/${tpl.id}/preview?targetDate=2026-02-30`)
    expectError('preview with an impossible date → 422', r, 422, 'VALIDATION')
    r = await nattida.get(`/task-templates/${randomUUID()}/preview?targetDate=${target}`)
    expectError('preview of an unknown template → 404', r, 404, 'NOT_FOUND')

    // Suggest: most specific active template wins (store +2, shelf +1).
    r = await nattida.get(`/task-templates/suggest?channel=OFFLINE&shelfTypeId=${S.shelves.normal.id}&storeId=${S.stores.bigc.id}`)
    expect('GET /task-templates/suggest → store+shelf specific template', r, 200, (j) => j?.id === tpl.id)
    r = await nattida.get(`/task-templates/suggest?channel=OFFLINE&shelfTypeId=${S.shelves.normal.id}&storeId=${S.stores.watsons.id}`)
    expect('suggest for another store → seeded Normal Shelf template', r, 200, (j) => j?.shelfTypeId === S.shelves.normal.id && j.storeId === null)
    r = await nattida.get('/task-templates/suggest?channel=ONLINE')
    expect('suggest ONLINE → online template', r, 200, (j) => j?.channel === 'ONLINE')
    r = await nattida.get(`/task-templates/suggest?channel=OFFLINE&shelfTypeId=${S.shelves.endcap.id}`)
    check('suggest with no match → 200 empty body (null)', r.status === 200 && r.text === '', brief(r))
    r = await nattida.get('/task-templates/suggest')
    expectError('suggest without channel → 422', r, 422, 'VALIDATION')

    // PATCH: rename + replace items (existing ids + one new temp id).
    const nextItems = [...tpl.items, { id: 'tmp-new', parentId: t('E2E: วางสินค้า').id, level: 2, title: 'E2E: ถ่ายรูปชั้นวาง', startOffsetDays: 0, dueOffsetDays: 1, responsible: null, sortOrder: 1000 }]
    r = await nattida.patch(`/task-templates/${tpl.id}`, { name: 'x' })
    expectError('USER PATCH /task-templates/:id → 403', r, 403, 'FORBIDDEN')
    r = await manager.patch(`/task-templates/${tpl.id}`, { name: 'E2E Template (แก้ไข)', items: nextItems })
    expect('PATCH /task-templates/:id (name + items) → TaskTemplate', r, 200, (j) => j.name === 'E2E Template (แก้ไข)' && j.items.length === 6 && treeIsValid(j.items) && byTitle(j.items, 'E2E: ถ่ายรูปชั้นวาง')?.parentId === byTitle(j.items, 'E2E: วางสินค้า')?.id)
    r = await manager.patch(`/task-templates/${tpl.id}`, { items: [{ ...items[0], dueOffsetDays: -50 }] })
    expectError('PATCH template item due before start → 422', r, 422, 'VALIDATION')
    r = await manager.patch(`/task-templates/${tpl.id}`, { isActive: false })
    expect('PATCH template isActive=false', r, 200, (j) => j.isActive === false)
    r = await manager.get('/task-templates')
    expect('inactive template hidden', r, 200, (j) => !ids(j).includes(tpl.id))
    r = await manager.get('/task-templates?includeInactive=true')
    expect('GET /task-templates?includeInactive=true includes it', r, 200, (j) => ids(j).includes(tpl.id))
    r = await manager.patch(`/task-templates/${tpl.id}`, { isActive: true })
    expect('PATCH template isActive=true', r, 200, (j) => j.isActive === true)

    r = await manager.post('/task-templates', { name: 'E2E ลบทิ้ง', channel: 'ONLINE', shelfTypeId: null, storeId: null, items: [{ id: 'x1', parentId: null, level: 1, title: 'งานเดียว', startOffsetDays: -3, dueOffsetDays: 0, responsible: null, sortOrder: 1000 }] })
    const throwaway = must(r.json?.id, 'throwaway template')
    r = await nattida.del(`/task-templates/${throwaway}`)
    expectError('USER DELETE /task-templates/:id → 403', r, 403, 'FORBIDDEN')
    r = await manager.del(`/task-templates/${throwaway}`)
    expect('DELETE /task-templates/:id → true', r, 200, (j) => j === true)
    r = await manager.get(`/task-templates/${throwaway}`)
    expectError('deleted template → 404', r, 404, 'NOT_FOUND')
  })

  // -------------------------------------------------------------------------------------------
  await section('Proposals: wizard create', async () => {
    must(S.tplId && S.products && S.stores && S.shelves, 'fixtures')
    let r = await nattida.get(`/task-templates/${S.tplId}`)
    const tpl = must(r.json?.items && r.json, 'template')
    S.tpl = tpl
    const target = addDays(today, 60)
    const year = today.slice(0, 4)
    const base = {
      channel: 'OFFLINE',
      productIds: [S.products.serum.id, S.products.lipbalm.id],
      storeIds: [S.stores.cj.id, S.stores.eve.id],
      shelfTypeId: S.shelves.normal.id,
      targetDate: target,
      templateId: tpl.id,
      excludedTemplateItemIds: [],
      memberIds: [],
      status: 'DRAFT',
      note: '  หมายเหตุทดสอบ  ',
    }
    r = await nattida.post('/proposals', base)
    expect('POST /proposals with 2 stores → 2 proposals', r, [200, 201], (j) => Array.isArray(j) && j.length === 2 && j.every((p) => hasKeys(p, PROPOSAL_KEYS)))
    const [A, B] = must(r.json?.length === 2 && r.json, 'two proposals')
    const codeNum = (p) => Number(/^PRJ-(\d{4})-(\d{4})$/.exec(p.code)?.[2])
    check(`codes are PRJ-${year}-#### and sequential`, A.code.startsWith(`PRJ-${year}-`) && B.code.startsWith(`PRJ-${year}-`) && codeNum(B) === codeNum(A) + 1, `${A.code}, ${B.code}`)
    check('default titles "<first product> +1 → <store>"', A.title === `${S.products.serum.name} +1 → ${S.stores.cj.name}` && B.title === `${S.products.serum.name} +1 → ${S.stores.eve.name}`, `${A.title} | ${B.title}`)
    check('proposal fields (owner, status, note trimmed, products in order, template)', A.ownerId === S.users.nattida.id && A.status === 'DRAFT' && A.note === 'หมายเหตุทดสอบ' && JSON.stringify(A.productIds) === JSON.stringify(base.productIds) && A.templateId === tpl.id && A.targetDate === target && A.storeId === S.stores.cj.id)
    S.A = A
    S.B = B

    const plan = planFromTemplate(tpl.items, target, today)
    for (const p of [A, B]) {
      r = await nattida.get(`/proposals/${p.id}/tasks`)
      const tasks = r.json ?? []
      expect(`GET /proposals/:id/tasks (${p.code}) → task count == template items (${tpl.items.length})`, r, 200, (j) => j.length === tpl.items.length && j.every((x) => hasKeys(x, TASK_KEYS)))
      check(`${p.code} task tree levels valid`, treeIsValid(tasks))
      check(
        `${p.code} tasks follow the template (dates, parents, priority, assignee)`,
        plan.every((pl) => {
          const task = byTitle(tasks, pl.title)
          const parentTitle = pl.parentTemplateItemId ? tpl.items.find((i) => i.id === pl.parentTemplateItemId).title : null
          const parent = task?.parentId ? tasks.find((x) => x.id === task.parentId) : null
          return task && task.startDate === pl.startDate && task.dueDate === pl.dueDate && task.level === pl.level && (parent?.title ?? null) === parentTitle && task.priority === (pl.level === 1 ? 'HIGH' : 'MEDIUM') && JSON.stringify(task.assigneeIds) === JSON.stringify([S.users.nattida.id]) && task.isDone === false
        }),
        JSON.stringify(tasks.map((x) => [x.title, x.level, x.startDate, x.dueDate])),
      )
      check(`${p.code} task responsible comes from the template (description stays null)`, byTitle(tasks, 'E2E: เตรียมเอกสาร')?.responsible === 'Trade/KAM' && byTitle(tasks, 'E2E: เตรียมเอกสาร')?.description === null && byTitle(tasks, 'E2E: ส่งอีเมล')?.responsible === null)
    }

    r = await nattida.get(`/proposals/${A.id}`)
    expect('GET /proposals/:id → ProposalDetail', r, 200, (j) => hasKeys(j, [...LIST_ITEM_KEYS, 'members', 'template']) && j.store.id === S.stores.cj.id && j.shelfType.id === S.shelves.normal.id && j.owner.id === S.users.nattida.id && j.products.length === 2 && j.members.length === 0 && j.template?.id === tpl.id && j.progress.total === 3 && j.progress.done === 0 && j.openTaskCount === 6 && j.nextDueDate === addDays(target, -38))

    // Excluding a template parent drops its subtree; single store keeps the custom title as is.
    const prepId = byTitle(tpl.items, 'E2E: เตรียมเอกสาร').id
    r = await nattida.post('/proposals', { ...base, storeIds: [S.stores.cj.id], title: '  E2E ไม่รวมงานเตรียมเอกสาร ', excludedTemplateItemIds: [prepId], status: 'IN_PROGRESS' })
    expect('POST /proposals with excludedTemplateItemIds', r, [200, 201], (j) => j.length === 1 && j[0].title === 'E2E ไม่รวมงานเตรียมเอกสาร' && j[0].status === 'IN_PROGRESS' && codeNum(j[0]) === codeNum(B) + 1)
    S.X = r.json?.[0]
    if (S.X) {
      r = await nattida.get(`/proposals/${S.X.id}/tasks`)
      expect('excluded subtree not instantiated', r, 200, (j) => j.length === 2 && !byTitle(j, 'E2E: เตรียมเอกสาร') && !byTitle(j, 'E2E: ส่งอีเมล'))
    }

    // Wizard-edited plan replaces template instantiation.
    const planBody = {
      ...base,
      storeIds: [S.stores.watsons.id],
      title: 'E2E แผนที่แก้ไขเอง',
      status: 'IN_PROGRESS',
      plan: [
        { key: 'k1', parentKey: null, title: 'งานจากแผน', startDate: today, dueDate: addDays(today, 3) },
        { key: 'k2', parentKey: 'k1', title: 'งานย่อยจากแผน', startDate: null, dueDate: null, responsible: 'Marketing' },
        { key: 'k3', parentKey: 'k2', title: 'mini จากแผน', startDate: today, dueDate: today },
      ],
    }
    r = await nattida.post('/proposals', planBody)
    expect('POST /proposals with a wizard-edited plan', r, [200, 201], (j) => j.length === 1)
    S.C = r.json?.[0]
    if (S.C) {
      r = await nattida.get(`/proposals/${S.C.id}/tasks`)
      expect('plan tasks created exactly (3 levels, dates, responsible)', r, 200, (j) => j.length === 3 && treeIsValid(j) && byTitle(j, 'mini จากแผน')?.level === 3 && byTitle(j, 'งานย่อยจากแผน')?.startDate === null && byTitle(j, 'งานย่อยจากแผน')?.responsible === 'Marketing' && byTitle(j, 'งานย่อยจากแผน')?.description === null && byTitle(j, 'งานจากแผน')?.dueDate === addDays(today, 3))
    }
    r = await nattida.post('/proposals', { ...planBody, plan: [...planBody.plan, { key: 'k4', parentKey: 'k3', title: 'ลึกเกิน', startDate: null, dueDate: null }] })
    expectError('plan deeper than 3 levels → 422', r, 422, 'VALIDATION', 'ลึกเกิน')
    r = await nattida.post('/proposals', { ...planBody, plan: [{ key: 'k1', parentKey: null, title: 'วันผิด', startDate: addDays(today, 5), dueDate: today }] })
    expectError('plan item due before start → 422', r, 422, 'VALIDATION', 'วันครบกำหนดอยู่ก่อนวันเริ่ม')

    r = await nattida.post('/proposals', { ...base, productIds: [] })
    expectError('wizard without products → 422', r, 422, 'VALIDATION', 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
    r = await nattida.post('/proposals', { ...base, storeIds: [] })
    expectError('wizard without stores → 422', r, 422, 'VALIDATION')
    r = await nattida.post('/proposals', { ...base, storeIds: [S.stores.shopee.id] })
    expectError('wizard store of another channel → 422', r, 422, 'VALIDATION', 'ไม่ได้อยู่ในช่องทางที่เลือก')
    r = await nattida.post('/proposals', { ...base, shelfTypeId: S.shelves.mall.id })
    expectError('wizard shelf type of another channel → 422', r, 422, 'VALIDATION', 'ประเภท Shelf ไม่ตรงกับช่องทางที่เลือก')
    r = await nattida.post('/proposals', { ...base, templateId: randomUUID() })
    expectError('wizard unknown template → 404', r, 404, 'NOT_FOUND', 'ไม่พบแม่แบบ')
    r = await nattida.post('/proposals', { ...base, memberIds: [S.users.former.id] })
    expectError('wizard with an inactive member → 422', r, 422, 'VALIDATION', 'ถูกปิดการใช้งานแล้ว')
    r = await nattida.post('/proposals', { ...base, targetDate: '2026-02-30' })
    expectError('wizard impossible target date → 422', r, 422, 'VALIDATION')
    r = await nattida.post('/proposals', { ...base, storeIds: [S.stores.cj.id], title: 'E2E counter check', templateId: null, status: 'DRAFT' })
    expect('codes stay sequential after rejected requests (no gaps)', r, [200, 201], (j) => codeNum(j[0]) === codeNum(S.C) + 1)
    S.Y = r.json?.[0]
  })

  // -------------------------------------------------------------------------------------------
  await section('Proposals: visibility, list filters, patch, status', async () => {
    const { A, B } = must(S.A && S.B && S, 'wizard proposals')
    let r = await pakorn.get(`/proposals/${A.id}`)
    expectError("USER cannot see another user's proposal → 404", r, 404, 'NOT_FOUND', 'ไม่พบการเสนอสินค้า')
    r = await pakorn.get(`/proposals/${A.id}/tasks`)
    expectError("USER GET another user's /proposals/:id/tasks → 404", r, 404, 'NOT_FOUND')
    r = await pakorn.get(`/proposals/${A.id}/comment-counts`)
    expectError("USER GET another user's comment-counts → 404", r, 404, 'NOT_FOUND')
    r = await pakorn.get(`/activity?proposalId=${A.id}`)
    expectError("USER GET another user's activity → 404", r, 404, 'NOT_FOUND')
    r = await pakorn.patch(`/proposals/${A.id}`, { title: 'hijack' })
    expectError('USER PATCH an invisible proposal → 404 (not 403)', r, 404, 'NOT_FOUND')
    r = await pakorn.del(`/proposals/${A.id}`)
    expectError('USER DELETE an invisible proposal → 404', r, 404, 'NOT_FOUND')
    r = await manager.get(`/proposals/${A.id}`)
    expect('MANAGER (proposal.read.all) sees it', r, 200, (j) => j.id === A.id)
    r = await nattida.get('/proposals/not-a-uuid')
    expectError('GET /proposals/<malformed id> → 404', r, 404, 'NOT_FOUND')
    r = await nattida.get(`/proposals/${randomUUID()}`)
    expectError('GET /proposals/<unknown id> → 404', r, 404, 'NOT_FOUND')

    r = await pakorn.get('/proposals')
    expect("USER list excludes other users' proposals", r, 200, (j) => !ids(j).includes(A.id) && !ids(j).includes(B.id))
    r = await nattida.get('/proposals')
    const mineDefault = r.json ?? []
    expect('GET /proposals → ProposalListItem[] sorted by targetDate', r, 200, (j) => ids(j).includes(A.id) && ids(j).includes(B.id) && j.every((p) => hasKeys(p, LIST_ITEM_KEYS)) && sortedBy(j, (a, b) => a.targetDate.localeCompare(b.targetDate)))
    r = await nattida.get('/proposals?scope=all')
    expect('USER scope=all falls back to visible proposals', r, 200, (j) => j.length === mineDefault.length)
    r = await admin.get('/proposals?scope=all')
    const all = r.json ?? []
    expect('ADMIN scope=all → every proposal', r, 200, (j) => j.length === 9 + 5 && ids(j).includes(A.id))
    S.totalProposals = all.length
    r = await manager.get('/proposals?scope=mine')
    expect('MANAGER scope=mine → only own/member/assigned', r, 200, (j) => !ids(j).includes(A.id) && j.length < all.length)
    r = await nattida.get('/proposals?status=DRAFT')
    expect('?status=DRAFT', r, 200, (j) => j.length > 0 && j.every((p) => p.status === 'DRAFT') && ids(j).includes(A.id))
    r = await nattida.get('/proposals?status=ACTIVE')
    expect('?status=ACTIVE → DRAFT/IN_PROGRESS/ON_HOLD', r, 200, (j) => j.length > 0 && j.every((p) => ['DRAFT', 'IN_PROGRESS', 'ON_HOLD'].includes(p.status)))
    r = await admin.get('/proposals?scope=all&status=COMPLETED')
    expect('?status=COMPLETED', r, 200, (j) => j.length === 1 && j[0].status === 'COMPLETED')
    r = await nattida.get(`/proposals?q=${A.code}`)
    expect('?q=<code>', r, 200, (j) => j.length === 1 && j[0].id === A.id)
    r = await nattida.get(`/proposals?q=${S.products.lipbalm.sku.toLowerCase()}`)
    expect('?q=<product sku> (case-insensitive)', r, 200, (j) => ids(j).includes(A.id) && j.every((p) => p.products.some((x) => x.sku === S.products.lipbalm.sku)))
    r = await admin.get('/proposals?scope=all&channel=ONLINE')
    expect('?channel=ONLINE', r, 200, (j) => j.length > 0 && j.every((p) => p.channel === 'ONLINE'))
    r = await admin.get(`/proposals?scope=all&storeId=${S.stores.cj.id}`)
    expect('?storeId=', r, 200, (j) => j.length >= 3 && j.every((p) => p.storeId === S.stores.cj.id))
    r = await admin.get(`/proposals?scope=all&shelfTypeId=${S.shelves.exclusive.id}`)
    expect('?shelfTypeId=', r, 200, (j) => j.length > 0 && j.every((p) => p.shelfTypeId === S.shelves.exclusive.id))
    r = await admin.get(`/proposals?scope=all&ownerId=${S.users.pakorn.id}`)
    expect('?ownerId=', r, 200, (j) => j.length > 0 && j.every((p) => p.ownerId === S.users.pakorn.id))
    r = await nattida.get('/proposals?status=BOGUS')
    expectError('?status=BOGUS → 422', r, 422, 'VALIDATION')

    // PATCH
    r = await nattida.patch(`/proposals/${A.id}`, { title: '  E2E แก้ชื่อ  ', note: '', memberIds: [S.users.pakorn.id], productIds: [S.products.lipbalm.id, S.products.serum.id] })
    expect('PATCH /proposals/:id → Proposal', r, 200, (j) => j.title === 'E2E แก้ชื่อ' && j.note === null && JSON.stringify(j.memberIds) === JSON.stringify([S.users.pakorn.id]) && JSON.stringify(j.productIds) === JSON.stringify([S.products.lipbalm.id, S.products.serum.id]))
    r = await pakorn.get(`/proposals/${A.id}`)
    expect('new member can now see the proposal', r, 200, (j) => j.members.some((m) => m.id === S.users.pakorn.id))
    r = await pakorn.get('/notifications')
    expect('new member got a "คุณถูกเพิ่มเป็นทีมงาน" notification', r, 200, (j) => j.some((n) => n.title === 'คุณถูกเพิ่มเป็นทีมงาน' && n.link === `/proposals/${A.id}` && n.type === 'PROPOSAL_STATUS' && !n.isRead))
    r = await pakorn.patch(`/proposals/${A.id}`, { title: 'hijack' })
    expectError('member (not owner) PATCH → 403', r, 403, 'FORBIDDEN', 'เฉพาะเจ้าของโปรเจกต์หรือ Admin')
    r = await nattida.patch(`/proposals/${A.id}`, { title: '   ' })
    expectError('PATCH blank title → 422', r, 422, 'VALIDATION', 'กรุณาระบุชื่องาน')
    r = await nattida.patch(`/proposals/${A.id}`, { productIds: [] })
    expectError('PATCH empty productIds → 422', r, 422, 'VALIDATION', 'ต้องมีสินค้าอย่างน้อย 1 รายการ')
    r = await nattida.patch(`/proposals/${A.id}`, { shelfTypeId: S.shelves.mall.id })
    expectError('PATCH shelf type of another channel → 422', r, 422, 'VALIDATION')
    r = await nattida.patch(`/proposals/${A.id}`, { shelfTypeId: S.shelves.exclusive.id })
    expect('PATCH shelf type', r, 200, (j) => j.shelfTypeId === S.shelves.exclusive.id)
    r = await manager.patch(`/proposals/${A.id}`, { note: 'ผู้จัดการแก้ไข' })
    expectError('MANAGER (not owner) PATCH → 403', r, 403, 'FORBIDDEN', 'เฉพาะเจ้าของโปรเจกต์หรือ Admin')
    r = await admin.patch(`/proposals/${A.id}`, { note: 'Admin แก้ไข' })
    expect('ADMIN (proposal.details.any) PATCH', r, 200, (j) => j.note === 'Admin แก้ไข')

    // Status
    r = await nattida.post(`/proposals/${A.id}/status`, { status: 'COMPLETED' })
    expectError('status COMPLETED while tasks are open → 422', r, 422, 'VALIDATION', 'ยังมีงานที่ยังไม่เสร็จ')
    r = await nattida.post(`/proposals/${A.id}/status`, { status: 'ON_HOLD' })
    expect('POST /proposals/:id/status → ON_HOLD', r, 200, (j) => j.status === 'ON_HOLD' && j.completedAt === null)
    r = await pakorn.get('/notifications')
    expect('members notified about the status change', r, 200, (j) => j.some((n) => n.type === 'PROPOSAL_STATUS' && n.title === 'สถานะเปลี่ยนเป็น "พักไว้"' && n.link === `/proposals/${A.id}`))
    r = await pakorn.post(`/proposals/${A.id}/status`, { status: 'IN_PROGRESS' })
    expectError('member (not owner) status change → 403', r, 403, 'FORBIDDEN')
    r = await nattida.post(`/proposals/${A.id}/status`, { status: 'NOPE' })
    expectError('bad status → 422', r, 422, 'VALIDATION')
    r = await nattida.post(`/proposals/${A.id}/status`, { status: 'IN_PROGRESS' })
    expect('status back to IN_PROGRESS', r, 200, (j) => j.status === 'IN_PROGRESS')
  })

  // -------------------------------------------------------------------------------------------
  await section('Tasks: create / update / permissions', async () => {
    const { A } = must(S.A && S, 'proposal A')
    let r = await nattida.post('/tasks', { proposalId: A.id, parentId: null, title: '  E2E Root  ', startDate: today, dueDate: addDays(today, 10), priority: 'URGENT', assigneeIds: [S.users.kamon.id], description: ' รายละเอียด ' })
    expect('POST /tasks level 1', r, [200, 201], (j) => j.level === 1 && j.parentId === null && j.title === 'E2E Root' && j.priority === 'URGENT' && j.description === 'รายละเอียด' && JSON.stringify(j.assigneeIds) === JSON.stringify([S.users.kamon.id]) && j.createdById === S.users.nattida.id)
    const root = must(r.json?.id && r.json, 'root task')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: root.id, title: 'E2E Sub', startDate: today, dueDate: addDays(today, 5) })
    expect('POST /tasks level 2', r, [200, 201], (j) => j.level === 2 && j.parentId === root.id && j.priority === 'MEDIUM' && j.assigneeIds.length === 0)
    const sub = must(r.json?.id && r.json, 'sub task')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: sub.id, title: 'E2E Mini', dueDate: addDays(today, 2) })
    expect('POST /tasks level 3', r, [200, 201], (j) => j.level === 3 && j.parentId === sub.id)
    const mini = must(r.json?.id && r.json, 'mini task')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: mini.id, title: 'E2E Level 4' })
    expectError('POST /tasks 4th level → 422', r, 422, 'VALIDATION', 'เพิ่มได้สูงสุด 3 ระดับ')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: null, title: 'bad dates', startDate: addDays(today, 3), dueDate: today })
    expectError('POST /tasks due before start → 422', r, 422, 'VALIDATION', 'วันครบกำหนดต้องไม่อยู่ก่อนวันเริ่ม')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: null, title: '   ' })
    expectError('POST /tasks blank title → 422', r, 422, 'VALIDATION', 'กรุณาระบุชื่องาน')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: randomUUID(), title: 'orphan' })
    expectError('POST /tasks unknown parent → 404', r, 404, 'NOT_FOUND')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: null, title: 'x', assigneeIds: [S.users.former.id] })
    expectError('POST /tasks inactive assignee → 422', r, 422, 'VALIDATION', 'ถูกปิดการใช้งานแล้ว')
    r = await nattida.post('/tasks', { proposalId: A.id, parentId: null, title: 'E2E First', index: 0 })
    expect('POST /tasks with index 0 → inserted first (sortOrder renumbered)', r, [200, 201], (j) => j.sortOrder === 1000)
    const first = r.json
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    const roots = (r.json ?? []).filter((t) => t.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder)
    check('roots renumbered (i+1)*1000 with the new task first', roots[0]?.id === first?.id && roots.every((t, i) => t.sortOrder === (i + 1) * 1000), JSON.stringify(roots.map((t) => [t.title, t.sortOrder])))
    check('tree still valid after inserts', treeIsValid(r.json ?? []))
    r = await teerawat.post('/tasks', { proposalId: A.id, parentId: null, title: 'outsider' })
    expectError('non-member POST /tasks → 404 (cannot see the proposal)', r, 404, 'NOT_FOUND')
    r = await pakorn.post('/tasks', { proposalId: A.id, parentId: null, title: 'E2E by member' })
    expect('member POST /tasks → allowed', r, [200, 201], (j) => j.createdById === S.users.pakorn.id)

    // Assignee-only edit limits (kamon is assigned to "E2E Root" but is not a member).
    r = await kamon.get(`/proposals/${A.id}`)
    expect('assignee can view the proposal', r, 200, (j) => j.id === A.id)
    r = await kamon.get('/notifications')
    expect('assignee got TASK_ASSIGNED', r, 200, (j) => j.some((n) => n.type === 'TASK_ASSIGNED' && n.body === 'E2E Root' && n.link === `/proposals/${A.id}?task=${root.id}`))
    r = await kamon.patch(`/tasks/${root.id}`, { description: 'kamon note' })
    expect('assignee PATCH description → 200', r, 200, (j) => j.description === 'kamon note' && j.title === 'E2E Root')
    r = await kamon.patch(`/tasks/${root.id}`, { priority: 'LOW' })
    expectError('assignee PATCH priority → 403', r, 403, 'FORBIDDEN', 'ผู้รับผิดชอบงานแก้ไขได้เฉพาะรายละเอียดและข้อมูลในตาราง')
    r = await kamon.patch(`/tasks/${root.id}`, { dueDate: addDays(today, 12) })
    expectError('assignee PATCH dates → 403 (existing task dates: ADMIN only)', r, 403, 'FORBIDDEN', 'แก้ได้เฉพาะ Admin')
    r = await kamon.patch(`/tasks/${root.id}`, { title: 'hijack' })
    expectError('assignee PATCH title → 403', r, 403, 'FORBIDDEN', 'ผู้รับผิดชอบงานแก้ไขได้เฉพาะรายละเอียดและข้อมูลในตาราง')
    r = await kamon.patch(`/tasks/${root.id}`, { assigneeIds: [S.users.kamon.id] })
    expectError('assignee PATCH assignees → 403', r, 403, 'FORBIDDEN')
    r = await kamon.patch(`/tasks/${sub.id}`, { description: 'x' })
    expectError('assignee PATCH a task not assigned to them → 403', r, 403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์แก้ไขงานนี้')
    r = await kamon.post('/tasks', { proposalId: A.id, parentId: null, title: 'kamon task' })
    expectError('assignee (non-member) POST /tasks → 403', r, 403, 'FORBIDDEN', 'เฉพาะทีมงานของโปรเจกต์นี้ที่เพิ่มงานได้')
    r = await kamon.post(`/tasks/${sub.id}/toggle`, { isDone: true })
    expectError('assignee toggles a task not assigned to them → 403', r, 403, 'FORBIDDEN')
    r = await kamon.post(`/tasks/${mini.id}/move`, { parentId: null, index: 0 })
    expectError('assignee move → 403', r, 403, 'FORBIDDEN')
    r = await kamon.post(`/tasks/${mini.id}/duplicate`)
    expectError('assignee duplicate → 403', r, 403, 'FORBIDDEN')
    r = await kamon.del(`/tasks/${mini.id}`)
    expectError('assignee delete → 403', r, 403, 'FORBIDDEN')
    r = await teerawat.patch(`/tasks/${root.id}`, { description: 'x' })
    expectError('outsider PATCH /tasks/:id → 404', r, 404, 'NOT_FOUND')

    r = await nattida.patch(`/tasks/${sub.id}`, { title: 'E2E Sub (แก้)', priority: 'HIGH', assigneeIds: [S.users.nattida.id, S.users.pakorn.id] })
    expect('owner PATCH /tasks/:id → Task', r, 200, (j) => j.title === 'E2E Sub (แก้)' && j.priority === 'HIGH' && j.assigneeIds.length === 2)
    r = await pakorn.get('/notifications')
    expect('added assignee notified', r, 200, (j) => j.some((n) => n.type === 'TASK_ASSIGNED' && n.body === 'E2E Sub (แก้)'))
    r = await nattida.patch(`/tasks/${sub.id}`, { startDate: addDays(today, 1) })
    expectError('owner PATCH dates of an existing task → 403 (ADMIN only)', r, 403, 'FORBIDDEN', 'แก้ได้เฉพาะ Admin')
    r = await admin.patch(`/tasks/${sub.id}`, { startDate: addDays(today, 30) })
    expectError('PATCH start after due → 422', r, 422, 'VALIDATION', 'วันครบกำหนดต้องไม่อยู่ก่อนวันเริ่ม')
    r = await nattida.patch(`/tasks/${sub.id}`, { dueDate: '2026-02-30' })
    expectError('PATCH impossible date → 422', r, 422, 'VALIDATION')
    r = await nattida.patch(`/tasks/${randomUUID()}`, { title: 'x' })
    expectError('PATCH /tasks/<unknown> → 404', r, 404, 'NOT_FOUND')
    S.root = root
    S.sub = sub
    S.mini = mini
  })

  // -------------------------------------------------------------------------------------------
  await section('Tasks: toggle cascade, move, duplicate, delete, mine', async () => {
    const { A, B } = must(S.A && S.B && S, 'proposals')
    let r = await nattida.get(`/proposals/${A.id}/tasks`)
    let tasks = r.json ?? []
    const T = (title) => must(byTitle(tasks, title), `task "${title}"`)
    const prep = T('E2E: เตรียมเอกสาร')
    const quote = T('E2E: ขอใบเสนอราคา')
    const email = T('E2E: ส่งอีเมล')
    const contract = T('E2E: เซ็นสัญญา')

    r = await nattida.post(`/tasks/${prep.id}/toggle`, { isDone: true })
    expect('toggle a parent → cascades to every descendant', r, 200, (j) => [prep.id, quote.id, email.id, contract.id].every((id) => j.changed.some((t) => t.id === id && t.isDone && t.completedById === S.users.nattida.id && t.completedAt)) && j.changed.length === 4 && hasKeys(j.progress, ['done', 'total', 'percent']) && j.allDone === false)
    r = await nattida.post(`/tasks/${email.id}/toggle`, { isDone: false })
    expect('untick a mini task → its ancestors re-open', r, 200, (j) => j.changed.length === 3 && j.changed.every((t) => !t.isDone && t.completedAt === null) && [email.id, quote.id, prep.id].every((id) => j.changed.some((t) => t.id === id)))
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    tasks = r.json ?? []
    check('state after untick: contract still done, prep/quote/email open', byTitle(tasks, 'E2E: เซ็นสัญญา')?.isDone === true && !byTitle(tasks, 'E2E: เตรียมเอกสาร')?.isDone && !byTitle(tasks, 'E2E: ขอใบเสนอราคา')?.isDone)
    r = await nattida.post(`/tasks/${email.id}/toggle`, { isDone: true })
    expect('ticking the last open child completes the parents', r, 200, (j) => j.changed.length === 3 && j.changed.every((t) => t.isDone))
    r = await nattida.post(`/tasks/${email.id}/toggle`, { isDone: 'yes' })
    expectError('toggle with a non-boolean → 422', r, 422, 'VALIDATION')

    // Assignee may toggle their own task.
    r = await kamon.post(`/tasks/${S.root.id}/toggle`, { isDone: true })
    expect('assignee toggles their own task (with children) → cascade', r, 200, (j) => j.changed.length === 3 && j.changed.every((t) => t.isDone))
    r = await kamon.post(`/tasks/${S.root.id}/toggle`, { isDone: false })
    expect('assignee un-ticks it again', r, 200, (j) => j.changed.every((t) => !t.isDone))

    // DRAFT → IN_PROGRESS on first tick (B is still DRAFT).
    r = await nattida.get(`/proposals/${B.id}/tasks`)
    const bTasks = r.json ?? []
    const bLeaf = must(byTitle(bTasks, 'E2E: เซ็นสัญญา'), 'B leaf')
    r = await nattida.post(`/tasks/${bLeaf.id}/toggle`, { isDone: true })
    expect('tick in a DRAFT proposal', r, 200, (j) => j.changed.length === 1 && j.progress.done === 1)
    r = await nattida.get(`/proposals/${B.id}`)
    expect('DRAFT proposal becomes IN_PROGRESS on the first tick', r, 200, (j) => j.status === 'IN_PROGRESS' && j.progress.done === 1)

    // allDone + COMPLETED on the plan proposal (single chain of 3).
    if (S.C) {
      r = await nattida.get(`/proposals/${S.C.id}/tasks`)
      const cRoot = byTitle(r.json ?? [], 'งานจากแผน')
      r = await nattida.post(`/tasks/${cRoot.id}/toggle`, { isDone: true })
      expect('ticking everything → allDone true, progress 100%', r, 200, (j) => j.allDone === true && j.progress.percent === 100 && j.progress.total === 1)
      r = await nattida.post(`/proposals/${S.C.id}/status`, { status: 'COMPLETED' })
      expect('status COMPLETED once every task is done', r, 200, (j) => j.status === 'COMPLETED' && !!j.completedAt)
    }

    // Move
    r = await nattida.post(`/tasks/${S.mini.id}/move`, { parentId: null, index: 0 })
    expect('move a mini task to the top level (index 0) → whole proposal returned', r, 200, (j) => Array.isArray(j) && treeIsValid(j) && j.find((t) => t.id === S.mini.id)?.level === 1 && j.find((t) => t.id === S.mini.id)?.parentId === null && j.find((t) => t.id === S.mini.id)?.sortOrder === 1000 && j.every((t) => t.proposalId === A.id))
    r = await nattida.post(`/tasks/${prep.id}/move`, { parentId: T('E2E: วางสินค้า').id, index: 0 })
    expectError('move a 3-level subtree under a level-1 task → 422 (depth)', r, 422, 'VALIDATION', 'เกิน 3 ระดับ')
    r = await nattida.post(`/tasks/${prep.id}/move`, { parentId: prep.id, index: 0 })
    expectError('move under itself → 422', r, 422, 'VALIDATION', 'ย้ายไปไว้ใต้ตัวเองไม่ได้')
    r = await nattida.post(`/tasks/${prep.id}/move`, { parentId: quote.id, index: 0 })
    expectError('move under its own descendant → 422', r, 422, 'VALIDATION', 'ย้ายไปไว้ใต้งานย่อยของตัวเองไม่ได้')
    r = await nattida.post(`/tasks/${quote.id}/move`, { parentId: null, index: 99 })
    expect('move a level-2 subtree to the top level → levels shift', r, 200, (j) => j.find((t) => t.id === quote.id)?.level === 1 && j.find((t) => t.id === email.id)?.level === 2 && treeIsValid(j))
    r = await nattida.post(`/tasks/${quote.id}/move`, { parentId: prep.id, index: 0 })
    expect('move it back under its original parent', r, 200, (j) => j.find((t) => t.id === quote.id)?.level === 2 && j.find((t) => t.id === email.id)?.level === 3 && j.filter((t) => t.parentId === prep.id).sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id === quote.id)
    r = await nattida.post(`/tasks/${quote.id}/move`, { parentId: null })
    expectError('move without index → 422', r, 422, 'VALIDATION')

    // Duplicate
    r = await nattida.post(`/tasks/${quote.id}/duplicate`)
    expect('POST /tasks/:id/duplicate → copy of the subtree root', r, [200, 201], (j) => j.title === 'E2E: ขอใบเสนอราคา (สำเนา)' && j.parentId === prep.id && j.level === 2 && j.isDone === false)
    const copy = must(r.json?.id && r.json, 'copy')
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    tasks = r.json ?? []
    const copyChild = tasks.find((t) => t.parentId === copy.id)
    check('duplicate copies the subtree (child re-parented, open)', copyChild?.title === 'E2E: ส่งอีเมล' && copyChild.level === 3 && copyChild.isDone === false && treeIsValid(tasks))
    const prepKids = tasks.filter((t) => t.parentId === prep.id).sort((a, b) => a.sortOrder - b.sortOrder)
    check('copy is placed right after the original', prepKids[0]?.id === quote.id && prepKids[1]?.id === copy.id, JSON.stringify(prepKids.map((t) => [t.title, t.sortOrder])))
    check('an open copy re-opens the done parent', byTitle(tasks, 'E2E: เตรียมเอกสาร')?.isDone === false)

    // Delete subtree
    r = await nattida.del(`/tasks/${copy.id}`)
    expect('DELETE /tasks/:id → { removed: subtree ids }', r, 200, (j) => j.removed.length === 2 && j.removed.includes(copy.id) && j.removed.includes(copyChild?.id))
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    tasks = r.json ?? []
    check('deleted subtree gone; parent re-derived (all remaining children done)', !tasks.some((t) => t.id === copy.id || t.id === copyChild?.id) && byTitle(tasks, 'E2E: เตรียมเอกสาร')?.isDone === true)
    r = await nattida.del(`/tasks/${copy.id}`)
    expectError('DELETE the same task again → 404', r, 404, 'NOT_FOUND')

    // /tasks/mine
    r = await nattida.get('/tasks/mine')
    expect('GET /tasks/mine → open tasks assigned to me, by due date', r, 200, (j) => j.length > 0 && j.every((x) => hasKeys(x, CONTEXT_KEYS) && x.task.assigneeIds.includes(S.users.nattida.id) && !x.task.isDone && x.proposal.status !== 'CANCELLED' && x.store.id === x.proposal.storeId) && sortedBy(j, (a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999')))
    r = await nattida.get('/tasks/mine?status=done')
    expect('?status=done', r, 200, (j) => j.length > 0 && j.every((x) => x.task.isDone))
    r = await nattida.get(`/tasks/mine?status=all&proposalId=${B.id}`)
    expect('?status=all&proposalId= → every task of that proposal assigned to me, with ancestor path', r, 200, (j) => j.length === 6 && j.every((x) => x.task.proposalId === B.id) && j.find((x) => x.task.title === 'E2E: ส่งอีเมล')?.path.join(' > ') === 'E2E: เตรียมเอกสาร > E2E: ขอใบเสนอราคา')
    r = await nattida.get('/tasks/mine?due=overdue')
    expect('?due=overdue', r, 200, (j) => j.every((x) => x.task.dueDate && x.task.dueDate < today && !x.task.isDone))
    r = await nattida.get('/tasks/mine?due=today')
    expect('?due=today', r, 200, (j) => j.every((x) => x.task.dueDate === today))
    r = await nattida.get('/tasks/mine?due=week')
    expect('?due=week', r, 200, (j) => j.every((x) => x.task.dueDate >= today && x.task.dueDate <= addDays(today, 7)))
    r = await nattida.get('/tasks/mine?status=bogus')
    expectError('?status=bogus → 422', r, 422, 'VALIDATION')

    // Cancelled proposal: no ticking, hidden from /tasks/mine.
    if (S.X) {
      r = await nattida.post(`/proposals/${S.X.id}/status`, { status: 'CANCELLED' })
      expect('cancel a proposal', r, 200, (j) => j.status === 'CANCELLED')
      r = await nattida.get(`/proposals/${S.X.id}/tasks`)
      const xt = (r.json ?? [])[0]
      r = await nattida.post(`/tasks/${xt?.id}/toggle`, { isDone: true })
      expectError('toggle in a CANCELLED proposal → 422', r, 422, 'VALIDATION', 'โปรเจกต์นี้ถูกยกเลิกแล้ว')
      r = await nattida.get(`/tasks/mine?status=all&proposalId=${S.X.id}`)
      expect('/tasks/mine skips CANCELLED proposals', r, 200, (j) => j.length === 0)
    }
  })

  // -------------------------------------------------------------------------------------------
  await section('Proposals: target date, duplicate, delete', async () => {
    const { A, B } = must(S.A && S.B && S, 'proposals')
    let r = await nattida.get(`/proposals/${B.id}/tasks`)
    const before = r.json ?? []
    const oldTarget = (await nattida.get(`/proposals/${B.id}`)).json?.targetDate
    must(before.some((t) => t.isDone) && before.some((t) => !t.isDone), 'B has done and open tasks')
    const newTarget = addDays(oldTarget, 7)
    r = await nattida.post(`/proposals/${B.id}/target-date`, { targetDate: newTarget, shiftTasks: true })
    expect('POST /proposals/:id/target-date (shiftTasks) → Proposal', r, 200, (j) => j.targetDate === newTarget)
    r = await nattida.get(`/proposals/${B.id}/tasks`)
    const after = r.json ?? []
    check(
      'open task dates moved by the delta; done tasks unchanged',
      before.every((b) => {
        const a = after.find((x) => x.id === b.id)
        const shift = (d) => (d ? addDays(d, b.isDone ? 0 : 7) : null)
        return a && a.startDate === shift(b.startDate) && a.dueDate === shift(b.dueDate)
      }),
      JSON.stringify(after.map((t) => [t.title, t.isDone, t.startDate, t.dueDate])),
    )
    r = await nattida.post(`/proposals/${B.id}/target-date`, { targetDate: addDays(newTarget, 3) })
    expect('target-date without shiftTasks', r, 200, (j) => j.targetDate === addDays(newTarget, 3))
    r = await nattida.get(`/proposals/${B.id}/tasks`)
    check('tasks untouched without shiftTasks', JSON.stringify((r.json ?? []).map((t) => [t.id, t.startDate, t.dueDate])) === JSON.stringify(after.map((t) => [t.id, t.startDate, t.dueDate])))
    r = await nattida.get(`/activity?proposalId=${B.id}`)
    expect('target-date logged in Thai', r, 200, (j) => j.some((a) => a.action === 'proposal.targetDate' && a.summary === `เลื่อนวันวางขายจาก ${oldTarget} เป็น ${newTarget} และเลื่อนงานที่ยังไม่เสร็จ 7 วัน`))
    r = await nattida.post(`/proposals/${B.id}/target-date`, { targetDate: '2026-13-01', shiftTasks: true })
    expectError('target-date invalid date → 422', r, 422, 'VALIDATION')
    r = await pakorn.post(`/proposals/${B.id}/target-date`, { targetDate: today, shiftTasks: false })
    expectError('target-date on an invisible proposal → 404', r, 404, 'NOT_FOUND')

    // Duplicate B to Watsons.
    const currentTarget = addDays(newTarget, 3)
    const dupTarget = addDays(currentTarget, 30)
    r = await nattida.get(`/proposals/${B.id}/tasks`)
    const source = r.json ?? []
    r = await nattida.post(`/proposals/${B.id}/duplicate`, { storeId: S.stores.watsons.id, targetDate: dupTarget })
    expect('POST /proposals/:id/duplicate → new DRAFT proposal', r, [200, 201], (j) => j.status === 'DRAFT' && j.ownerId === S.users.nattida.id && j.storeId === S.stores.watsons.id && j.targetDate === dupTarget && j.title.endsWith(`→ ${S.stores.watsons.name}`) && /^PRJ-\d{4}-\d{4}$/.test(j.code) && j.code !== B.code && j.completedAt === null)
    const D = must(r.json?.id && r.json, 'duplicate')
    r = await nattida.get(`/proposals/${D.id}/tasks`)
    const copied = r.json ?? []
    check(
      'duplicate copies every task, open, dates shifted by the target delta, same tree',
      copied.length === source.length &&
        treeIsValid(copied) &&
        copied.every((c) => !c.isDone) &&
        source.every((s) => {
          const c = byTitle(copied, s.title)
          const parentTitle = s.parentId ? source.find((x) => x.id === s.parentId).title : null
          const cParentTitle = c?.parentId ? copied.find((x) => x.id === c.parentId)?.title : null
          return c && c.startDate === (s.startDate ? addDays(s.startDate, diffDays(currentTarget, dupTarget)) : null) && cParentTitle === parentTitle && c.level === s.level
        }),
    )
    r = await nattida.post(`/proposals/${B.id}/duplicate`, { storeId: S.stores.shopee.id, targetDate: dupTarget })
    expectError('duplicate to a store of another channel → 422', r, 422, 'VALIDATION', 'ห้างปลายทางไม่ถูกต้อง')
    r = await pakorn.post(`/proposals/${B.id}/duplicate`, { storeId: S.stores.watsons.id, targetDate: dupTarget })
    expectError('duplicate an invisible proposal → 404', r, 404, 'NOT_FOUND')

    // Concurrency: parallel writes on one proposal serialise on the proposal row (no deadlock → no 500).
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    const aTasksBefore = r.json ?? []
    const leaves = aTasksBefore.filter((t) => !aTasksBefore.some((c) => c.parentId === t.id)).slice(0, 3)
    const aTarget = (await nattida.get(`/proposals/${A.id}`)).json?.targetDate
    const burst = await Promise.all([
      nattida.post(`/proposals/${A.id}/target-date`, { targetDate: addDays(aTarget, 2), shiftTasks: true }),
      ...leaves.map((t) => nattida.post(`/tasks/${t.id}/toggle`, { isDone: !t.isDone })),
      nattida.post('/tasks', { proposalId: A.id, parentId: null, title: 'E2E parallel' }),
      nattida.post(`/proposals/${A.id}/target-date`, { targetDate: addDays(aTarget, 4), shiftTasks: true }),
    ])
    check('parallel target-date / toggle / create on one proposal → all succeed', burst.every((x) => x.status === 200 || x.status === 201), burst.map(brief).join('\n'))
    r = await nattida.get(`/proposals/${A.id}`)
    const finalTarget = r.json?.targetDate
    check('target date is the last committed change', finalTarget === addDays(aTarget, 2) || finalTarget === addDays(aTarget, 4), brief(r))
    const beforeBurst = new Map(aTasksBefore.map((t) => [t.id, t]))
    r = await nattida.get(`/proposals/${A.id}/tasks`)
    const untouched = (r.json ?? []).filter((t) => beforeBurst.has(t.id) && !leaves.some((l) => l.id === t.id) && !beforeBurst.get(t.id).isDone && !t.isDone && t.dueDate)
    check(
      'serialised date shifts: untouched open tasks moved by exactly (final − original) days',
      untouched.length > 0 && untouched.every((t) => t.dueDate === addDays(beforeBurst.get(t.id).dueDate, diffDays(aTarget, finalTarget))),
      JSON.stringify(untouched.map((t) => [t.title, beforeBurst.get(t.id).dueDate, t.dueDate])),
    )
    const parallel = await Promise.all(
      [S.stores.cj.id, S.stores.eve.id].map((storeId) => nattida.post('/proposals', { channel: 'OFFLINE', productIds: [S.products.almond.id], storeIds: [storeId], shelfTypeId: S.shelves.normal.id, targetDate: addDays(today, 20), templateId: null, status: 'DRAFT' })),
    )
    const pCodes = parallel.map((x) => x.json?.[0]?.code)
    check('parallel wizard submits get distinct, consecutive codes', parallel.every((x) => x.status === 201 || x.status === 200) && new Set(pCodes).size === 2 && Math.abs(Number(pCodes[0]?.slice(-4)) - Number(pCodes[1]?.slice(-4))) === 1, parallel.map(brief).join('\n'))
    for (const x of parallel) if (x.json?.[0]?.id) await nattida.del(`/proposals/${x.json[0].id}`)

    // Delete rules.
    r = await pakorn.del(`/proposals/${A.id}`)
    expectError('member DELETE → 403', r, 403, 'FORBIDDEN')
    r = await nattida.del(`/proposals/${A.id}`)
    expectError('owner DELETE of a started proposal → 403', r, 403, 'FORBIDDEN', 'ลบได้เฉพาะงานร่างของตัวเอง')
    r = await nattida.del(`/proposals/${D.id}`)
    expect('owner DELETE own DRAFT → true', r, 200, (j) => j === true)
    r = await nattida.get(`/proposals/${D.id}`)
    expectError('deleted proposal → 404', r, 404, 'NOT_FOUND')
    r = await admin.get(`/activity?limit=5`)
    expect('delete logged without proposal link', r, 200, (j) => j.some((a) => a.action === 'proposal.delete' && a.proposalId === null && a.summary.startsWith(`ลบการเสนอสินค้า ${D.code}`)))
    if (S.Y) {
      r = await admin.del(`/proposals/${S.Y.id}`)
      expect('ADMIN (proposal.delete.any) DELETE → true', r, 200, (j) => j === true)
      S.totalProposals -= 1
    }
  })

  // -------------------------------------------------------------------------------------------
  await section('Comments', async () => {
    const { A, root } = must(S.A && S.root && S, 'proposal + task')
    let r = await nattida.post(`/tasks/${root.id}/comments`, { body: '  ความคิดเห็นแรก  ' })
    expect('POST /tasks/:id/comments → CommentWithAuthor', r, [200, 201], (j) => j.body === 'ความคิดเห็นแรก' && j.author.id === S.users.nattida.id && j.proposalId === A.id && j.taskId === root.id)
    r = await kamon.post(`/tasks/${root.id}/comments`, { body: 'ตอบกลับจาก kamon' })
    expect('assignee can comment', r, [200, 201], (j) => j.author.id === S.users.kamon.id)
    r = await nattida.post(`/tasks/${root.id}/comments`, { body: '   ' })
    expectError('blank comment → 422', r, 422, 'VALIDATION', 'กรุณาพิมพ์ข้อความ')
    r = await teerawat.post(`/tasks/${root.id}/comments`, { body: 'outsider' })
    expectError('outsider comment → 404', r, 404, 'NOT_FOUND')
    r = await nattida.get(`/tasks/${root.id}/comments`)
    expect('GET /tasks/:id/comments → oldest first with authors', r, 200, (j) => j.length === 2 && j[0].author.id === S.users.nattida.id && j[1].author.id === S.users.kamon.id && sortedBy(j, (a, b) => a.createdAt.localeCompare(b.createdAt)))
    r = await teerawat.get(`/tasks/${root.id}/comments`)
    expectError('outsider GET comments → 404', r, 404, 'NOT_FOUND')
    r = await nattida.get(`/tasks/${randomUUID()}/comments`)
    expectError('comments of an unknown task → 404', r, 404, 'NOT_FOUND')
    r = await nattida.get(`/proposals/${A.id}/comment-counts`)
    expect('GET /proposals/:id/comment-counts → { taskId: count }', r, 200, (j) => j[root.id] === 2 && Object.keys(j).length === 1)
    r = await kamon.get('/notifications')
    expect('assignee notified about the owner comment', r, 200, (j) => j.some((n) => n.type === 'COMMENT' && n.title === `${S.users.nattida.name} แสดงความคิดเห็น` && n.body === 'E2E Root: ความคิดเห็นแรก'))
    r = await nattida.get('/notifications')
    expect('owner notified about the assignee comment', r, 200, (j) => j.some((n) => n.type === 'COMMENT' && n.title === `${S.users.kamon.name} แสดงความคิดเห็น`))
  })

  // -------------------------------------------------------------------------------------------
  await section('Activity', async () => {
    const { A } = must(S.A && S, 'proposal A')
    let r = await admin.get('/activity?limit=5')
    expect('GET /activity?limit=5 → newest first, with actor', r, 200, (j) => j.length === 5 && j.every((a) => hasKeys(a, ['id', 'actorId', 'action', 'entityType', 'entityId', 'proposalId', 'summary', 'createdAt', 'actor']) && a.actor.id === a.actorId) && sortedBy(j, (a, b) => b.createdAt.localeCompare(a.createdAt)))
    r = await manager.get('/activity')
    expect('MANAGER GET /activity (activity.read.all)', r, 200, (j) => j.length > 0 && j.length <= 100)
    r = await admin.get('/activity?limit=500')
    expect('activity contains the Thai summaries of earlier writes', r, 200, (j) =>
      ['user.create', 'user.update', 'user.deactivate', 'user.activate', 'user.resetPassword', 'user.changePassword', 'store.create', 'store.update', 'store.delete', 'shelfType.create', 'shelfType.delete', 'product.create', 'product.update', 'product.delete', 'template.create', 'template.update', 'template.delete', 'proposal.create', 'proposal.update', 'proposal.status', 'proposal.duplicate', 'proposal.delete', 'task.create', 'task.update', 'task.complete', 'task.reopen', 'task.move', 'task.duplicate', 'task.delete'].every((action) => j.some((a) => a.action === action)) &&
      j.some((a) => a.summary === 'เพิ่มผู้ใช้ ทดสอบ อีทูอี (USER)') &&
      j.some((a) => a.summary === 'เพิ่มห้าง E2E Mart'),
    )
    r = await nattida.get('/activity')
    expectError('USER GET /activity (no proposalId) → 403', r, 403, 'FORBIDDEN')
    r = await nattida.get(`/activity?proposalId=${A.id}`)
    expect('USER GET /activity?proposalId=<own> → that proposal only', r, 200, (j) => j.length > 0 && j.every((a) => a.proposalId === A.id) && ['proposal.create', 'proposal.update', 'proposal.status', 'task.create', 'task.complete', 'task.move'].every((x) => j.some((a) => a.action === x)))
    r = await admin.get('/activity?limit=0')
    expectError('limit=0 → 422', r, 422, 'VALIDATION')
    r = await admin.get('/activity?proposalId=not-a-uuid')
    expectError('activity for a malformed proposal id → 404', r, 404, 'NOT_FOUND')
  })

  // -------------------------------------------------------------------------------------------
  await section('Notifications', async () => {
    let r = await pakorn.get('/notifications')
    expect('GET /notifications → own notifications, newest first (≤50)', r, 200, (j) => j.length > 0 && j.length <= 50 && j.every((n) => n.userId === S.users.pakorn.id) && sortedBy(j, (a, b) => b.createdAt.localeCompare(a.createdAt)))
    const unread = (r.json ?? []).filter((n) => !n.isRead)
    must(unread.length >= 2, 'pakorn has unread notifications')
    r = await pakorn.post('/notifications/read', { id: unread[0].id })
    expect('POST /notifications/read { id } → true', r, 200, (j) => j === true)
    r = await pakorn.get('/notifications')
    expect('that notification is now read, others untouched', r, 200, (j) => j.find((n) => n.id === unread[0].id)?.isRead === true && j.find((n) => n.id === unread[1].id)?.isRead === false)
    r = await kamon.get('/notifications')
    const kamonUnread = must((r.json ?? []).find((n) => !n.isRead), 'kamon unread')
    r = await pakorn.post('/notifications/read', { id: kamonUnread.id })
    expect("marking someone else's notification → true but no effect", r, 200, (j) => j === true)
    r = await kamon.get('/notifications')
    check("other user's notification still unread", (r.json ?? []).find((n) => n.id === kamonUnread.id)?.isRead === false)
    r = await pakorn.post('/notifications/read', { id: 'all' })
    expect('POST /notifications/read { id: "all" } → true', r, 200, (j) => j === true)
    r = await pakorn.get('/notifications')
    expect('all own notifications read', r, 200, (j) => j.every((n) => n.isRead))
    r = await pakorn.post('/notifications/read', {})
    expectError('POST /notifications/read without id → 422', r, 422, 'VALIDATION')
  })

  // -------------------------------------------------------------------------------------------
  await section('Dashboard', async () => {
    let r = await nattida.get('/dashboard/home')
    expect('GET /dashboard/home → HomeSummary shape', r, 200, (j) => hasKeys(j, ['today', 'overdue', 'dueToday', 'dueThisWeek', 'myProposals', 'upcomingLaunches', 'counts']) && hasKeys(j.counts, ['open', 'overdue', 'doneThisWeek']) && j.today === today)
    const home = r.json ?? {}
    check(
      'home numbers are consistent',
      Object.values(home.counts ?? {}).every((n) => Number.isInteger(n) && n >= 0) &&
        home.counts.overdue === home.overdue.length &&
        home.counts.open >= home.overdue.length + home.dueToday.length + home.dueThisWeek.length &&
        home.counts.doneThisWeek >= 1,
      JSON.stringify(home.counts),
    )
    check('home overdue/dueToday/dueThisWeek buckets are correct', home.overdue.every((x) => x.task.dueDate < today && !x.task.isDone) && home.dueToday.every((x) => x.task.dueDate === today) && home.dueThisWeek.every((x) => x.task.dueDate > today && x.task.dueDate <= addDays(today, 7)) && [...home.overdue, ...home.dueToday, ...home.dueThisWeek].every((x) => hasKeys(x, CONTEXT_KEYS) && x.task.assigneeIds.includes(S.users.nattida.id)))
    check('home myProposals = own/member, not closed', home.myProposals.length > 0 && home.myProposals.every((p) => (p.ownerId === S.users.nattida.id || p.memberIds.includes(S.users.nattida.id)) && !['CANCELLED', 'COMPLETED'].includes(p.status) && hasKeys(p, LIST_ITEM_KEYS)))
    check('home upcomingLaunches within 30 days', home.upcomingLaunches.every((p) => p.targetDate >= today && p.targetDate <= addDays(today, 30) && p.status !== 'CANCELLED'))

    r = await nattida.get('/dashboard/summary')
    expectError('USER GET /dashboard/summary → 403', r, 403, 'FORBIDDEN')
    r = await manager.get('/dashboard/summary')
    expect('MANAGER GET /dashboard/summary → DashboardSummary shape', r, 200, (j) => hasKeys(j, ['today', 'kpis', 'byStatus', 'byChannel', 'byStore', 'upcomingLaunches', 'atRisk', 'overdueTasks', 'workload']) && hasKeys(j.kpis, ['activeProposals', 'completedThisMonth', 'launchesNext30', 'openTasks', 'overdueTasks', 'avgProgress']))
    const sum = r.json ?? {}
    const count = (status) => sum.byStatus?.find((x) => x.status === status)?.count ?? 0
    check(
      'summary numbers are sane',
      JSON.stringify(sum.byStatus.map((x) => x.status)) === JSON.stringify(['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']) &&
        sum.byStatus.reduce((s, x) => s + x.count, 0) === S.totalProposals &&
        sum.kpis.activeProposals === count('DRAFT') + count('IN_PROGRESS') + count('ON_HOLD') &&
        sum.byChannel.reduce((s, x) => s + x.count, 0) === sum.kpis.activeProposals &&
        sum.kpis.avgProgress >= 0 &&
        sum.kpis.avgProgress <= 100 &&
        sum.kpis.completedThisMonth >= 1 &&
        sum.kpis.overdueTasks === sum.overdueTasks.length &&
        sum.kpis.openTasks >= sum.kpis.overdueTasks &&
        Object.values(sum.kpis).every((n) => Number.isInteger(n) && n >= 0),
      JSON.stringify({ kpis: sum.kpis, byStatus: sum.byStatus, byChannel: sum.byChannel, total: S.totalProposals }),
    )
    check('summary lists are consistent', sum.upcomingLaunches.every((p) => p.targetDate >= today && p.targetDate <= addDays(today, 45)) && sum.overdueTasks.every((x) => x.task.dueDate < today && !x.task.isDone) && sum.byStore.every((s) => s.active + s.completed > 0 && s.store.isActive) && sum.atRisk.every((p) => p.overdueCount > 0 || (p.targetDate <= addDays(today, 14) && p.progress.percent < 70)))
    check('summary workload sorted by overdue then open, only active users with open work', sum.workload.length > 0 && sum.workload.every((w) => w.user.isActive && w.open > 0 && w.overdue <= w.open) && sortedBy(sum.workload, (a, b) => b.overdue - a.overdue || b.open - a.open))
  })

  // -------------------------------------------------------------------------------------------
  await section('Dev reset (re-seeds; every session ends)', async () => {
    let r = await nattida.post('/dev/reset')
    expectError('USER POST /dev/reset → 403', r, 403, 'FORBIDDEN')
    r = await manager.post('/dev/reset')
    expectError('MANAGER POST /dev/reset → 403', r, 403, 'FORBIDDEN')
    r = await admin.post('/dev/reset')
    expect('ADMIN POST /dev/reset → true', r, 200, (j) => j === true)
    r = await admin.get('/stores')
    expectError("admin's old session no longer works", r, 401, 'UNAUTHENTICATED')
    r = await nattida.get('/stores')
    expectError("other users' sessions ended too", r, 401, 'UNAUTHENTICATED')
    r = await anon.get('/auth/demo-users')
    expect('demo users recreated (6 active, test user gone)', r, 200, (j) => j.length === 6 && !j.some((u) => u.email.startsWith('e2e.')) && !j.some((u) => u.id === S.users.admin.id))
    const newAdmin = r.json?.find((u) => u.email === 'admin@flowtrade.local')
    r = await admin.post('/auth/demo-login', { userId: newAdmin?.id })
    must(r.status === 200, 'admin login after reset')
    r = await admin.get('/proposals?scope=all')
    expect('demo dataset restored (9 proposals)', r, 200, (j) => j.length === 9 && !j.some((p) => p.title.startsWith('E2E')))
    r = await admin.get('/stores?includeInactive=true')
    expect('demo stores restored', r, 200, (j) => j.length === 10 && !j.some((s) => s.name.startsWith('E2E')))
    r = await admin.post('/auth/logout')
  })
}

// =============================================================================================

let crashed = null
try {
  await main()
} catch (e) {
  crashed = e
  check('e2e run completed', false, e instanceof Abort ? e.message : (e?.stack ?? String(e)))
} finally {
  await stopServer()
}

const serverErrors = serverLog.filter((l) => /\bERROR\b|Exception|\[server exited code=[1-9]/.test(l))
if (serverErrors.length) {
  console.log('\n-- server errors (last 30 lines) --')
  for (const line of serverErrors.slice(-30)) console.log(`   ${line}`)
}
const total = passed + failures.length
console.log(`\n== SUMMARY: ${passed}/${total} checks passed, ${failures.length} failed`)
if (failures.length) {
  console.log('Failed checks:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(failures.length || crashed ? 1 : 0)
