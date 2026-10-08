import assert from 'node:assert/strict'
import { bootstrap } from '../dist/seed/bootstrap.js'

function fixture(admins = 0) {
  const shelves = []
  let createdUsers = 0
  return {
    shelves,
    get createdUsers() { return createdUsers },
    prisma: {
      shelfType: {
        findFirst: async ({ where }) => shelves.find(s => s.name === where.name.equals) ?? null,
        create: async ({ data }) => { shelves.push(data); return data },
      },
      user: { count: async () => admins, create: async () => { createdUsers++; throw new Error('Unexpected account creation') } },
    },
  }
}

const pending = fixture()
assert.equal((await bootstrap(pending.prisma, {}, { shelvesOnly: true })).adminPending, true)
assert.equal(pending.shelves.length, 2)
assert.equal(pending.createdUsers, 0)
await bootstrap(pending.prisma, {}, { shelvesOnly: true })
assert.equal(pending.shelves.length, 2)

const strict = fixture()
await assert.rejects(bootstrap(strict.prisma, {}), /set ADMIN_EMAIL/)
assert.equal(strict.createdUsers, 0)

const existing = fixture(1)
assert.equal((await bootstrap(existing.prisma, {}, { shelvesOnly: true })).adminPending, false)
assert.equal(existing.createdUsers, 0)
console.log('Bootstrap: explicit pending mode, idempotence, strict mode and existing Admin passed')
