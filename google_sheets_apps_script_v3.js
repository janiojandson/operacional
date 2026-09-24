/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO & NEXUS SHADOW — GOOGLE APPS SCRIPT OFICIAL v3.1
 * ==============================================================================
 * 
 * PLANILHA CONECTADA:
 * ID: 1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA
 * Link: https://docs.google.com/spreadsheets/d/1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA/edit
 * 
 * SNAPSHOT LOCAL (fonte de verdade: script vinculado na planilha Google).
 * Sincronizado em 2026-09-22 a partir da versão live v3.1 (USD ONLY).
 * 
 * INOVAÇÕES v3.1:
 * 1. 100% USD — sem conversão BRL em payloads ou comparativo
 * 2. Comparativo Dinâmico de Bancas: $500 (Micro) vs $10,000 (Institucional)
 * 3. Cálculo Exato de Fee Drag (Taxas Bybit Maker/Taker + Spread + Slippage)
 * 4. Auditoria de Viabilidade Real: Alerta se taxas consomem > 20% do lucro
 * 5. Validador de Min Notional (Mínimo de $5.00 USD da exchange)
 * 6. Dashboard com KPIs de Lucro Líquido Real vs Teórico Shadow
 * ==============================================================================
 */

var SPREADSHEET_ID = '1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA';

// Parâmetros de Custo de Mercado (Bybit VIP0 Linear Perpetuals)
var TAKER_FEE_PCT = 0.00055; // 0.055% por perna (0.11% round-trip)
var MAKER_FEE_PCT = 0.00020; // 0.020% por perna (0.04% round-trip)
var AVG_SPREAD_BPS = 0.00020; // 2.0 Bps de spread médio L2
var MIN_NOTIONAL_USD = 5.00; // Valor mínimo de ordem Bybit (USD)

function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
    throw new Error('Erro ao acessar a planilha ID: ' + SPREADSHEET_ID);
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 Nexus & MarketFlow')
    .addItem('⚡ Setup Inicial Completo (Todas as Abas)', 'setupInicial')
    .addItem('🔄 Atualizar Dashboard e Métricas', 'manualUpdateDashboard')
    .addSeparator()
    .addItem('⚖️ Recalcular Comparativo (500 vs 10k)', 'recalcComparativo')
    .addToUi();
}

function setupInicial() {
  var ss = getSpreadsheet();
  initSheetTrades(ss, true);
  initSheetShadow(ss, true);
  initSheetComparativo(ss, true);
  updateDashboard(ss);
  Logger.log('✅ Todas as 4 abas estruturadas com sucesso.');
}

function manualUpdateDashboard() {
  var ss = getSpreadsheet();
  updateDashboard(ss);
  SpreadsheetApp.getUi().alert('Painel atualizado com sucesso!');
}

function scheduleDashboardRefresh(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MARKETFLOW_DASHBOARD_REFRESH_PENDING') === 'true') return;
  props.setProperty('MARKETFLOW_DASHBOARD_REFRESH_PENDING', 'true');
  ScriptApp.newTrigger('refreshDashboardFromTrigger')
    .timeBased()
    .after(60 * 1000)
    .create();
}

function refreshDashboardFromTrigger() {
  var props = PropertiesService.getScriptProperties();
  try {
    updateDashboard(getSpreadsheet());
    props.setProperty('MARKETFLOW_DASHBOARD_LAST_REFRESH', String(Date.now()));
  } finally {
    props.deleteProperty('MARKETFLOW_DASHBOARD_REFRESH_PENDING');
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === 'refreshDashboardFromTrigger') ScriptApp.deleteTrigger(trigger);
    });
  }
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    scheduleDashboardRefresh(ss);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      service: 'MarketFlow & Nexus Shadow Webhook Engine v3.2 — dashboard debounced',
      spreadsheetConnected: ss.getName(),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Payload vazio' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = getSpreadsheet();

    if (data.type === 'RESET_SESSION' || data.type === 'RESET') {
      resetAllSheets(ss);
      updateDashboard(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Sessão reiniciada com sucesso'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'SHADOW_AUDIT' || data.type === 'SHADOW_OPPORTUNITY') {
      logShadowAudit(ss, data);
    } else {
      logTrade(ss, data);
      logMasterMirrorComparison(ss, data);
    }

    scheduleDashboardRefresh(ss);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Registrado com sucesso; painel será atualizado em até 60 segundos',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
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
}

