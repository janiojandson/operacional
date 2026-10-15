// ======================================================
// 📁 server/src/config/riskConfig.ts — MARKETFLOW PRO (V.TOP 2.1)
// Configuração de Feature Flags e Parâmetros de Risco / Shadow Mode
// ======================================================

export const RISK_CONFIG = {
  // PRODUÇÃO: Mantém execução real intocada (sem bloqueios reais)
  FEATURE_ANTI_CORRELATION: false,
  FEATURE_DYNAMIC_SPREAD: false,

  // AUDITORIA: Ativa o teste visual e log em segundo plano (Modo Fantasma)
  SHADOW_MODE_AUDIT: true,

  // Parâmetros do teste quantitativo Cripto Bybit Perpetuals
  MAX_SPREAD_BPS: 5.0,     // 5.0 basis points (0.050%) teto máximo de spread seguro na Bybit Linear
  MAX_SPREAD_PIPS: 5.0,    // Retrocompatibilidade
  MAX_USD_EXPOSURE: 3.0,   // 3.0R (permite até 3 operações simultâneas na mesma ponta na cesta de 5 pares)

  // ─── MODO LABORATÓRIO (exploração ampla; reversível) ───
  // Todos os tipos de sinal habilitados (BUY e SELL) para coletar dados de exploração.
  ALLOWED_SIGNAL_TYPES: ['ABSORPTION_BUY', 'ABSORPTION_SELL', 'BOOK_IMBALANCE', 'WHALE_AGGRESSION'],

  // Potência liberada até 5x, sem trava de cold-start, concorrência sem limite.
  // ⚠️ Os circuit-breakers determinísticos (lockout −3R/dia e safe-halt 15% DD) PERMANECEM ativos como rede de segurança.
  MAX_POWER_MULTIPLIER: 5.0,
  MIN_TRADES_FOR_HIGH_POWER: 0,
  MAX_SAME_SIDE_POSITIONS: 999,

  // ─── IA Controladora de Postura (reversível; kill-switch = AI_POSTURE_ENABLED:false) ───
  AI_POSTURE_ENABLED: true,
  AI_POSTURE_INTERVAL_MS: 10 * 60 * 1000, // 10 min entre consultas autônomas
  AI_POSTURE_TIMEOUT_MS: 45000,           // timeout por chamada ao omniroute
  AI_POSTURE_MODEL: 'auto/best-fast',
  AI_POSTURE_MAX_POWER: 5.0,              // piso/teto de potência que a IA pode ajustar
  AI_POSTURE_MIN_POWER: 1.5,

  // Caminho do log de auditoria
  LOG_FILE_PATH: 'audit_shadow_mode.log'
};
