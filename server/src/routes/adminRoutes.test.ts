import assert from 'node:assert/strict';
import test from 'node:test';
import { layaGovernanceService } from '../services/layaGovernanceService.js';
import type { LayaMode } from '../../../shared/layaGovernanceTypes.js';

// Handler simulado para validação das rotas administrativas de governança
function handleGetLayaStatus() {
  const mode = layaGovernanceService.getMode();
  const metrics = layaGovernanceService.getMetrics();
  return {
    status: 200,
    body: {
      mode,
      metrics: {
        latencyP50: metrics.p50LatencyMs,
        latencyP95: metrics.p95LatencyMs,
        sessionPardonsUsed: metrics.overridesUsedSession,
        maxSessionPardons: metrics.maxOverridesPerSession,
        totalDecisions: metrics.recentDecisions.length,
        counterfactualPnL: metrics.pnlAttributedOverrides
      },
      recentDecisions: metrics.recentDecisions
    }
  };
}

function handlePostLayaMode(body: any) {
  const { mode } = body || {};
  const validModes: LayaMode[] = ['OFF', 'SHADOW', 'ACTIVE'];
  if (!mode || !validModes.includes(mode)) {
    return {
      status: 400,
      body: { error: 'Modo inválido. Valores permitidos: OFF, SHADOW, ACTIVE' }
    };
  }
  layaGovernanceService.setMode(mode);
  return {
    status: 200,
    body: { success: true, mode: layaGovernanceService.getMode() }
  };
}

test('Admin Routes - GET /api/admin/laya/status retorna métricas e estado', () => {
  layaGovernanceService.setMode('SHADOW');
  const res = handleGetLayaStatus();

  assert.equal(res.status, 200);
  assert.equal(res.body.mode, 'SHADOW');
  assert.ok(typeof res.body.metrics.latencyP50 === 'number');
  assert.ok(typeof res.body.metrics.latencyP95 === 'number');
  assert.equal(res.body.metrics.maxSessionPardons, 3);
  assert.ok(Array.isArray(res.body.recentDecisions));
});

test('Admin Routes - POST /api/admin/laya/mode altera modo para ACTIVE ou SHADOW', () => {
  const resActive = handlePostLayaMode({ mode: 'ACTIVE' });
  assert.equal(resActive.status, 200);
  assert.equal(resActive.body.mode, 'ACTIVE');
  assert.equal(layaGovernanceService.getMode(), 'ACTIVE');

  const resShadow = handlePostLayaMode({ mode: 'SHADOW' });
  assert.equal(resShadow.status, 200);
  assert.equal(resShadow.body.mode, 'SHADOW');
  assert.equal(layaGovernanceService.getMode(), 'SHADOW');
});

test('Admin Routes - POST /api/admin/laya/mode rejeita modos inválidos com 400', () => {
  const resInvalid = handlePostLayaMode({ mode: 'INVALID_MODE' });
  assert.equal(resInvalid.status, 400);
  assert.equal(resInvalid.body.error, 'Modo inválido. Valores permitidos: OFF, SHADOW, ACTIVE');
});
