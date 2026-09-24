import assert from 'node:assert/strict';
import test from 'node:test';
import * as auth from './authRoutes.js';
import * as database from '../database/db.js';

test('accepts an international E.164 WhatsApp number outside +55', () => {
  assert.equal(auth.isValidInternationalE164?.('+12025550123'), true);
});

test('rejects signup when password confirmation differs', () => {
  assert.equal(auth.hasMatchingPasswordConfirmation?.('senha-segura', 'outra-senha'), false);
});

test('keeps a pending customer from receiving a login token', () => {
  assert.equal(auth.canCustomerLogIn?.({ role: 'CLIENT', email_verified: 0 }), false);
});

test('bootstraps the Railway administrator as verified from environment values', async () => {
  const statements: unknown[][] = [];
  const result = await database.bootstrapAdministrator?.({ ADMIN_EMAIL: 'admin@railway.app', ADMIN_PASSWORD: 'correct horse battery staple', ADMIN_NAME: 'Railway Admin' }, {
    find: async () => undefined,
    execute: async (...args: unknown[]) => { statements.push(args); },
    hash: async () => 'bcrypt-hash'
  });
  assert.deepEqual(result, { created: true, email: 'admin@railway.app' });
  assert.equal(statements.length, 1);
  assert.match(String(statements[0][0]), /ON CONFLICT \(email\)/);
});

test('relaxes only the required legacy password column without changing user data', async () => {
  const statements: unknown[][] = [];
  await database.relaxLegacyPasswordColumnIfPresent?.(async (...args: unknown[]) => { statements.push(args); });
  assert.equal(statements.length, 1);
  assert.match(String(statements[0][0]), /ALTER COLUMN password DROP NOT NULL/);
  assert.doesNotMatch(String(statements[0][0]), /DROP COLUMN|DELETE|UPDATE app_users/i);
});

test('refuses client cleanup unless exactly one configured admin master exists', async () => {
  await assert.rejects(
    database.cleanupClientUsersForMaster?.({ ADMIN_EMAIL: 'master@example.com' }, {
      query: async () => [{ id: 'admin-1', email: 'other@example.com', role: 'ADMIN' }],
      execute: async () => { throw new Error('must not delete'); }
    }),
    /Admin Master/i
  );
});

test('reports a Resend error instead of treating mail delivery as successful', async () => {
  const service = await import('../services/resendService.js').catch(() => undefined);
  const result = service && await service.sendEmailPin({ to: 'client@example.com', pin: '123456', apiKey: 're_test', fromEmail: 'seguranca@uebamix.com.br', fetchImpl: async () => ({ ok: true, json: async () => ({ data: null, error: { message: 'sender rejected' } }) } as Response) });
  assert.deepEqual(result, { success: false, error: 'sender rejected' });
});
