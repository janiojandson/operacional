/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO & NEXUS SHADOW — GOOGLE APPS SCRIPT OFICIAL v4.3 (100% JDBC)
 * ==============================================================================
 * 
 * ARQUITETURA PASSIVA (CUSTO COMPUTACIONAL ZERO NO SERVIDOR):
 * 1. Conexão direta ao PostgreSQL do Railway via JDBC nativo do Google Apps Script.
 * 2. Sem chamadas HTTP saindo do servidor (Laya e Motor operam em latência pura).
 * 3. Leitura e Upsert idêntico às tabelas ativas:
 *    - `paper_master_orders`: Histórico e ordens abertas com suporte a Saídas Parciais (+0.6R Wave Harvest).
 *    - `decision_events`: Auditoria de Governança Laya / Ayla (Sistema 1).
 * 4. Painel com distinção estrita entre:
 *    - OPERAÇÕES CONCLUÍDAS (WinRate, Profit Factor, Fees, Líquido)
 *    - POSIÇÕES ABERTAS (PnL Flutuante em tempo real)
 * ==============================================================================
 */

var SPREADSHEET_ID = '1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA';

// 🐘 CREDENCIAIS PÚBLICAS DO BANCO POSTGRESQL (RAILWAY)
// Caso o Railway recrie o banco ou altere a porta externa, atualize apenas estas 5 variáveis:
var PG_HOST = 'zephyr.proxy.rlwy.net';
var PG_PORT = 25561;
var PG_DB = 'railway';
var PG_USER = 'postgres';
var PG_PASS = PropertiesService.getScriptProperties().getProperty('PG_PASS') || 'SUA_NOVA_SENHA_AQUI';

// Custos Operacionais BingX / Bybit Linear VIP0
var TAKER_FEE_PCT = 0.00050; // 0.050% por perna
var MAKER_FEE_PCT = 0.00020; // 0.020% por perna
var AVG_SPREAD_BPS = 0.00020; // 2.0 Bps de spread médio
var MIN_NOTIONAL_USD = 2.00; // Mínimo BingX Swap ($2.00)

function getPostgresConnection() {
  var url = 'jdbc:postgresql://' + PG_HOST + ':' + PG_PORT + '/' + PG_DB;
  return Jdbc.getConnection(url, PG_USER, PG_PASS);
}

function getSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID.length > 10) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (err) {
    throw new Error('Não foi possível conectar à planilha. Abra o script direto dentro da sua planilha Google.');
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Menu Superior Oficial da Planilha
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 BingX & MarketFlow Pro')
    .addItem('⚡ Setup Inicial Completo (Todas as Abas)', 'setupInicial')
    .addItem('🔄 Atualizar Dashboard e Métricas', 'manualUpdateDashboard')
    .addSeparator()
    .addItem('🐘 Sincronizar Tudo do Banco PostgreSQL (Trades & Laya)', 'syncAllFromPostgres')
    .addItem('⏰ Ativar Auto-Sincronização (a cada 5 min)', 'setupAutoSyncTrigger')
    .addSeparator()
    .addItem('⚖️ Recalcular Comparativo (500 vs 10k)', 'recalcComparativo')
    .addItem('🧹 Limpar e Reiniciar Dados das Abas', 'limparDadosConfirmado')
    .addSeparator()
    .addItem('🤖 Zerar Histórico Ayla/Laya (Planilha)', 'zerarHistoricoAylaLocal')
    .addToUi();
}

function setupInicial() {
  var ss = getSpreadsheet();
  
  initSheetTrades(ss, true);
  SpreadsheetApp.flush();
  
  initSheetShadow(ss, true);
  SpreadsheetApp.flush();

  initSheetAylaGovernance(ss, true);
  SpreadsheetApp.flush();
  
  initSheetComparativo(ss, true);
  SpreadsheetApp.flush();
  
  initMasterMirrorSheet(ss);
  SpreadsheetApp.flush();
  
  updateDashboard(ss);
  SpreadsheetApp.flush();
  
  try {
    SpreadsheetApp.getUi().alert('✅ Painel BingX Pro v4.3 e todas as abas estruturadas com sucesso!');
  } catch (e) {
    Logger.log('Setup concluído.');
  }
}

