/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO & NEXUS SHADOW — GOOGLE APPS SCRIPT OFICIAL v4.2 (BINGX SWAP)
 * ==============================================================================
 * 
 * ATUALIZAÇÕES v4.2:
 * 1. 📊 PAINEL & SAÚDE QUANT:
 *    - Estatísticas separadas entre "OPERAÇÕES CONCLUÍDAS" e "POSIÇÕES ABERTAS"
 *    - Taxa de acerto real baseada estritamente em operações finalizadas
 *    - Contagem precisa de Wins (🟢), Losses (🔴) e Breakevens (⚖️)
 *    - Exibição de Profit Factor, Lucro Bruto, Taxas Consumidas e Lucro Líquido Real
 *    - Monitoramento em tempo real do PnL flutuante das ordens abertas
 * 2. ⚡ TRADES EXECUTADOS (Idempotência e Ciclo de Vida):
 *    - Atualiza a linha existente quando a ordem fecha (OPEN -> CLOSE)
 *    - Evita duplicações de registros da mesma ordem pelo Trade ID
 * 3. 🛡️ BINGX SWAP PERPETUAL:
 *    - Taxas VIP0 oficiais (Maker 0.020% / Taker 0.050%)
 *    - Mínimo de contrato notional $2.00 USD
 * ==============================================================================
 */

var SPREADSHEET_ID = '1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA';

// Parâmetros Oficiais de Custos de Mercado (BingX VIP0 Perpetual Swap)
var TAKER_FEE_PCT = 0.00050; // 0.050% por perna (0.10% round-trip)
var MAKER_FEE_PCT = 0.00020; // 0.020% por perna (0.04% round-trip)
var AVG_SPREAD_BPS = 0.00020; // 2.0 Bps de spread médio L2
var MIN_NOTIONAL_USD = 2.00; // Valor mínimo notional BingX Swap ($2.00 USD)

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
 * Menu Superior na barra de ferramentas
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 BingX & MarketFlow Pro')
    .addItem('⚡ Setup Inicial Completo (Todas as Abas)', 'setupInicial')
    .addItem('🔄 Atualizar Dashboard e Métricas', 'manualUpdateDashboard')
    .addSeparator()
    .addItem('⚖️ Recalcular Comparativo (500 vs 10k)', 'recalcComparativo')
    .addItem('🧹 Limpar e Reiniciar Dados', 'limparDadosConfirmado')
    .addToUi();
}

/**
 * Criação rápida e leve de todas as abas estruturadas
 */
