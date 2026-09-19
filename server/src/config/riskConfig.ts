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
  
  // Caminho do log de auditoria
  LOG_FILE_PATH: 'audit_shadow_mode.log'
};