/**
 * ABA 1: TRADES EXECUTADOS (21 Colunas — com Taxas e Lucro Líquido Real)
 */
function initSheetTrades(ss, forceRefresh) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var headers = [
    'Data / Hora',
    'Conta / Origem',
    'Par Bybit',
    'Direção',
    'Tipo Ordem',
    'Preço Entrada ($)',
    'Volume (Qty)',
    'Stop Loss ($)',
    'Take Profit ($)',
    'Trailing Stop',
    'Status',
    'Resultado',
    'Lucro Bruto ($)',
    'Taxas Bybit ($)',
    'Lucro Líquido Real ($)',
    'Fee Drag (%)',
    'Lucro Teórico Shadow ($)',
    'Retorno Bruto (%)',
    'Retorno Líquido (%)',
    'R-Múltiplo',
    'Detalhes / Auditoria',
    'Trade ID',
    'Evento',
    'Notional Master ($)',
    'ExposiÃ§Ã£o Master (%)',
    'Margem Master ($)',
    'PotÃªncia',
    'Alavancagem',
    'Lote MÃ­nimo',
    'Shadow Filter',
    'R Bruto Estrutural',
    'R LÃ­quido Estimado',
    'Risco por Trade ($)',
    'Motivos / ValidaÃ§Ã£o de Risco'
  ];
  if (sheet.getLastRow() === 0 || forceRefresh) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
  }
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function logTrade(ss, data) {
  var sheet = initSheetTrades(ss, false);
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var entryPrice = Number(data.entryPrice || 0);
  var qty = Number(data.qty || 0);
  var notional = entryPrice * qty;
  var pnlGross = Number(data.pnlUsd || 0);

  // Cálculo de Taxas Reais Bybit (Round-trip)
  var orderType = String(data.orderType || 'MARKET').toUpperCase();
  var feeRate = (orderType.indexOf('LIMIT') !== -1) ? (MAKER_FEE_PCT * 2) : (TAKER_FEE_PCT * 2);
  var totalFees = data.feePaid !== undefined ? Number(data.feePaid) : (notional * feeRate + (notional * AVG_SPREAD_BPS));
  var netPnl = pnlGross - totalFees;

  var feeDrag = (pnlGross > 0) ? (totalFees / pnlGross) : (pnlGross < 0 ? (totalFees / Math.abs(pnlGross)) : 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var netPctVal = notional > 0 ? (netPnl / notional) : 0;
  var rMultipleVal = Number(data.rMultiple || 0);

  var shadowTheoreticalPnl = (data.shadowTheoreticalPnl !== undefined)
    ? Number(data.shadowTheoreticalPnl)
    : (String(data.shadowDecision || '').toUpperCase().indexOf('BLOQUEADO') !== -1 ? 0.00 : netPnl);

  var isTrailing = String(data.trailingStopAtivo || 'SIM').toUpperCase() === 'SIM';
  var statusUpper = String(data.status || 'EXECUTADO').toUpperCase();

  var row = [
    formattedDate,
    data.clientName || 'Bybit Linear (USD)',
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    orderType,
    entryPrice,
    qty,
    Number(data.stopLoss || 0),
    Number(data.takeProfit || 0),
    isTrailing ? 'ATIVO 🚀' : 'INATIVO ⚪',
    statusUpper,
    data.outcome || (netPnl > 0 ? 'GREEN 🟢' : (netPnl < 0 ? 'RED 🔴' : '0x0 ⚪')),
    pnlGross,
    totalFees,
    netPnl,
    feeDrag,
    shadowTheoreticalPnl,
    pnlPctVal,
    netPctVal,
    rMultipleVal,
    data.errorMsg || 'Executado via CCXT Bybit',
    data.tradeId || '',
    data.eventKind || '',
    Number(data.masterNotionalUsd || 0),
    Number(data.masterExposureRatio || 0),
    Number(data.masterMarginUsd || 0),
    Number(data.powerMultiplier || 0),
    Number(data.leverage || 0),
    Number(data.exchangeMinQty || 0),
    data.shadowFilterActive ? 'ATIVO' : 'INATIVO',
    data.grossR !== undefined ? Number(data.grossR) : '',
    data.netR !== undefined ? Number(data.netR) : '',
    data.riskUsd !== undefined ? Number(data.riskUsd) : '',
    Array.isArray(data.riskReasons) ? data.riskReasons.join(' | ') : String(data.riskReasons || '')
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // Cores de Direção
  var sideCell = sheet.getRange(lastRow, 4);
  if (String(data.side).toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Cor do Lucro Líquido
  var netCell = sheet.getRange(lastRow, 15);
  if (netPnl > 0) {
    netCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (netPnl < 0) {
    netCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Formatações
  sheet.getRange(lastRow, 6).setNumberFormat('$#,##0.00');
  sheet.getRange(lastRow, 8, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(lastRow, 13, 1, 3).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 16).setNumberFormat('0.0%');
  sheet.getRange(lastRow, 17).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 18, 1, 2).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(lastRow, 20).setNumberFormat('+0.0"R";-0.0"R";0.0"R"');
  sheet.autoResizeColumns(1, 34);
}

/**
 * ABA 2: AUDITORIA SHADOW MODE
 */
function initSheetShadow(ss, forceRefresh) {
  var name = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || forceRefresh) {
    var headers = [
      'Data / Hora',
      'Par Avaliado',
      'Direção',
      'Modo Tradicional',
      'Decisão Shadow Mode',
      'Regra Institucional / Gatilho',
      'Spread L2 (Bps)',
      'Exposição ($)',
      'Desfecho Mercado',
      'Retorno (%)',
      'Impacto Evitado ($)',
      'Lucro Teórico ($)',
      'R-Múltiplo',
      'Veredito de Segurança',
      'Modo Shadow',
      'Fonte de Dados',
      'Aprovada',
      'ID Oportunidade'
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#1e1b4b', '#a855f7');
  }
  return sheet;
}

function logShadowAudit(ss, data) {
  var sheet = initSheetShadow(ss, false);
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var pnlUsdVal = Number(data.pnlUsd || 0);
  var isBlocked = String(data.newMode || '').toUpperCase().indexOf('BLOQUEADO') !== -1;
  var theoreticalPnl = isBlocked ? 0.00 : pnlUsdVal;

  var row = [
    formattedDate,
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    data.oldMode || data.mode || 'AUDIT',
    data.newMode || (data.approved === false ? 'BLOQUEADO' : 'PERMITIDO'),
    Array.isArray(data.reasons) ? data.reasons.join(', ') : (data.reasons || 'Confluência aprovada'),
    Number(data.spreadPips || 0),
    Number(data.usdExposureR || 0),
    data.outcome || (pnlUsdVal > 0 ? 'GREEN 🟢' : (pnlUsdVal < 0 ? 'RED 🔴' : 'EM ANDAMENTO ⏳')),
    Number(data.pnlPct || 0) / 100,
    isBlocked && pnlUsdVal < 0 ? Math.abs(pnlUsdVal) : 0,
    theoreticalPnl,
    Number(data.rMultiple || 0),
    data.safetyVerdict || (isBlocked ? 'SALVOU CAPITAL 🛡️' : 'OPERAÇÃO NORMAL'),
    data.mode || 'AUDIT',
    data.source || 'N/A',
    data.approved === undefined ? '' : (data.approved ? 'SIM' : 'NÃO'),
    data.id || ''
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  var decisionCell = sheet.getRange(lastRow, 5);
  if (isBlocked) {
    decisionCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    decisionCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  }

  sheet.getRange(lastRow, 10).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(lastRow, 11, 1, 2).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 13).setNumberFormat('+0.0"R";-0.0"R";0.0"R"');
  sheet.autoResizeColumns(1, 18);
}

/**
 * ABA 3: COMPARATIVO DINÂMICO DE BANCAS ($500 vs $10,000 — USD ONLY)
 */
function initSheetComparativo(ss, forceRefresh) {
  var name = '⚖️ COMPARATIVO BANCAS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || forceRefresh) {
    sheet.clear();

    // Banner Superior
    sheet.getRange('A1:N1').merge()
      .setValue('PAINEL DE VIABILIDADE ECONÔMICA REAL: BANCA $500 (MICRO) vs BANCA $10,000 (INSTITUCIONAL) — USD ONLY')
      .setBackground('#0f172a').setFontColor('#38bdf8').setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 35);

    var headers = [
      'Data / Hora',
      'Par',
      'Retorno Trade (%)',
      'B500 Ordem ($)',
      'B500 Bruto ($)',
      'B500 Taxas ($)',
      'B500 Líquido ($)',
      'B500 Fee Drag (%)',
      'B10k Ordem ($)',
      'B10k Bruto ($)',
      'B10k Taxas ($)',
      'B10k Líquido ($)',
      'B10k Fee Drag (%)',
      'Veredito de Viabilidade (B500)'
    ];
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, '#1e293b', '#f8fafc');
    sheet.setRowHeight(2, 28);
  }
  return sheet;
}

function initMasterMirrorSheet(ss) {
  var name = 'COMPARATIVO ESPELHO MASTER';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Data / Hora', 'Trade ID', 'Par', 'Status Master', 'Potencia', 'Exposicao Master (%)', 'Retorno Trade (%)', 'Capital Minimo ($)',
      'B500 Antes ($)', 'B500 Status', 'B500 Notional ($)', 'B500 Margem ($)', 'B500 Taxas ($)', 'B500 Liquido ($)', 'B500 Depois ($)',
      'B10k Antes ($)', 'B10k Status', 'B10k Notional ($)', 'B10k Margem ($)', 'B10k Taxas ($)', 'B10k Liquido ($)', 'B10k Depois ($)',
      'Trailing', 'Shadow Filter', 'Motivo'
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function lastMirrorBank(sheet, column, initialBalance) {
  for (var row = sheet.getLastRow(); row >= 2; row--) {
    var value = Number(sheet.getRange(row, column).getValue());
    if (isFinite(value) && value >= 0) return value;
  }
  return initialBalance;
}

function evaluateMasterMirrorBank(balance, data) {
  var exposure = Number(data.masterExposureRatio || 0);
  var entry = Number(data.entryPrice || 0);
  var leverage = Number(data.leverage || 10);
  var minQty = Number(data.exchangeMinQty || 0);
  var step = Number(data.qtyStep || minQty || 0);
  var feeRate = String(data.orderType || 'MARKET').toUpperCase().indexOf('LIMIT') !== -1 ? MAKER_FEE_PCT : TAKER_FEE_PCT;
  if (!(exposure > 0 && entry > 0 && leverage > 0 && minQty > 0 && step > 0)) {
    return { status: 'SEM DADOS DE ELEGIBILIDADE', reason: 'Payload da master sem exposicao, preco ou lote minimo.' };
  }
  var desiredNotional = balance * exposure;
  var qty = Math.floor((desiredNotional / entry) / step) * step;
  var minNotional = minQty * entry;
  var minimumBank = minNotional / exposure;
  if (qty < minQty) {
    return { status: 'FORA - LOTE MINIMO', minimumBank: minimumBank, reason: 'A banca nao atinge o lote minimo Bybit sem alterar a exposicao da master.' };
  }
  var notional = qty * entry;
  var margin = notional / leverage;
  var openFee = notional * feeRate;
  if (margin + openFee > balance) {
    return { status: 'FORA - MARGEM/TAXA', minimumBank: minimumBank, reason: 'Margem isolada e taxa de abertura excedem o saldo disponivel.' };
  }
  var returnPct = Number(data.pnlPct || 0) / 100;
  var gross = notional * returnPct;
  var fees = notional * feeRate * 2;
  var net = gross - fees;
  return { status: 'EXECUTAVEL', minimumBank: minimumBank, notional: notional, margin: margin, fees: fees, net: net, reason: '' };
}

function logMasterMirrorComparison(ss, data) {
  if (String(data.eventKind || '').toUpperCase() !== 'CLOSE') return;
  var sheet = initMasterMirrorSheet(ss);
  var b500Before = lastMirrorBank(sheet, 15, 500);
  var b10kBefore = lastMirrorBank(sheet, 22, 10000);
  var b500 = evaluateMasterMirrorBank(b500Before, data);
  var b10k = evaluateMasterMirrorBank(b10kBefore, data);
  var b500After = b500.status === 'EXECUTAVEL' ? b500Before + b500.net : b500Before;
  var b10kAfter = b10k.status === 'EXECUTAVEL' ? b10kBefore + b10k.net : b10kBefore;
  var minimumBank = Math.max(Number(b500.minimumBank || 0), Number(b10k.minimumBank || 0));
  var row = [
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'), data.tradeId || '', data.symbol || '', data.status || '',
    Number(data.powerMultiplier || 0), Number(data.masterExposureRatio || 0), Number(data.pnlPct || 0) / 100, minimumBank,
    b500Before, b500.status, Number(b500.notional || 0), Number(b500.margin || 0), Number(b500.fees || 0), Number(b500.net || 0), b500After,
    b10kBefore, b10k.status, Number(b10k.notional || 0), Number(b10k.margin || 0), Number(b10k.fees || 0), Number(b10k.net || 0), b10kAfter,
    data.trailingStopAtivo || 'N/A', data.shadowFilterActive ? 'ATIVO' : 'INATIVO', b500.reason || b10k.reason || ''
  ];
  sheet.appendRow(row);
  var last = sheet.getLastRow();
  sheet.getRange(last, 6, 1, 2).setNumberFormat('0.00%');
  sheet.getRange(last, 8, 1, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(last, 9).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 11, 1, 5).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 16).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 18, 1, 5).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.autoResizeColumns(1, 25);
  refreshMasterMirrorChart(sheet);
}