function setupInicial() {
  var ss = getSpreadsheet();
  
  initSheetTrades(ss, true);
  SpreadsheetApp.flush();
  
  initSheetShadow(ss, true);
  SpreadsheetApp.flush();
  
  initSheetComparativo(ss, true);
  SpreadsheetApp.flush();
  
  initMasterMirrorSheet(ss);
  SpreadsheetApp.flush();
  
  updateDashboard(ss);
  SpreadsheetApp.flush();
  
  try {
    SpreadsheetApp.getUi().alert('✅ Painel BingX Pro e todas as abas foram calibradas com sucesso!');
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
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      service: 'MarketFlow Pro & Nexus BingX Engine v4.2',
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

/**
 * Endpoint Webhook com Proteção Lock e Cache de Idempotência
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var cache = CacheService.getScriptCache();
  var requestId = '';
  var cacheKey = '';

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Payload vazio');
    }

    var raw = String(e.postData.contents);
    var data = JSON.parse(raw);

    requestId = String(data.requestId || data.tradeId || data.id || ('req_' + Date.now()));
    cacheKey = 'bingx:event:' + requestId;

    if (!lock.tryLock(5000)) {
      return MF_response('retry', 'LOCK_BUSY', 'Planilha ocupada; tente novamente.', requestId, true);
    }
    lockAcquired = true;

    if (cache.get(cacheKey) === 'done') {
      return MF_response('success', 'DUPLICATE', 'Evento já processado.', requestId, false, { duplicate: true });
    }
    cache.put(cacheKey, 'processing', 60);

    var ss = getSpreadsheet();

    if (data.type === 'RESET_SESSION' || data.type === 'RESET') {
      resetAllSheets(ss);
      updateDashboard(ss);
    } else if (data.type === 'SHADOW_AUDIT' || data.type === 'SHADOW_OPPORTUNITY') {
      logShadowAudit(ss, data);
    } else {
      logTrade(ss, data);
      logMasterMirrorComparison(ss, data);
      if (String(data.eventKind || '').toUpperCase() === 'CLOSE') {
        logComparativoAuto(ss, data);
      }
    }

    cache.put(cacheKey, 'done', 21600); // 6h de idempotência
  } catch (err) {
    if (cacheKey) cache.remove(cacheKey);
    return MF_response('error', 'PROCESSING_ERROR', String(err), requestId, false);
  } finally {
    if (lockAcquired) lock.releaseLock();
  }

  try {
    scheduleDashboardRefresh(getSpreadsheet());
  } catch (scheduleErr) {
    console.log('Painel atualizado posteriormente: ' + scheduleErr);
  }

  return MF_response('success', 'ACCEPTED', 'Registrado com sucesso no BingX Pro.', requestId, false);
}

function MF_response(status, code, message, requestId, retryable, extra) {
  var body = {
    status: status,
    code: code,
    message: message,
    requestId: requestId || null,
    retryable: Boolean(retryable),
    timestamp: new Date().toISOString()
  };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
    }
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
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
}

/**
 * ABA 1: TRADES EXECUTADOS
 */
function initSheetTrades(ss, forceRefresh) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var headers = [
    'Data / Hora', 'Conta / Origem', 'Par BingX', 'Direção', 'Tipo Ordem',
    'Preço Entrada ($)', 'Volume (Qty)', 'Stop Loss ($)', 'Take Profit ($)',
    'Trailing Stop', 'Status', 'Resultado', 'Lucro Bruto ($)', 'Taxas BingX ($)',
    'Lucro Líquido Real ($)', 'Fee Drag (%)', 'Lucro Teórico Shadow ($)',
    'Retorno Bruto (%)', 'Retorno Líquido (%)', 'R-Múltiplo', 'Detalhes / Auditoria',
    'Trade ID', 'Evento', 'Notional Master ($)', 'Exposição Master (%)',
    'Margem Master ($)', 'Potência', 'Alavancagem', 'Lote Mínimo',
    'Shadow Filter', 'R Bruto Estrutural', 'R Líquido Estimado', 'Risco por Trade ($)',
    'Motivos / Validação de Risco'
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
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var entryPrice = Number(data.entryPrice || 0);
  var qty = Number(data.qty || 0);
  var notional = Number(data.masterNotionalUsd || (entryPrice * qty));
  var pnlGross = Number(data.pnlUsd || 0);

  var orderType = String(data.orderType || 'MARKET').toUpperCase();
  var feeRate = (orderType.indexOf('LIMIT') !== -1) ? (MAKER_FEE_PCT * 2) : (TAKER_FEE_PCT * 2);
  var totalFees = data.feePaid !== undefined ? Number(data.feePaid) : (notional * feeRate + (notional * AVG_SPREAD_BPS));
  var netPnl = pnlGross - totalFees;

  var feeDrag = (pnlGross > 0) ? (totalFees / pnlGross) : (pnlGross < 0 ? (totalFees / Math.abs(pnlGross)) : 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var netPctVal = notional > 0 ? (netPnl / notional) : 0;
  var rMultipleVal = Number(data.rMultiple || 0);

  var isTrailing = String(data.trailingStopAtivo || 'SIM').toUpperCase() === 'SIM';
  var isClose = String(data.eventKind || '').toUpperCase() === 'CLOSE' || String(data.status || '').indexOf('CLOSED') !== -1;
  var outcome = data.outcome || (isClose ? (netPnl > 0 ? 'WIN 🎯' : (netPnl < 0 ? 'LOSS 🛑' : 'BREAKEVEN ⚖️')) : 'EM ANDAMENTO ⏳');

  var shadowTheoreticalPnl = (data.shadowTheoreticalPnl !== undefined)
    ? Number(data.shadowTheoreticalPnl)
    : (String(data.shadowDecision || '').toUpperCase().indexOf('BLOQUEADO') !== -1 ? 0.00 : netPnl);

  var row = [
    formattedDate,
    data.clientName || 'Master (BingX Swap)',
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    orderType,
    entryPrice,
    qty,
    Number(data.stopLoss || 0),
    Number(data.takeProfit || 0),
    isTrailing ? 'ATIVO' : 'DESATIVADO',
    data.status || (isClose ? 'EXECUTADA' : 'MASTER_ABERTO'),
    outcome,
    pnlGross,
    totalFees,
    netPnl,
    feeDrag,
    shadowTheoreticalPnl,
    pnlPctVal,
    netPctVal,
    rMultipleVal,
    data.errorMsg || data.shadowDecision || (data.riskReasons ? data.riskReasons.join(', ') : 'OK'),
    data.tradeId || '',
    data.eventKind || (isClose ? 'CLOSE' : 'OPEN'),
    Number(data.masterNotionalUsd || notional),
    Number(data.masterExposureRatio || 0),
    Number(data.masterMarginUsd || 0),
    Number(data.powerMultiplier || 1.0),
    Number(data.leverage || 10),
    Number(data.exchangeMinQty || 0.0001),
    data.shadowFilterActive ? 'ATIVO' : 'INATIVO',
    Number(data.grossR || 0),
    Number(data.netR || 0),
    Number(data.riskUsd || 0),
    data.riskReasons ? data.riskReasons.join(', ') : ''
  ];

  // 🔍 Se a ordem já foi aberta anteriormente, atualiza a linha existente
  var tradeId = String(data.tradeId || '');
  var existingRow = -1;
  if (tradeId && sheet.getLastRow() > 1) {
    var idCol = 22; // Coluna V: Trade ID
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

  var outCell = sheet.getRange(targetRow, 12);
  if (outcome.indexOf('WIN') !== -1 || outcome.indexOf('GREEN') !== -1) {
    outCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outcome.indexOf('LOSS') !== -1 || outcome.indexOf('RED') !== -1) {
    outCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outCell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
  }

  sheet.getRange(targetRow, 6).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 7).setNumberFormat('0.0000');
  sheet.getRange(targetRow, 8, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 13, 1, 3).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(targetRow, 16).setNumberFormat('0.0%');
  sheet.getRange(targetRow, 17).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(targetRow, 18, 1, 2).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(targetRow, 20).setNumberFormat('+0.0"R";-0.0"R";0.0"R"');
  sheet.getRange(targetRow, 24).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 25).setNumberFormat('0.00%');
  sheet.getRange(targetRow, 26).setNumberFormat('$#,##0.00');
  sheet.getRange(targetRow, 31, 1, 2).setNumberFormat('+0.00"R";-0.00"R";0.00"R"');
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

function logShadowAudit(ss, data) {
  var sheet = initSheetShadow(ss, false);
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var pnlUsdVal = Number(data.pnlUsd || 0);
  var isBlocked = String(data.newMode || '').toUpperCase().indexOf('BLOQUEADO') !== -1 || data.approved === false;
  var theoreticalPnl = isBlocked ? 0.00 : pnlUsdVal;

  var row = [
    formattedDate,
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    data.oldMode || data.mode || 'AUDIT',
    isBlocked ? 'BLOQUEADO' : 'PERMITIDO',
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
    data.source || 'BINGX',
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
    try {
      sheet.getRange('A1:N1').merge();
    } catch(e) {}

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

function logComparativoAuto(ss, data) {
  var sheet = initSheetComparativo(ss, false);
  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

  var pnlPct = Number(data.pnlPct || 0) / 100;

  var b500Order = 50.00;
  var b500Gross = b500Order * pnlPct;
  var b500Fees = (b500Order * (TAKER_FEE_PCT * 2 + AVG_SPREAD_BPS)) + 0.08;
  var b500Net = b500Gross - b500Fees;
  var b500FeeDrag = (b500Gross > 0) ? (b500Fees / b500Gross) : 1.0;

  var b10kOrder = 1000.00;
  var b10kGross = b10kOrder * pnlPct;
  var b10kFees = (b10kOrder * (TAKER_FEE_PCT * 2 + AVG_SPREAD_BPS));
  var b10kNet = b10kGross - b10kFees;
  var b10kFeeDrag = (b10kGross > 0) ? (b10kFees / b10kGross) : 0;

  var veredito = '';
  if (b500Net <= 0 && b500Gross > 0) {
    veredito = '❌ MOÍDO POR TAXAS (LUCRO VIRA PREJUÍZO)';
  } else if (b500FeeDrag > 0.25) {
    veredito = '⚠️ FEE DRAG ALTO (>25% DO GANHO)';
  } else if (b500Order < MIN_NOTIONAL_USD) {
    veredito = '⛔ ABAIXO DO MÍNIMO ($2.00)';
  } else {
    veredito = '✅ LUCRATIVO EM AMBAS';
  }

  var row = [
    formattedDate, data.symbol || 'BTC/USDT:USDT', pnlPct, b500Order, b500Gross, b500Fees,
    b500Net, b500FeeDrag, b10kOrder, b10kGross, b10kFees, b10kNet, b10kFeeDrag, veredito
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  var verCell = sheet.getRange(lastRow, 14);
  if (veredito.indexOf('✅') !== -1) {
    verCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (veredito.indexOf('⚠️') !== -1) {
    verCell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
  } else {
    verCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  sheet.getRange(lastRow, 3).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(lastRow, 4, 1, 4).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 8).setNumberFormat('0.0%');
  sheet.getRange(lastRow, 9, 1, 4).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 13).setNumberFormat('0.0%');
}

/**
 * ABA ESPELHO MASTER
 */
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
  var minQty = Number(data.exchangeMinQty || 0.0001);
  var step = Number(data.qtyStep || minQty || 0.0001);
  var feeRate = String(data.orderType || 'MARKET').toUpperCase().indexOf('LIMIT') !== -1 ? MAKER_FEE_PCT : TAKER_FEE_PCT;
  if (!(exposure > 0 && entry > 0 && leverage > 0 && minQty > 0 && step > 0)) {
    return { status: 'SEM DADOS DE ELEGIBILIDADE', reason: 'Payload da master sem exposicao, preco ou lote minimo.' };
  }
  var desiredNotional = balance * exposure;
  var qty = Math.floor((desiredNotional / entry) / step) * step;
  var minNotional = minQty * entry;
  var minimumBank = minNotional / exposure;
  if (qty < minQty) {
    return { status: 'FORA - LOTE MINIMO', minimumBank: minimumBank, reason: 'A banca nao atinge o lote minimo BingX sem alterar a exposicao da master.' };
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
    Number(data.powerMultiplier || 1.0), Number(data.masterExposureRatio || 0), Number(data.pnlPct || 0) / 100, minimumBank,
    b500Before, b500.status, Number(b500.notional || 0), Number(b500.margin || 0), Number(b500.fees || 0), Number(b500.net || 0), b500After,
    b10kBefore, b10k.status, Number(b10k.notional || 0), Number(b10k.margin || 0), Number(b10k.fees || 0), Number(b10k.net || 0), b10kAfter,
    data.trailingStopAtivo || 'SIM', data.shadowFilterActive ? 'ATIVO' : 'INATIVO', b500.reason || b10k.reason || ''
  ];
  sheet.appendRow(row);
  var last = sheet.getLastRow();
  sheet.getRange(last, 6, 1, 2).setNumberFormat('0.00%');
  sheet.getRange(last, 8, 1, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(last, 9).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 11, 1, 5).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 16).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(last, 18, 1, 5).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
}

function recalcComparativo() {
  var ss = getSpreadsheet();
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (!tradesSheet || tradesSheet.getLastRow() <= 1) {
    try {
      SpreadsheetApp.getUi().alert('Não há trades executados para recalcular.');
    } catch(e) {}
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
      leverage: Number(rows[i][27] || 10), exchangeMinQty: Number(rows[i][28] || 0.0001), qtyStep: Number(rows[i][28] || 0.0001),
      shadowFilterActive: String(rows[i][29] || '').toUpperCase() === 'ATIVO', orderType: rows[i][4], entryPrice: Number(rows[i][5] || 0)
    });
  }

  updateDashboard(ss);
  try {
    SpreadsheetApp.getUi().alert('Comparativo recalculado com base no histórico completo!');
  } catch(e) {}
}

/**
 * ABA 4: DASHBOARD & PAINEL VISUAL EXECUTIVO (BINGX SWAP v4.2)
 */
function updateDashboard(ss) {
  var name = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, 0);
  } else {
    // 🛡️ Remove mesclagens antigas e limpa para evitar colisões de células
    try {
      sheet.getRange(1, 1, 40, 20).breakApart();
      sheet.clearContents();
      sheet.clearFormats();
    } catch(e) {}
  }

  sheet.setTabColor('#0284c7');

  // Banner Principal
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
    'Status: 🟢 24/7 ONLINE | Conexão Oficial: BingX Swap (USDT-M) | Sincronizado: ' + now, '', '', '', '', ''
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
    var maxCols = Math.max(23, tradesSheet.getLastColumn());
    var tRows = tradesSheet.getRange(2, 1, totalRows, maxCols).getValues();

    for (var i = 0; i < tRows.length; i++) {
      var rowStatus = String(tRows[i][10] || '').toUpperCase();
      var rowOutcome = String(tRows[i][11] || '').toUpperCase();
      var eventKind = String(tRows[i][22] || '').toUpperCase();

      var isOpen = eventKind === 'OPEN' || rowStatus.indexOf('ABERTO') !== -1 || rowOutcome.indexOf('EM ANDAMENTO') !== -1;

      var gross = Number(tRows[i][12] || 0);
      var fee = Number(tRows[i][13] || 0);
      var net = Number(tRows[i][14] || (gross - fee));

      if (isOpen) {
        openTradesCount++;
        floatingPnl += gross;
      } else {
        closedTradesCount++;
        if (net > 0) {
          greenCount++;
          totalGrossWin += gross;
        } else if (net < 0) {
          redCount++;
          totalGrossLoss += Math.abs(gross);
        } else {
          breakEvenCount++;
        }

        totalGrossPnl += gross;
        totalFees += fee;
        totalNetPnl += net;
      }
    }
  }

  var winRate = closedTradesCount > 0 ? (greenCount / closedTradesCount) * 100 : 0;
  var profitFactor = totalGrossLoss > 0 ? (totalGrossWin / totalGrossLoss) : (totalGrossWin > 0 ? 99.9 : 0.0);
  var globalFeeDrag = (totalGrossPnl > 0) ? (totalFees / totalGrossPnl) * 100 : 0;

  // Leitura do Comparativo
  var compSheet = ss.getSheetByName('⚖️ COMPARATIVO BANCAS');
  var b500AccumNet = 0;
  var b10kAccumNet = 0;
  var compCount = compSheet ? Math.max(0, compSheet.getLastRow() - 2) : 0;

  if (compSheet && compCount > 0) {
    var cRows = compSheet.getRange(3, 1, compCount, 14).getValues();
    for (var c = 0; c < cRows.length; c++) {
      b500AccumNet += Number(cRows[c][6] || 0);
      b10kAccumNet += Number(cRows[c][11] || 0);
    }
  }

  // ── LINHA 1 DE CARDS: VOLUME OPERACIONAL & POSIÇÕES ABERTAS ──
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

  // ── LINHA 2 DE CARDS: EFICIÊNCIA & PROTEÇÃO SHADOW ──
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

  // ── LINHA 3 DE CARDS: RESULTADO FINANCEIRO REAL (USD) ──
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

  // ── LINHA 4 DE CARDS: COMPARATIVO ACUMULADO (USD) ──
  sheet.getRange('A13:C13').merge().setValue('BANCA $500 — LÍQUIDO ACUMULADO ($)').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  var b500Cell = sheet.getRange('A14:C14').merge().setValue(b500AccumNet).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  b500Cell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(b500AccumNet >= 0 ? '#15803d' : '#b91c1c');

  sheet.getRange('D13:F13').merge().setValue('BANCA $10,000 — LÍQUIDO ACUMULADO ($)').setFontWeight('bold').setBackground('#ede9fe').setFontColor('#6d28d9').setHorizontalAlignment('center');
  var b10kCell = sheet.getRange('D14:F14').merge().setValue(b10kAccumNet).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  b10kCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(b10kAccumNet >= 0 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(13, 24);
  sheet.setRowHeight(14, 36);

  // Bloco de Diretrizes BingX
  sheet.getRange('A16:F16').merge().setValue('DIRETRIZES DE VIABILIDADE E EFICIÊNCIA — BINGX SWAP').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(16, 28);

  var guidelines = [
    ['Banca $500.00', 'Risco: $5 a $10 por trade | Lote mínimo BingX ($2.00) é altamente eficiente contra a barreira de min notional.'],
    ['Banca $10,000.00', 'Risco: $100 a $200 por trade | Alocação de $1,000. Taxas representam menos de 2% do lucro bruto (Máxima eficiência).'],
    ['Taxa Maker vs Taker', 'Taker 0.050% e Maker 0.020%. Entradas passivas (LIMIT) economizam mais de 60% do custo em taxas.'],
    ['Trailing Stop Dinâmico', 'Gatilho de proteção acionado em 80% do caminho do Take Profit, blindando o capital contra reversões repentinas.']
  ];

  for (var g = 0; g < guidelines.length; g++) {
    sheet.getRange(17 + g, 1, 1, 2).merge().setValue(guidelines[g][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(17 + g, 3, 1, 4).merge().setValue(guidelines[g][1]).setBackground('#ffffff');
    sheet.setRowHeight(17 + g, 26);
  }

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
