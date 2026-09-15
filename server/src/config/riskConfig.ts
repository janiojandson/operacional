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

  // Parâmetros do teste quantitativo
  MAX_SPREAD_PIPS: 1.5,
  MAX_USD_EXPOSURE: 2.0, // 2.0R (ou 2.0% de risco agregado em USD)
  
  // Caminho do log de auditoria
  LOG_FILE_PATH: 'audit_shadow_mode.log'
};
