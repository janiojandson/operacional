/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO — GOOGLE APPS SCRIPT OFICIAL & 100% VINCULADO
 * ==============================================================================
 * 
 * PLANILHA CONECTADA:
 * ID: 1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA
 * Link: https://docs.google.com/spreadsheets/d/1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA/edit
 * 
 * ==============================================================================
 */

// 🔒 ID oficial da sua planilha
var SPREADSHEET_ID = '1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA';

/**
 * Retorna a instância ativa da planilha
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
    throw new Error('Não foi possível abrir a planilha. Verifique permissões para o ID: ' + SPREADSHEET_ID);
  }
}

/**
 * ⚡ FUNÇÃO DE INICIALIZAÇÃO EM 1 CLIQUE
 * Selecione esta função no menu superior e clique em '▶ Executar' para formatar todas as abas.
 */
function setupInicial() {
  var ss = getSpreadsheet();
  initSheetTrades(ss, true);
  initSheetShadow(ss, true);
  updateDashboard(ss);
  Logger.log('✅ Configuração estrutural concluída na planilha ID: ' + SPREADSHEET_ID);
}

/**
 * Webhook GET — Verificação de status e saúde via navegador
 */
function doGet(e) {
  try {
    var ss = getSpreadsheet();
    updateDashboard(ss);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      service: 'MarketFlow Pro — Google Sheets Webhook Engine',
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
 * Webhook POST — Recebe os dados de execução e auditoria em tempo real
 */
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
        message: 'Sessão da planilha zerada com sucesso',
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'SHADOW_AUDIT') {
      logShadowAudit(ss, data);
    } else {
      logTrade(ss, data);
    }

    updateDashboard(ss);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Registrado com sucesso na planilha Bybit',
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

/**
 * Limpa dados preservando os cabeçalhos oficiais
 */
function resetAllSheets(ss) {
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (tradesSheet) tradesSheet.clear();
  initSheetTrades(ss, true);

  var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  if (shadowSheet) shadowSheet.clear();
  initSheetShadow(ss, true);
}

/**
 * Inicializa a aba '⚡ TRADES EXECUTADOS' (18 Colunas)
 */
function initSheetTrades(ss, forceRefresh) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || forceRefresh) {
    var headers = [
      'Data / Hora (Brasília)',
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
      'Resultado Real',
      'Lucro Real ($)',
      'Lucro Teórico Shadow ($)',
      'PnL Sem Trailing ($)',
      'Retorno (%)',
      'R-Múltiplo',
      'Regra Institucional / Detalhes'
    ];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
  }
  return sheet;
}

/**
 * Registra operação na aba '⚡ TRADES EXECUTADOS'
 */
