import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { sendEmail } from '../utils/email.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY })

test('sendEmail posts to Resend when a Resend key is present', async () => {
  process.env.RESEND_API_KEY = 're_testkey'
  let captured = null
  globalThis.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 200, json: async () => ({ id: 'e1' }), text: async () => 'ok' } }

  await sendEmail({ to: 'a@x.com', subject: 'Hi', html: '<p>yo</p>' })

  assert.match(captured.url, /api\.resend\.com\/emails/)
  assert.match(captured.opts.headers.Authorization, /Bearer re_testkey/)
  const body = JSON.parse(captured.opts.body)
  assert.equal(body.to, 'a@x.com')
  assert.equal(body.subject, 'Hi')
  assert.ok(body.from.includes('<'), 'from is "Name <email>" format')
})

test('sendEmail throws when Resend returns a non-2xx', async () => {
  process.env.RESEND_API_KEY = 're_testkey'
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => 'bad from' })
  await assert.rejects(() => sendEmail({ to: 'a@x.com', subject: 'Hi', html: '<p>x</p>' }), /Resend|422/)
})

test('sendEmail no-ops (no throw) when nothing is configured', async () => {
  delete process.env.RESEND_API_KEY
  // No SMTP host in test env → should log-skip, not throw
  await sendEmail({ to: 'a@x.com', subject: 'Hi', html: '<p>x</p>' })
})
