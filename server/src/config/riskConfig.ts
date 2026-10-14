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

  // Kill-switch de sinais (reversível): mantém apenas o subconjunto com edge observado.
  // ABSORPTION_BUY = vencedor (+0,62R/trade); WHALE_AGGRESSION = raro/neutro.
  // BOOK_IMBALANCE e ABSORPTION_SELL ficaram 0/5 nos dados (desligados).
  ALLOWED_SIGNAL_TYPES: ['ABSORPTION_BUY', 'WHALE_AGGRESSION'],

  // ─── Controle de potência e concentração (reversível) ───
  MAX_POWER_MULTIPLIER: 3.0,      // teto no notional = SUPERNOVA_POWER (3x); 4x/5x historicamente perdedores
  MIN_TRADES_FOR_HIGH_POWER: 3,   // cold-start: par com <3 trades fechados fica em 1.5x (Base Quant)
  MAX_SAME_SIDE_POSITIONS: 2,     // máx. 2 posições simultâneas no mesmo lado (BUY/SELL)

  // Caminho do log de auditoria
  LOG_FILE_PATH: 'audit_shadow_mode.log'
};