function logTrade(ss, data) {
  var sheet = initSheetTrades(ss, false);

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var pnlUsdVal = Number(data.pnlUsd || 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var rMultipleVal = Number(data.rMultiple || 0);

  // Determina PnL Teórico Shadow
  var shadowTheoreticalPnl = 0;
  if (data.shadowTheoreticalPnl !== undefined && data.shadowTheoreticalPnl !== null) {
    shadowTheoreticalPnl = Number(data.shadowTheoreticalPnl);
  } else {
    var shadowModeDecision = String(data.shadowDecision || '').toUpperCase();

    if (!shadowModeDecision) {
      var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
      if (shadowSheet && shadowSheet.getLastRow() > 1) {
        var lastShadowRows = shadowSheet.getRange(Math.max(2, shadowSheet.getLastRow() - 20), 1, Math.min(20, shadowSheet.getLastRow() - 1), 5).getValues();
        for (var k = lastShadowRows.length - 1; k >= 0; k--) {
          if (String(lastShadowRows[k][1]).toUpperCase() === String(data.symbol || '').toUpperCase()) {
            shadowModeDecision = String(lastShadowRows[k][4] || '').toUpperCase();
            break;
          }
        }
      }
    }

    if (shadowModeDecision.indexOf('BLOQUEADO') !== -1) {
      shadowTheoreticalPnl = 0.00;
    } else {
      shadowTheoreticalPnl = pnlUsdVal;
    }
  }

  var isTrailing = String(data.trailingStopAtivo || 'SIM').toUpperCase() === 'SIM';
  var statusUpper = String(data.status || 'EXECUTADO').toUpperCase();

  var row = [
    formattedDate,
    data.clientName || 'Cliente Real (Bybit)',
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    String(data.orderType || 'MARKET').toUpperCase(),
    Number(data.entryPrice || 0),
    Number(data.qty || 0),
    Number(data.stopLoss || 0),
    Number(data.takeProfit || 0),
    isTrailing ? 'ATIVO 🚀' : 'INATIVO ⚪',
    statusUpper,
    data.outcome || (pnlUsdVal > 0 ? 'GREEN 🟢' : (pnlUsdVal < 0 ? 'RED 🔴' : 'EM ANDAMENTO ⏳')),
    pnlUsdVal,
    shadowTheoreticalPnl,
    data.pnlTeoricoSemTrailing || (isTrailing ? 'Alvo Fixo: +2.50% | SL: -1.00%' : 'Executando Alvo Fixo'),
    pnlPctVal,
    rMultipleVal,
    data.errorMsg || 'Executado via CCXT Bybit Linear Perpetuals'
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // 1. Direção (Coluna 4)
  var sideCell = sheet.getRange(lastRow, 4);
  if (String(data.side).toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // 2. Tipo Ordem (Coluna 5)
  var typeCell = sheet.getRange(lastRow, 5);
  if (String(data.orderType).toUpperCase().indexOf('LIMIT') !== -1) {
    typeCell.setBackground('#dbeafe').setFontColor('#1d4ed8').setFontWeight('bold');
  } else {
    typeCell.setBackground('#f1f5f9').setFontColor('#475569');
  }

  // 3. Trailing Stop (Coluna 10)
  var tsCell = sheet.getRange(lastRow, 10);
  if (isTrailing) {
    tsCell.setBackground('#f0fdf4').setFontColor('#166534').setFontWeight('bold');
  } else {
    tsCell.setBackground('#f8fafc').setFontColor('#64748b');
  }

  // 4. Status (Coluna 11)
  var statusCell = sheet.getRange(lastRow, 11);
  if (statusUpper.indexOf('WIN') !== -1 || statusUpper === 'EXECUTADO' || statusUpper === 'OK') {
    statusCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (statusUpper.indexOf('ABERTO') !== -1 || statusUpper.indexOf('ANDAMENTO') !== -1) {
    statusCell.setBackground('#e0f2fe').setFontColor('#0369a1').setFontWeight('bold');
  } else if (statusUpper.indexOf('BLOQUEADO') !== -1) {
    statusCell.setBackground('#fef3c7').setFontColor('#b45309').setFontWeight('bold');
  } else {
    statusCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // 5. Resultado Real (Coluna 12)
  var outcomeCell = sheet.getRange(lastRow, 12);
  var outStr = String(data.outcome || '').toUpperCase();
  if (outStr.indexOf('GREEN') !== -1 || pnlUsdVal > 0) {
    outcomeCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outStr.indexOf('RED') !== -1 || pnlUsdVal < 0) {
    outcomeCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outcomeCell.setBackground('#fef3c7').setFontColor('#92400e').setFontWeight('bold');
  }

  // 6. Formatações Numéricas
  sheet.getRange(lastRow, 6).setNumberFormat('$#,##0.00'); // Preço Entrada
  sheet.getRange(lastRow, 8).setNumberFormat('$#,##0.00'); // Stop Loss
  sheet.getRange(lastRow, 9).setNumberFormat('$#,##0.00'); // Take Profit
  sheet.getRange(lastRow, 13).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"'); // Lucro Real $

  var theoCell = sheet.getRange(lastRow, 14);
  theoCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"'); // Lucro Teórico Shadow $
  if (shadowTheoreticalPnl > pnlUsdVal) {
    theoCell.setBackground('#f3e8ff').setFontColor('#7e22ce').setFontWeight('bold');
  } else if (shadowTheoreticalPnl > 0) {
    theoCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (shadowTheoreticalPnl < 0) {
    theoCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  sheet.getRange(lastRow, 16).setNumberFormat('+0.00%;-0.00%;0.00%'); // Retorno %
  sheet.getRange(lastRow, 17).setNumberFormat('+0.0"R";-0.0"R";0.0"R"'); // R-Múltiplo

  sheet.autoResizeColumns(1, 18);
}

/**
 * Inicializa a aba '🛡️ AUDITORIA SHADOW MODE' (14 Colunas)
 */
function initSheetShadow(ss, forceRefresh) {
  var name = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0 || forceRefresh) {
    var headers = [
      'Data / Hora (Brasília)',
      'Par Avaliado',
      'Direção',
      'Modo Tradicional',
      'Decisão Shadow Mode',
      'Regra Institucional / Gatilho',
      'Spread L2 Bybit (Bps)',
      'Risco Global USDT (R)',
      'Desfecho Real',
      'Retorno (%)',
      'Impacto Real ($)',
      'Lucro Teórico Shadow ($)',
      'R-Múltiplo',
      'Veredito Estrutural de Segurança'
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

/**
 * Registra avaliação na aba '🛡️ AUDITORIA SHADOW MODE'
 */
function logShadowAudit(ss, data) {
  var sheet = initSheetShadow(ss, false);

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var pnlUsdVal = Number(data.pnlUsd || 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var rMultipleVal = Number(data.rMultiple || 0);

  var isBlocked = String(data.newMode || '').toUpperCase().indexOf('BLOQUEADO') !== -1;
  var theoreticalPnl = isBlocked ? 0.00 : pnlUsdVal;

  var row = [
    formattedDate,
    data.symbol || '',
    String(data.side || '').toUpperCase(),
    data.oldMode || 'PADRÃO',
    data.newMode || 'PERMITIDO',
    data.reasons || 'Confluência de Absorção L2 aprovada',
    Number(data.spreadPips || 0),
    Number(data.usdExposureR || 0),
    data.outcome || (pnlUsdVal > 0 ? 'GREEN 🟢' : (pnlUsdVal < 0 ? 'RED 🔴' : 'EM ANDAMENTO ⏳')),
    pnlPctVal,
    pnlUsdVal,
    theoreticalPnl,
    rMultipleVal,
    data.safetyVerdict || 'Monitorando saída...'
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  var evalCell = sheet.getRange(lastRow, 5);
  if (isBlocked) {
    evalCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    evalCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  }

  var outcomeCell = sheet.getRange(lastRow, 9);
  var outStr = String(data.outcome || '').toUpperCase();
  if (outStr.indexOf('GREEN') !== -1 || pnlUsdVal > 0) {
    outcomeCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outStr.indexOf('RED') !== -1 || pnlUsdVal < 0) {
    outcomeCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outcomeCell.setBackground('#fef3c7').setFontColor('#92400e').setFontWeight('bold');
  }

  var verdictCell = sheet.getRange(lastRow, 14);
  var verdStr = String(data.safetyVerdict || '').toUpperCase();
  if (verdStr.indexOf('SALVOU') !== -1) {
    verdictCell.setBackground('#f3e8ff').setFontColor('#7e22ce').setFontWeight('bold');
  } else if (verdStr.indexOf('PERFEITA') !== -1) {
    verdictCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (verdStr.indexOf('FALSO POSITIVO') !== -1 || verdStr.indexOf('RISCO NÃO EVITADO') !== -1) {
    verdictCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    verdictCell.setBackground('#f1f5f9').setFontColor('#475569');
  }

  sheet.getRange(lastRow, 10).setNumberFormat('+0.00%;-0.00%;0.00%');
  sheet.getRange(lastRow, 11).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 12).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  sheet.getRange(lastRow, 13).setNumberFormat('+0.0"R";-0.0"R";0.0"R"');

  sheet.autoResizeColumns(1, 14);
}

/**
 * Atualiza o Painel Quantitativo na aba '📊 PAINEL & SAÚDE QUANT'
 */
function updateDashboard(ss) {
  var name = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name, 0);

  sheet.setTabColor('#10b981');
  sheet.clear();

  // Cabeçalho Principal
  sheet.getRange('A1:F1').merge()
    .setValue('MARKETFLOW PRO — MONITORAMENTO QUANTITATIVO & SHADOW AUDITOR')
    .setFontSize(13)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#38bdf8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  var now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange('A2:F2').merge()
    .setValue('Status: 🟢 24/7 ONLINE | Conexão: Bybit Linear Perpetuals | Sincronizado: ' + now)
    .setFontSize(9)
    .setBackground('#1e293b')
    .setFontColor('#94a3b8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(2, 24);

  // Leitura da aba de Trades
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  var tradesCount = tradesSheet ? Math.max(0, tradesSheet.getLastRow() - 1) : 0;

  var greenCount = 0;
  var redCount = 0;
  var totalRealPnl = 0;
  var totalTheoreticalPnl = 0;

  if (tradesSheet && tradesCount > 0) {
    var maxCols = Math.max(18, tradesSheet.getLastColumn());
    var rows = tradesSheet.getRange(2, 1, tradesCount, maxCols).getValues();
    for (var i = 0; i < rows.length; i++) {
      var outcome = String(rows[i][11] || '').toUpperCase(); // Coluna 12 (Resultado Real)
      var realPnl = Number(rows[i][12] || 0);                  // Coluna 13 (Lucro Real)
      var theoPnl = Number(rows[i][13] !== undefined && rows[i][13] !== '' ? rows[i][13] : realPnl); // Coluna 14

      if (outcome.indexOf('GREEN') !== -1 || realPnl > 0) greenCount++;
      else if (outcome.indexOf('RED') !== -1 || realPnl < 0) redCount++;
      totalRealPnl += realPnl;
      totalTheoreticalPnl += theoPnl;
    }
  }

  var closedTrades = greenCount + redCount;
  var winRateReal = closedTrades > 0 ? (greenCount / closedTrades) * 100 : 0;

  // Leitura da aba Shadow Mode
  var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  var shadowBlocks = 0;
  var capitalSaved = 0;

  if (shadowSheet && shadowSheet.getLastRow() > 1) {
    var shadowCols = Math.max(14, shadowSheet.getLastColumn());
    var shadowRows = shadowSheet.getRange(2, 1, shadowSheet.getLastRow() - 1, shadowCols).getValues();
    for (var j = 0; j < shadowRows.length; j++) {
      var decision = String(shadowRows[j][4] || '').toUpperCase();
      var verdict = String(shadowRows[j][shadowRows[j].length - 1] || shadowRows[j][13] || '').toUpperCase();
      var impact = Number(shadowRows[j][10] || 0);

      if (decision.indexOf('BLOQUEADO') !== -1) shadowBlocks++;
      if (verdict.indexOf('SALVOU') !== -1) capitalSaved += Math.abs(impact);
    }
  }

  var shadowAlpha = totalTheoreticalPnl - totalRealPnl;

  // ── LINHA 1 DE CARDS: FLUXO OPERACIONAL ──
  sheet.getRange('A4:B4').merge().setValue('TOTAL DE OPERAÇÕES').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A5:B5').merge().setValue(tradesCount).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('TRADES GREEN 🟢').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  sheet.getRange('C5:D5').merge().setValue(greenCount).setFontSize(22).setFontWeight('bold').setFontColor('#15803d').setHorizontalAlignment('center');

  sheet.getRange('E4:F4').merge().setValue('TRADES RED 🔴').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('E5:F5').merge().setValue(redCount).setFontSize(22).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center');

  sheet.setRowHeight(4, 24);
  sheet.setRowHeight(5, 38);

  // ── LINHA 2 DE CARDS: BALANÇO FINANCEIRO ──
  sheet.getRange('A7:B7').merge().setValue('TAXA DE ACERTO REAL').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A8:B8').merge().setValue(winRateReal.toFixed(1) + '%').setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(winRateReal >= 50 ? '#15803d' : '#b91c1c');

  sheet.getRange('C7:D7').merge().setValue('SALDO REAL ACUMULADO ($)').setFontWeight('bold').setBackground('#e2e8f0').setHorizontalAlignment('center');
  var realCell = sheet.getRange('C8:D8').merge().setValue(totalRealPnl).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');
  realCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(totalRealPnl >= 0 ? '#15803d' : '#b91c1c');

  sheet.getRange('E7:F7').merge().setValue('SALDO TEÓRICO SHADOW ($)').setFontWeight('bold').setBackground('#f3e8ff').setFontColor('#7e22ce').setHorizontalAlignment('center');
  var theoCell = sheet.getRange('E8:F8').merge().setValue(totalTheoreticalPnl).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');
  theoCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"').setFontColor(totalTheoreticalPnl >= 0 ? '#7e22ce' : '#b91c1c');

  sheet.setRowHeight(7, 24);
  sheet.setRowHeight(8, 38);

  // ── LINHA 3 DE CARDS: ALPHA E ECONOMIA ──
  sheet.getRange('A10:B10').merge().setValue('SINAIS FILTRADOS / BLOQUEADOS').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('A11:B11').merge().setValue(shadowBlocks).setFontSize(20).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center');

  sheet.getRange('C10:D10').merge().setValue('CAPITAL POUPADO PELO SHADOW').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  var savedCell = sheet.getRange('C11:D11').merge().setValue(capitalSaved).setFontSize(20).setFontWeight('bold').setFontColor('#15803d').setHorizontalAlignment('center');
  savedCell.setNumberFormat('$#,##0.00');

  sheet.getRange('E10:F10').merge().setValue('DIFERENCIAL ALPHA ($)').setFontWeight('bold').setBackground('#ede9fe').setFontColor('#6d28d9').setHorizontalAlignment('center');
  var alphaCell = sheet.getRange('E11:F11').merge().setValue(shadowAlpha).setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center');
  alphaCell.setNumberFormat('+$#,##0.00;-$#,##0.00;"$0.00"').setFontColor(shadowAlpha >= 0 ? '#15803d' : '#b91c1c');

  sheet.setRowHeight(10, 24);
  sheet.setRowHeight(11, 36);

  // Bloco de Parâmetros
  sheet.getRange('A13:F13').merge().setValue('PARAMETRIZAÇÃO QUANTITATIVA ATIVA (BYBIT LINEAR)').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(13, 26);

  var params = [
    ['Corretora Oficial', 'Bybit Contratos Perpétuos Lineares (USDT)', 'Modo de Margem', 'Isolada (Isolated 10x)'],
    ['Pares Cripto Ativos', 'BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT', 'Risco por Trade', '1.0% Risco Travado na Banca Real'],
    ['Stop Loss Técnico', '1.00% (Protegido de ruídos e spreads)', 'Take Profit (Alvo)', '2.50% (Assimetria Positiva 2.5R)'],
    ['Trailing Stop', 'ATIVO (Gatilho: 80% do alvo | Recuo: 20%)', 'Shadow Mode', 'ATIVO (Filtro e Auditoria L2)']
  ];

  for (var r = 0; r < params.length; r++) {
    sheet.getRange(14 + r, 1).setValue(params[r][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(14 + r, 2, 1, 2).merge().setValue(params[r][1]).setBackground('#ffffff');
    sheet.getRange(14 + r, 4).setValue(params[r][2]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(14 + r, 5, 1, 2).merge().setValue(params[r][3]).setBackground('#ffffff');
    sheet.setRowHeight(14 + r, 24);
  }

  sheet.autoResizeColumns(1, 6);
}

/**
 * Estilização padronizada de cabeçalhos
 */
function formatHeaderRow(sheet, bgHex, fontHex) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  header.setBackground(bgHex || '#0f172a');
  header.setFontColor(fontHex || '#ffffff');
  header.setFontWeight('bold');
  header.setFontSize(10);
  header.setHorizontalAlignment('center');
  header.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
}