function manualUpdateDashboard() {
  var ss = getSpreadsheet();
  updateDashboard(ss);
  SpreadsheetApp.flush();
  try {
    SpreadsheetApp.getUi().alert('Painel BingX Pro atualizado com sucesso!');
  } catch (e) {}
}

function limparDadosConfirmado() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('Confirmação', 'Deseja realmente limpar todos os trades e histórico das abas?', ui.ButtonSet.YES_NO);
  if (res === ui.Button.YES) {
    resetAllSheets(getSpreadsheet());
    updateDashboard(getSpreadsheet());
    ui.alert('Dados limpos com sucesso.');
  }
}

function resetAllSheets(ss) {
  var s1 = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (s1) s1.clear();
  initSheetTrades(ss, true);

  var s2 = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  if (s2) s2.clear();
  initSheetShadow(ss, true);

  var s3 = ss.getSheetByName('⚖️ COMPARATIVO BANCAS');
  if (s3) s3.clear();
  initSheetComparativo(ss, true);

  var s4 = ss.getSheetByName('COMPARATIVO ESPELHO MASTER');
  if (s4) s4.clear();
  initMasterMirrorSheet(ss);

  var s5 = ss.getSheetByName('🧠 AUDITORIA AYLA (DECISÕES)');
  if (s5) s5.clear();
  initSheetAylaGovernance(ss, true);
}

function zerarHistoricoAylaLocal() {
  var ss = getSpreadsheet();
  var s = ss.getSheetByName('🧠 AUDITORIA AYLA (DECISÕES)');
  if (s) s.clear();
  initSheetAylaGovernance(ss, true);
  try {
    SpreadsheetApp.getUi().alert('✅ Histórico da Ayla zerado na planilha com sucesso.');
  } catch (e) {}
}

/**
 * ABA 1: TRADES EXECUTADOS (Com Suporte Integral a Wave Harvest / Saídas Parciais)
 */
