import assert from 'node:assert/strict';
import test from 'node:test';
import * as googleSheetsService from './googleSheetsService.js';

const { createSheetWebhookPayload } = googleSheetsService;

test('adds a stable requestId without changing the sheet event payload', () => {
  const payload = createSheetWebhookPayload(
    { type: 'TRADE', symbol: 'BTC/USDT', timestamp: '2026-09-23T12:00:00.000Z' },
    'trade-close-42'
  );

  assert.deepEqual(payload, {
    type: 'TRADE',
    symbol: 'BTC/USDT',
    timestamp: '2026-09-23T12:00:00.000Z',
    requestId: 'trade-close-42'
  });
});

test('does not expose optional webhook signature support', () => {
  assert.equal('signSheetWebhookPayload' in googleSheetsService, false);
});