function refreshMasterMirrorChart(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var charts = sheet.getCharts();
  for (var i = 0; i < charts.length; i++) sheet.removeChart(charts[i]);
  var chart = sheet.newChart()
    .asLineChart()
    .addRange(sheet.getRange(1, 1, last, 1))
    .addRange(sheet.getRange(1, 15, last, 1))
    .addRange(sheet.getRange(1, 22, last, 1))
    .setPosition(3, 27, 0, 0)
    .setOption('title', 'Evolucao das Bancas — somente trades executaveis')
    .setOption('legend', { position: 'bottom' })
    .build();
  sheet.insertChart(chart);
}

function logComparativoAuto(ss, data) {
  var sheet = initSheetComparativo(ss, false);
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var pnlPct = Number(data.pnlPct || 0) / 100; // Ex: 0.025 para +2.5%

  // BANCA $500 (USD):
  // Alocação 10% = $50 (atende o min notional de $5.00)
  var b500Order = 50.00;
  var b500Gross = b500Order * pnlPct;
  // Taxa: Taker Round-trip (0.11%) + Spread mínimo proporcional (0.04%) + impacto de arredondamento
  var b500Fees = (b500Order * (TAKER_FEE_PCT * 2 + AVG_SPREAD_BPS)) + 0.15; // $0.15 de atrito micro
  var b500Net = b500Gross - b500Fees;
  var b500FeeDrag = (b500Gross > 0) ? (b500Fees / b500Gross) : 1.0;

  // BANCA $10,000 (USD):
  // Alocação 10% = $1,000
  var b10kOrder = 1000.00;
  var b10kGross = b10kOrder * pnlPct;
  var b10kFees = (b10kOrder * (TAKER_FEE_PCT * 2 + AVG_SPREAD_BPS));
  var b10kNet = b10kGross - b10kFees;
  var b10kFeeDrag = (b10kGross > 0) ? (b10kFees / b10kGross) : 0;

  var veredito = '';
  if (b500Net <= 0 && b500Gross > 0) {
    veredito = '❌ MOÍDO POR TAXAS (LUCRO VIRA PREJUÍZO)';
  } else if (b500FeeDrag > 0.30) {
    veredito = '⚠️ FEE DRAG CRÍTICO (>30% DO GANHO)';
  } else if (b500Order < MIN_NOTIONAL_USD) {
    veredito = '⛔ REJEITADO (ABAIXO DO LOTE MÍNIMO $5.00)';
  } else {
    veredito = '✅ LUCRATIVO EM AMBAS';
  }

  var row = [
    formattedDate,
    data.symbol || 'BTCUSDT',
    pnlPct,
    b500Order,
    b500Gross,
    b500Fees,
    b500Net,
    b500FeeDrag,
    b10kOrder,
    b10kGross,
    b10kFees,
    b10kNet,
    b10kFeeDrag,
    veredito
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // Estilização do Veredito
  var verCell = sheet.getRange(lastRow, 14);
  if (veredito.indexOf('✅') !== -1) {
    verCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (veredito.indexOf('⚠️') !== -1) {
    verCell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
  } else {
    verCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Formatações (USD)
  sheet.getRange(lastRow, 3).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(lastRow, 4, 1, 4).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 8).setNumberFormat('0.0%');
  sheet.getRange(lastRow, 9, 1, 4).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 13).setNumberFormat('0.0%');
  sheet.autoResizeColumns(1, 14);
}

function recalcComparativo() {
  var ss = getSpreadsheet();
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (!tradesSheet || tradesSheet.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert('Não há trades executados para recalcular.');
    return;
  }

  var mirrorSheet = ss.getSheetByName('COMPARATIVO ESPELHO MASTER');
  if (mirrorSheet) ss.deleteSheet(mirrorSheet);
  initMasterMirrorSheet(ss);
  var rows = tradesSheet.getRange(2, 1, tradesSheet.getLastRow() - 1, tradesSheet.getLastColumn()).getValues();

  for (var i = 0; i < rows.length; i++) {
    logMasterMirrorComparison(ss, {
      symbol: rows[i][2], status: rows[i][10], pnlPct: Number(rows[i][17] || 0) * 100,
      trailingStopAtivo: rows[i][9], tradeId: rows[i][21], eventKind: rows[i][22],
      masterNotionalUsd: Number(rows[i][23] || 0), masterExposureRatio: Number(rows[i][24] || 0),
      masterMarginUsd: Number(rows[i][25] || 0), powerMultiplier: Number(rows[i][26] || 0),
      leverage: Number(rows[i][27] || 0), exchangeMinQty: Number(rows[i][28] || 0), qtyStep: Number(rows[i][28] || 0),
      shadowFilterActive: String(rows[i][29] || '').toUpperCase() === 'ATIVO', orderType: rows[i][4], entryPrice: Number(rows[i][5] || 0)
    });
  }

  updateDashboard(ss);
  SpreadsheetApp.getUi().alert('Comparativo recalculado com base no histórico completo!');
}

/**
 * ABA 4: DASHBOARD & SAÚDE QUANTITATIVA
 */
function updateDashboard(ss) {
  var name = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name, 0);

  sheet.setTabColor('#10b981');

  // Cabeçalho Principal
  sheet.getRange('A1:F1').merge()
    .setValue('MARKETFLOW PRO & NEXUS SHADOW — CENTRAL DE COMANDO QUANT')
    .setFontSize(12).setFontWeight('bold').setBackground('#0f172a').setFontColor('#38bdf8')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);

  var now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange('A2:F2').merge()
    .setValue('Status: 🟢 24/7 ONLINE | Conexão: Bybit Linear + Nexus Shadow | Auditado: ' + now)
    .setFontSize(9).setBackground('#1e293b').setFontColor('#94a3b8')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(2, 24);

  // Leitura de Trades
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  var tradesCount = tradesSheet ? Math.max(0, tradesSheet.getLastRow() - 1) : 0;

  var greenCount = 0;
  var redCount = 0;
  var totalGrossPnl = 0;
  var totalFees = 0;
  var totalNetPnl = 0;

  if (tradesSheet && tradesCount > 0) {
    var maxCols = Math.max(21, tradesSheet.getLastColumn());
    var tRows = tradesSheet.getRange(2, 1, tradesCount, maxCols).getValues();
    for (var i = 0; i < tRows.length; i++) {
      var gross = Number(tRows[i][12] || 0); // Lucro Bruto $
      var fee = Number(tRows[i][13] || 0);   // Taxas $
      var net = Number(tRows[i][14] || (gross - fee)); // Líquido Real $

      if (net > 0) greenCount++;
      else if (net < 0) redCount++;

      totalGrossPnl += gross;
      totalFees += fee;
      totalNetPnl += net;
    }
  }

  var closedTrades = greenCount + redCount;
  var winRate = closedTrades > 0 ? (greenCount / closedTrades) * 100 : 0;
  var globalFeeDrag = (totalGrossPnl > 0) ? (totalFees / totalGrossPnl) * 100 : 0;

  // Leitura do Comparativo
  var compSheet = ss.getSheetByName('⚖️ COMPARATIVO BANCAS');
  var b500AccumNet = 0;
  var b10kAccumNet = 0;
  var compCount = compSheet ? Math.max(0, compSheet.getLastRow() - 2) : 0;

  if (compSheet && compCount > 0) {
    var cRows = compSheet.getRange(3, 1, compCount, 14).getValues();
    for (var c = 0; c < cRows.length; c++) {
      b500AccumNet += Number(cRows[c][6] || 0);  // B500 Líquido $
      b10kAccumNet += Number(cRows[c][11] || 0); // B10k Líquido $
    }
  }

  // ── LINHA 1 DE CARDS: EXECUÇÃO & ACERTO ──
  sheet.getRange('A4:B4').merge().setValue('OPERAÇÕES AUDITADAS').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A5:B5').merge().setValue(tradesCount).setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('TAXA ACERTO REAL').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('C5:D5').merge().setValue(winRate.toFixed(1) + '%').setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(winRate >= 50 ? '#15803d' : '#b91c1c');

  sheet.getRange('E4:F4').merge().setValue('FEE DRAG GLOBAL (%)').setFontWeight('bold').setBackground('#fef3c7').setFontColor('#b45309').setHorizontalAlignment('center');
  sheet.getRange('E5:F5').merge().setValue(globalFeeDrag.toFixed(1) + '%').setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(globalFeeDrag <= 15 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(4, 22);
  sheet.setRowHeight(5, 34);

  // ── LINHA 2 DE CARDS: FINANCEIRO REAL (USD) ──
  sheet.getRange('A7:B7').merge().setValue('LUCRO BRUTO ($)').setFontWeight('bold').setBackground('#e2e8f0').setHorizontalAlignment('center');
  sheet.getRange('A8:B8').merge().setValue(totalGrossPnl).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');

  sheet.getRange('C7:D7').merge().setValue('TAXAS CONSUMIDAS ($)').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('C8:D8').merge().setValue(totalFees).setFontSize(18).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00');

  sheet.getRange('E7:F7').merge().setValue('LUCRO LÍQUIDO NO BOLSO ($)').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  sheet.getRange('E8:F8').merge().setValue(totalNetPnl).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"')
    .setFontColor(totalNetPnl >= 0 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(7, 22);
  sheet.setRowHeight(8, 34);

  // ── LINHA 3 DE CARDS: COMPARATIVO ACUMULADO (USD) ──
  sheet.getRange('A10:C10').merge().setValue('BANCA $500 — LÍQUIDO ACUMULADO ($)').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  var b500Cell = sheet.getRange('A11:C11').merge().setValue(b500AccumNet).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  b500Cell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(b500AccumNet >= 0 ? '#15803d' : '#b91c1c');

  sheet.getRange('D10:F10').merge().setValue('BANCA $10,000 — LÍQUIDO ACUMULADO ($)').setFontWeight('bold').setBackground('#ede9fe').setFontColor('#6d28d9').setHorizontalAlignment('center');
  var b10kCell = sheet.getRange('D11:F11').merge().setValue(b10kAccumNet).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  b10kCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(b10kAccumNet >= 0 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(10, 22);
  sheet.setRowHeight(11, 34);

  // Bloco de Regras de Viabilidade
  sheet.getRange('A13:F13').merge().setValue('DIRETRIZES DE VIABILIDADE POR TAMANHO DE BANCA').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(13, 26);

  var guidelines = [
    ['Banca $500.00', 'Risco: $5 a 10 por trade | Requer alocação mínima de $5.00 (min_notional Bybit). Cuidado: taxa fixa e spread devoram de 15% a 40% do ganho.'],
    ['Banca $10,000.00', 'Risco: $100 a 200 por trade | Alocação de $1,000. Taxas representam menos de 2.5% do ganho bruto (Fee Drag desprezível).'],
    ['Regra Anti-Fricção', 'Se a relação (Taxa / Lucro Bruto) for maior que 20%, o Shadow ajusta para entrada em ordem LIMIT (Maker) para receber rebate.'],
    ['Trailing Stop Dinâmico', 'Protege 80% da assimetria positiva, impedindo que trades vencedores voltem para a zona de empate devorada por taxas.']
  ];

  for (var g = 0; g < guidelines.length; g++) {
    sheet.getRange(14 + g, 1, 1, 2).merge().setValue(guidelines[g][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(14 + g, 3, 1, 4).merge().setValue(guidelines[g][1]).setBackground('#ffffff');
    sheet.setRowHeight(14 + g, 26);
  }

  sheet.autoResizeColumns(1, 6);
}

function formatHeaderRow(sheet, bgHex, fontHex) {
  var header = sheet.getRange(sheet.getFrozenRows() > 0 ? 2 : 1, 1, 1, sheet.getLastColumn());
  header.setBackground(bgHex || '#0f172a');
  header.setFontColor(fontHex || '#ffffff');
  header.setFontWeight('bold');
  header.setFontSize(10);
  header.setHorizontalAlignment('center');
  header.setVerticalAlignment('middle');
}