function initSheetTrades(ss, forceRefresh) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var headers = [
    'Data / Hora', 'Conta / Origem', 'Par BingX', 'Direção', 'Tipo Ordem',
    'Preço Entrada ($)', 'Preço Atual/Saída ($)', 'Volume (Qty)', 'Stop Loss ($)', 'Take Profit ($)',
    'Trailing Stop', 'Status', 'Resultado', 'Lucro Bruto ($)', 'Taxas ($)',
    'Lucro Líquido Real ($)', 'Fee Drag (%)', 'Parcial Colhida?', 'Lucro Parcial ($)',
    'PnL Líquido Consolidado ($)', 'Retorno Bruto (%)', 'R-Múltiplo', 'Detalhes / Auditoria',
    'Trade ID', 'Evento', 'Notional Master ($)', 'Exposição Master (%)',
    'Margem Master ($)', 'Potência', 'Alavancagem', 'Lote Mínimo',
    'Shadow Filter', 'Risco por Trade ($)'
  ];

  if (sheet.getLastRow() === 0 || forceRefresh) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logTrade(ss, data) {
  var sheet = initSheetTrades(ss, false);
  var formattedDate = data.timestamp || Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var entryPrice = Number(data.entryPrice || 0);
  var currentPrice = Number(data.currentPrice || entryPrice);
  var qty = Number(data.qty || 0);
  var notional = Number(data.masterNotionalUsd || (entryPrice * qty));
  var pnlGross = Number(data.pnlUsd || 0);

  var feeVal = Number(data.feePaid || 0);
  var netPnl = data.netPnl !== undefined ? Number(data.netPnl) : (pnlGross - feeVal);

  var isPartial = Boolean(data.partialTaken || (data.partialPnlUsd && Number(data.partialPnlUsd) > 0));
  var partialProfit = Number(data.partialPnlUsd || 0);
  var totalNet = data.totalNetPnl !== undefined ? Number(data.totalNetPnl) : (netPnl + partialProfit);

  var feeDrag = (pnlGross > 0) ? (feeVal / pnlGross) : (pnlGross < 0 ? (feeVal / Math.abs(pnlGross)) : 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var rMultipleVal = Number(data.rMultiple || 0);

  var isTrailing = String(data.trailingStopAtivo || 'SIM').toUpperCase() === 'SIM';
  var statusStr = String(data.status || 'OPEN').toUpperCase();
  var isClose = statusStr !== 'OPEN';

  var outcome = data.outcome || (
    isClose ? (
      isPartial && totalNet > 0 ? '🌊 PARCIAL TP' :
      (totalNet > 0 ? 'WIN 🎯' : (totalNet < 0 ? 'LOSS 🛑' : 'BREAKEVEN ⚖️'))
    ) : 'EM ANDAMENTO ⏳'
  );

  var row = [
    formattedDate,
    data.clientName || 'Master (BingX Swap)',
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    data.orderType || 'MARKET',
    entryPrice,
    currentPrice,
    qty,
    Number(data.stopLoss || 0),
    Number(data.takeProfit || 0),
    isTrailing ? 'ATIVO' : 'DESATIVADO',
    statusStr,
    outcome,
    pnlGross,
    feeVal,
    netPnl,
    feeDrag,
    isPartial ? 'SIM 🌊' : 'NÃO',
    partialProfit,
    totalNet,
    pnlPctVal,
    rMultipleVal,
    data.errorMsg || 'OK',
    data.tradeId || '',
    isClose ? 'CLOSE' : 'OPEN',
    notional,
    Number(data.masterExposureRatio || 0.1),
    Number(data.masterMarginUsd || (notional / 10)),
    Number(data.powerMultiplier || 1.5),
    Number(data.leverage || 10),
    Number(data.exchangeMinQty || 0.001),
    data.shadowFilterActive ? 'ATIVO' : 'INATIVO',
    Number(data.riskUsd || 0)
  ];

  // Idempotência por Trade ID (atualiza linha existente se já foi gravada como OPEN)
  var tradeId = String(data.tradeId || '');
  var existingRow = -1;
  if (tradeId && sheet.getLastRow() > 1) {
    var idCol = 24; // Coluna X: Trade ID
    var ids = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues();
    for (var r = ids.length - 1; r >= 0; r--) {
      if (String(ids[r][0]) === tradeId) {
        existingRow = r + 2;
        break;
      }
    }
  }

  var targetRow = existingRow > 0 ? existingRow : (sheet.getLastRow() + 1);
  if (existingRow > 0) {
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  // Estilos visuais
  var sideCell = sheet.getRange(targetRow, 4);
  if (String(data.side).toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  var outCell = sheet.getRange(targetRow, 13);
  if (outcome.indexOf('WIN') !== -1 || outcome.indexOf('GREEN') !== -1) {
    outCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outcome.indexOf('PARCIAL') !== -1) {
    outCell.setBackground('#cffafe').setFontColor('#0e7490').setFontWeight('bold');
  } else if (outcome.indexOf('LOSS') !== -1 || outcome.indexOf('RED') !== -1) {
    outCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outCell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
  }

  var totalNetCell = sheet.getRange(targetRow, 20);
  if (totalNet > 0) {
    totalNetCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (totalNet < 0) {
    totalNetCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  sheet.getRange(targetRow, 6, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 8).setNumberFormat('0.0000');
  sheet.getRange(targetRow, 9, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 14, 1, 3).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(targetRow, 17).setNumberFormat('0.0%');
  sheet.getRange(targetRow, 19, 1, 2).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(targetRow, 21).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(targetRow, 22).setNumberFormat('+0.0"R";-0.0"R";0.0"R"');
  sheet.getRange(targetRow, 26).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 27).setNumberFormat('0.00%');
  sheet.getRange(targetRow, 28).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 33).setNumberFormat('$#,##0.00');
}

/**
 * ABA 2: AUDITORIA SHADOW MODE
 */
function initSheetShadow(ss, forceRefresh) {
  var name = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var headers = [
    'Data / Hora', 'Par BingX', 'Direção', 'Modo Anterior', 'Decisão Shadow',
    'Motivos da Filtragem', 'Spread L2 (bps)', 'Exposição R ($)', 'Resultado Teórico',
    'Retorno (%)', 'Capital Salvo ($)', 'PnL Teórico ($)', 'R-Múltiplo Teórico',
    'Veredito de Proteção', 'Modo Atual', 'Fonte de Dados', 'Aprovado?', 'Signal ID'
  ];

  if (sheet.getLastRow() === 0 || forceRefresh) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#1e1b4b', '#a855f7');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * ABA 3: COMPARATIVO DINÂMICO DE BANCAS ($500 vs $10,000)
 */
function initSheetComparativo(ss, forceRefresh) {
  var name = '⚖️ COMPARATIVO BANCAS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || forceRefresh) {
    sheet.clearContents();
    
    var headers = [
      'Data / Hora', 'Par BingX', 'Retorno Trade (%)', 'B500 Ordem ($)', 'B500 Bruto ($)',
      'B500 Taxas ($)', 'B500 Líquido ($)', 'B500 Fee Drag (%)', 'B10k Ordem ($)',
      'B10k Bruto ($)', 'B10k Taxas ($)', 'B10k Líquido ($)', 'B10k Fee Drag (%)',
      'Veredito de Viabilidade (B500)'
    ];

    sheet.getRange('A1:N1').setValues([[
      'PAINEL DE VIABILIDADE: BANCA $500 (MICRO) vs BANCA $10,000 (INSTITUCIONAL) — BINGX SWAP',
      '', '', '', '', '', '', '', '', '', '', '', '', ''
    ]]);
    try { sheet.getRange('A1:N1').merge(); } catch(e) {}

    sheet.getRange('A1:N1')
      .setBackground('#0f172a').setFontColor('#38bdf8').setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 35);

    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, '#1e293b', '#f8fafc');
    sheet.setRowHeight(2, 28);
    sheet.setFrozenRows(2);
  }
  return sheet;
}

function initMasterMirrorSheet(ss) {
  var name = 'COMPARATIVO ESPELHO MASTER';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Data / Hora', 'Trade ID', 'Par BingX', 'Status Master', 'Potencia', 'Exposição Master (%)', 'Retorno Trade (%)', 'Capital Mínimo ($)',
      'B500 Antes ($)', 'B500 Status', 'B500 Notional ($)', 'B500 Margem ($)', 'B500 Taxas ($)', 'B500 Líquido ($)', 'B500 Depois ($)',
      'B10k Antes ($)', 'B10k Status', 'B10k Notional ($)', 'B10k Margem ($)', 'B10k Taxas ($)', 'B10k Líquido ($)', 'B10k Depois ($)',
      'Trailing', 'Shadow Filter', 'Motivo'
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function recalcComparativo() {
  var ss = getSpreadsheet();
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (!tradesSheet || tradesSheet.getLastRow() <= 1) {
    try { SpreadsheetApp.getUi().alert('Não há trades executados para recalcular.'); } catch(e) {}
    return;
  }
  updateDashboard(ss);
  try { SpreadsheetApp.getUi().alert('Comparativo e Dashboard recalculados com sucesso!'); } catch(e) {}
}

/**
 * ABA 5: DECISÕES E AUDITORIA DA AYLA / LAYA (SISTEMA 1)
 */
function initSheetAylaGovernance(ss, forceRefresh) {
  var name = '🧠 AUDITORIA AYLA (DECISÕES)';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var headers = [
    'Data / Hora', 'Decision ID', 'Ação Laya', 'Executado?', 'Latência (ms)',
    'Par', 'Direção', 'Rejeição / Veto', 'Multiplicador Potência', 'Risco (%)',
    'Stop Loss (%)', 'Direção Stop', 'Scale-In Permitido?', 'Código Racional',
    'Desequilíbrio Livro (Ratio)', 'Delta CVD 60s', 'Divergência Beta?'
  ];

  if (sheet.getLastRow() === 0 || forceRefresh) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#312e81', '#818cf8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * ==============================================================================
 * 🐘 MÓDULO POSTGRESQL NATIVO (JDBC) — 100% PASSIVO
 * ==============================================================================
 */
function syncAllFromPostgres() {
  var ss = getSpreadsheet();
  var conn;
  try {
    conn = getPostgresConnection();
    syncTradesFromPostgres(ss, conn);
    syncAylaDecisionsFromPostgres(ss, conn);
    updateDashboard(ss);

    try {
      SpreadsheetApp.getUi().alert('✅ Sincronização concluída com sucesso direto do PostgreSQL!');
    } catch(e) {
      Logger.log('Sincronização concluída via trigger.');
    }
  } catch(err) {
    Logger.log('Erro ao sincronizar com Postgres: ' + err);
    try {
      SpreadsheetApp.getUi().alert('❌ Erro na sincronização: ' + err.message);
    } catch(e) {}
  } finally {
    if (conn) conn.close();
  }
}

/**
 * Lê diretamente da tabela ATIVA do robô: `paper_master_orders`
 * Inclui saídas parciais e cálculo consolidado líquido
 */
function syncTradesFromPostgres(ss, conn) {
  var stmt = conn.createStatement();
  stmt.setMaxRows(300);
  
  // Consulta a tabela ativa do motor com as novas colunas
  var rs = stmt.executeQuery(
    "SELECT id, symbol, type AS side, entry_price, current_price, qty, notional_usd, fee, net_pnl, " +
    "pnl_usd, pnl_pct, r_multiple, status, signal_reason, entry_time, close_time, trailing_active, " +
    "partial_taken, partial_pnl_usd, total_net_pnl, stop_loss, take_profit, power_multiplier " +
    "FROM paper_master_orders ORDER BY entry_time DESC LIMIT 300"
  );

  while (rs.next()) {
    var id = rs.getString('id');
    var symbol = rs.getString('symbol');
    var side = rs.getString('side');
    var entryPrice = rs.getDouble('entry_price');
    var currentPrice = rs.getDouble('current_price');
    var qty = rs.getDouble('qty');
    var notional = rs.getDouble('notional_usd');
    var fee = rs.getDouble('fee');
    var netPnl = rs.getDouble('net_pnl');
    var pnlUsd = rs.getDouble('pnl_usd');
    var pnlPct = rs.getDouble('pnl_pct');
    var rMultiple = rs.getDouble('r_multiple');
    var status = rs.getString('status');
    var reason = rs.getString('signal_reason');
    var entryTime = rs.getLong('entry_time');
    var trailingActive = rs.getInt('trailing_active') === 1;
    var partialTaken = rs.getInt('partial_taken') === 1;
    var partialPnlUsd = rs.getDouble('partial_pnl_usd');
    var totalNetPnl = rs.getDouble('total_net_pnl');
    var stopLoss = rs.getDouble('stop_loss');
    var takeProfit = rs.getDouble('take_profit');
    var powerMultiplier = rs.getDouble('power_multiplier');

    var dateFormatted = Utilities.formatDate(new Date(entryTime), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    var tradeData = {
      timestamp: dateFormatted,
      clientName: '👑 Master (Postgres Live)',
      symbol: symbol,
      side: side,
      orderType: 'MARKET',
      entryPrice: entryPrice,
      currentPrice: currentPrice,
      qty: qty,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      trailingStopAtivo: trailingActive ? 'SIM' : 'NÃO',
      status: status,
      pnlUsd: pnlUsd,
      pnlPct: pnlPct,
      rMultiple: rMultiple,
      feePaid: fee,
      netPnl: netPnl,
      partialTaken: partialTaken,
      partialPnlUsd: partialPnlUsd,
      totalNetPnl: (totalNetPnl !== 0 ? totalNetPnl : (netPnl + partialPnlUsd)),
      tradeId: id,
      masterNotionalUsd: notional,
      masterExposureRatio: 0.1,
      masterMarginUsd: notional / 10,
      powerMultiplier: powerMultiplier || 1.5,
      leverage: 10,
      exchangeMinQty: 0.001,
      shadowFilterActive: true,
      errorMsg: reason || 'PostgreSQL Live Sync'
    };

    logTrade(ss, tradeData);
  }

  rs.close();
  stmt.close();
}

/**
 * Lê histórico de decisões da Ayla / Laya (decision_events)
 */
function syncAylaDecisionsFromPostgres(ss, conn) {
  var stmt = conn.createStatement();
  stmt.setMaxRows(200);
  
  var rs;
  try {
    rs = stmt.executeQuery(
      "SELECT decision_id, action, executed, latency_ms, symbol, direction, rejection_reason, " +
      "power_multiplier, risk_pct, stop_loss_pct, stop_direction, scale_in_allowed, rationale_code, " +
      "imbalance_ratio, cvd_delta_60s, beta_divergence, issued_at " +
      "FROM decision_events ORDER BY issued_at DESC LIMIT 200"
    );
  } catch(e) {
    // Caso a tabela ainda não exista na instância, finaliza graciosamente
    stmt.close();
    return;
  }

  var sheet = initSheetAylaGovernance(ss, true);
  var rows = [];

  while (rs.next()) {
    var issuedAtTs = rs.getTimestamp('issued_at');
    var dateFormatted = issuedAtTs ? Utilities.formatDate(new Date(issuedAtTs.getTime()), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss") : '';

    var action = rs.getString('action');
    var executed = rs.getBoolean('executed');
    var rejection = rs.getString('rejection_reason') || '';

    rows.push([
      dateFormatted,
      rs.getString('decision_id'),
      action,
      executed ? 'SIM ✅' : 'NÃO ⛔',
      rs.getDouble('latency_ms'),
      rs.getString('symbol'),
      rs.getString('direction') || '',
      rejection,
      rs.getDouble('power_multiplier'),
      (rs.getDouble('risk_pct') || 0) / 100,
      (rs.getDouble('stop_loss_pct') || 0) / 100,
      rs.getString('stop_direction') || '',
      rs.getBoolean('scale_in_allowed') ? 'SIM' : 'NÃO',
      rs.getString('rationale_code'),
      rs.getDouble('imbalance_ratio'),
      rs.getDouble('cvd_delta_60s'),
      rs.getBoolean('beta_divergence') ? 'SIM' : 'NÃO'
    ]);
  }

  rs.close();
  stmt.close();

  if (rows.length > 0) {
    var targetRange = sheet.getRange(2, 1, rows.length, rows[0].length);
    targetRange.setValues(rows);

    sheet.getRange(2, 5, rows.length, 1).setNumberFormat('0"ms"');
    sheet.getRange(2, 10, rows.length, 2).setNumberFormat('0.00%');
    sheet.getRange(2, 15, rows.length, 2).setNumberFormat('#,##0.00');

    for (var r = 0; r < rows.length; r++) {
      var cell = sheet.getRange(r + 2, 3);
      var act = String(rows[r][2]).toUpperCase();
      if (act === 'AUTHORIZE') {
        cell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
      } else if (act === 'VETO') {
        cell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
      } else {
        cell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
      }
    }
  }
}

/**
 * Acionador Automático Passivo (Trigger a cada 5 minutos)
 */
function setupAutoSyncTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncAllFromPostgres') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('syncAllFromPostgres')
    .timeBased()
    .everyMinutes(5)
    .create();

  try {
    SpreadsheetApp.getUi().alert('⏰ Auto-sincronização ativada! A planilha buscará atualizações do banco a cada 5 minutos sem onerar o servidor.');
  } catch(e) {
    Logger.log('Trigger configurado.');
  }
}

/**
 * ABA 4: DASHBOARD & PAINEL VISUAL EXECUTIVO
 */
function updateDashboard(ss) {
  var name = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, 0);
  } else {
    try {
      sheet.getRange(1, 1, 40, 20).breakApart();
      sheet.clearContents();
      sheet.clearFormats();
    } catch(e) {}
  }

  sheet.setTabColor('#0284c7');

  sheet.getRange('A1:F1').setValues([[
    'MARKETFLOW PRO & NEXUS SHADOW — BINGX SWAP COMMAND CENTER', '', '', '', '', ''
  ]]);
  try { sheet.getRange('A1:F1').merge(); } catch(e) {}

  sheet.getRange('A1:F1')
    .setFontSize(13).setFontWeight('bold').setBackground('#0f172a').setFontColor('#38bdf8')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  var now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange('A2:F2').setValues([[
    'Status: 🟢 24/7 ONLINE | Conexão Oficial: PostgreSQL JDBC Passivo | Sincronizado: ' + now, '', '', '', '', ''
  ]]);
  try { sheet.getRange('A2:F2').merge(); } catch(e) {}

  sheet.getRange('A2:F2')
    .setFontSize(9).setBackground('#1e293b').setFontColor('#94a3b8')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(2, 24);

  // Leitura de Trades
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  var totalRows = tradesSheet ? Math.max(0, tradesSheet.getLastRow() - 1) : 0;

  var closedTradesCount = 0;
  var openTradesCount = 0;
  var greenCount = 0;
  var redCount = 0;
  var breakEvenCount = 0;

  var totalGrossPnl = 0;
  var totalGrossWin = 0;
  var totalGrossLoss = 0;
  var totalFees = 0;
  var totalNetPnl = 0;
  var floatingPnl = 0;

  if (tradesSheet && totalRows > 0) {
    var maxCols = Math.max(25, tradesSheet.getLastColumn());
    var tRows = tradesSheet.getRange(2, 1, totalRows, maxCols).getValues();

    for (var i = 0; i < tRows.length; i++) {
      var rowStatus = String(tRows[i][11] || '').toUpperCase(); // Coluna L: Status
      var rowOutcome = String(tRows[i][12] || '').toUpperCase(); // Coluna M: Resultado
      var eventKind = String(tRows[i][24] || '').toUpperCase();  // Coluna Y: Evento

      var isOpen = eventKind === 'OPEN' || rowStatus === 'OPEN' || rowOutcome.indexOf('EM ANDAMENTO') !== -1;

      var gross = Number(tRows[i][13] || 0);
      var fee = Number(tRows[i][14] || 0);
      // Coluna T (index 19) = PnL Líquido Consolidado (com parciais)
      var totalNet = (tRows[i].length >= 20 && tRows[i][19] !== '' && !isNaN(Number(tRows[i][19])))
        ? Number(tRows[i][19])
        : Number(tRows[i][15] || (gross - fee));

      if (isOpen) {
        openTradesCount++;
        floatingPnl += gross;
      } else {
        closedTradesCount++;
        if (totalNet > 0) {
          greenCount++;
          totalGrossWin += (gross > 0 ? gross : totalNet);
        } else if (totalNet < 0) {
          redCount++;
          totalGrossLoss += Math.abs(gross > 0 ? totalNet : gross);
        } else {
          breakEvenCount++;
        }

        totalGrossPnl += gross;
        totalFees += fee;
        totalNetPnl += totalNet;
      }
    }
  }

  var winRate = closedTradesCount > 0 ? (greenCount / closedTradesCount) * 100 : 0;
  var profitFactor = totalGrossLoss > 0 ? (totalGrossWin / totalGrossLoss) : (totalGrossWin > 0 ? 99.9 : 0.0);
  var globalFeeDrag = (totalGrossPnl > 0) ? (totalFees / totalGrossPnl) * 100 : 0;

  // ── LINHA 1 DE CARDS ──
  sheet.getRange('A4:B4').merge().setValue('OPERAÇÕES CONCLUÍDAS').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A5:B5').merge().setValue(closedTradesCount).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('POSIÇÕES ABERTAS (AO VIVO)').setFontWeight('bold').setBackground('#e0f2fe').setFontColor('#0369a1').setHorizontalAlignment('center');
  sheet.getRange('C5:D5').merge().setValue(openTradesCount + (openTradesCount > 0 ? ' (Ativa)' : ' (Neutro)')).setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(openTradesCount > 0 ? '#0284c7' : '#64748b');

  sheet.getRange('E4:F4').merge().setValue('TAXA ACERTO REAL (WIN RATE)').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('E5:F5').merge().setValue(winRate.toFixed(1) + '% (W: ' + greenCount + ' | L: ' + redCount + ')').setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(winRate >= 50 ? '#15803d' : (closedTradesCount > 0 ? '#b91c1c' : '#64748b'));

  sheet.setRowHeight(4, 24);
  sheet.setRowHeight(5, 36);

  // ── LINHA 2 DE CARDS ──
  sheet.getRange('A7:B7').merge().setValue('PROFIT FACTOR (LUCRO/PERDA)').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A8:B8').merge().setValue(profitFactor >= 99 ? 'MAX' : profitFactor.toFixed(2)).setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(profitFactor >= 1.5 ? '#15803d' : (profitFactor >= 1.0 ? '#b45309' : '#b91c1c'));

  sheet.getRange('C7:D7').merge().setValue('TAXAS CONSUMIDAS BINGX ($)').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('C8:D8').merge().setValue(totalFees).setFontSize(18).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00');

  sheet.getRange('E7:F7').merge().setValue('FEE DRAG BINGX (%)').setFontWeight('bold').setBackground('#fef3c7').setFontColor('#b45309').setHorizontalAlignment('center');
  sheet.getRange('E8:F8').merge().setValue(globalFeeDrag.toFixed(1) + '%').setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(globalFeeDrag <= 15 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(7, 24);
  sheet.setRowHeight(8, 36);

  // ── LINHA 3 DE CARDS ──
  sheet.getRange('A10:B10').merge().setValue('LUCRO BRUTO AUDITADO ($)').setFontWeight('bold').setBackground('#e2e8f0').setHorizontalAlignment('center');
  sheet.getRange('A11:B11').merge().setValue(totalGrossPnl).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');

  sheet.getRange('C10:D10').merge().setValue('P&L FLUTUANTE ATUAL ($)').setFontWeight('bold').setBackground('#f8fafc').setHorizontalAlignment('center');
  sheet.getRange('C11:D11').merge().setValue(floatingPnl).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"')
    .setFontColor(floatingPnl >= 0 ? '#15803d' : '#b91c1c');

  sheet.getRange('E10:F10').merge().setValue('LUCRO LÍQUIDO REAL FECHADO ($)').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  sheet.getRange('E11:F11').merge().setValue(totalNetPnl).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"')
    .setFontColor(totalNetPnl >= 0 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(10, 24);
  sheet.setRowHeight(11, 36);

  sheet.autoResizeColumns(1, 6);
}

function formatHeaderRow(sheet, bgHex, fontHex) {
  var header = sheet.getRange(sheet.getFrozenRows() > 0 ? sheet.getFrozenRows() : 1, 1, 1, sheet.getLastColumn());
  header.setBackground(bgHex || '#0f172a');
  header.setFontColor(fontHex || '#ffffff');
  header.setFontWeight('bold');
  header.setFontSize(10);
  header.setHorizontalAlignment('center');
  header.setVerticalAlignment('middle');
}
