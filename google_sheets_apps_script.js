/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO — GOOGLE APPS SCRIPT OFICIAL & 100% VINCULADO
 * ==============================================================================
 * 
 * PLANILHA CONECTADA:
 * ID: 1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA
 * Link: https://docs.google.com/spreadsheets/d/1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA/edit
 * 
 * URL DO APP DA WEB:
 * https://script.google.com/macros/s/AKfycbzMTad90G0F_-VqJMRbPeoHqazT_-R5MqR4ZmYswyCII-K0vslKiWV_BuB2nIpu9tFkkQ/exec
 * 
 * ==============================================================================
 */

// 🔒 ID fixo da sua planilha Google
var SPREADSHEET_ID = '1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA';

/**
 * Função segura para obter a planilha ativa
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
    throw new Error('Não foi possível abrir a planilha. Verifique as permissões para o ID: ' + SPREADSHEET_ID);
  }
}

/**
 * ⚡ FUNÇÃO DE INICIALIZAÇÃO EM 1 CLIQUE
 * Selecione esta função no menu suspenso e clique em '▶ Executar' para criar e formatar todas as abas agora!
 */
function setupInicial() {
  var ss = getSpreadsheet();
  
  // 1. Criar e formatar as abas principais
  initSheetTrades(ss, true);
  initSheetShadow(ss, true);
  updateDashboard(ss);

  Logger.log('✅ Configuração estrutural concluída com sucesso na planilha ID: ' + SPREADSHEET_ID);
}

/**
 * Webhook GET — responde status se acessado via navegador
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
 * Webhook POST — Recebe os disparos do robô e registra em tempo real
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
    if (data.type === 'RESET_SESSION' || data.type === 'RESET') {
      resetAllSheets(ss);
      updateDashboard(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Sessão da planilha zerada com sucesso',
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'TRADE') {
      logTrade(ss, data);
    } else if (data.type === 'SHADOW_AUDIT') {
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
 * Zera os dados das abas de histórico mantendo os cabeçalhos oficiais intactos
 */
function resetAllSheets(ss) {
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  if (tradesSheet && tradesSheet.getLastRow() > 1) {
    tradesSheet.deleteRows(2, tradesSheet.getLastRow() - 1);
  } else if (!tradesSheet) {
    initSheetTrades(ss, true);
  }

  var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  if (shadowSheet && shadowSheet.getLastRow() > 1) {
    shadowSheet.deleteRows(2, shadowSheet.getLastRow() - 1);
  } else if (!shadowSheet) {
    initSheetShadow(ss, true);
  }
}

/**
 * Inicializa aba '⚡ TRADES EXECUTADOS'
 */
function initSheetTrades(ss, forceRefresh) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  
  if (sheet.getLastRow() === 0 || forceRefresh) {
    var headers = [
      'Data / Hora (Brasília)',
      'Conta / Origem',
      'Par Bybit',
      'Direção',
      'Preço Entrada ($)',
      'Volume (Qty)',
      'Stop Loss ($)',
      'Take Profit ($)',
      'Status',
      'Resultado Real',
      'Lucro / Prejuízo ($)',
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

  var row = [
    formattedDate,
    data.clientName || 'Cliente Real (Bybit)',
    data.symbol || '',
    (data.side || '').toUpperCase(),
    Number(data.entryPrice || 0),
    Number(data.qty || 0),
    Number(data.stopLoss || 0),
    Number(data.takeProfit || 0),
    (data.status || 'EXECUTADO').toUpperCase(),
    data.outcome || (pnlUsdVal > 0 ? 'GREEN 🟢' : (pnlUsdVal < 0 ? 'RED 🔴' : 'EM ANDAMENTO ⏳')),
    pnlUsdVal,
    pnlPctVal,
    rMultipleVal,
    data.errorMsg || 'Executado via CCXT Bybit Linear Perpetuals'
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // 1. Cor de Direção
  var sideCell = sheet.getRange(lastRow, 4);
  if (String(data.side).toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // 2. Cor de Status
  var stUpper = String(data.status || '').toUpperCase();
  var statusCell = sheet.getRange(lastRow, 9);
  if (stUpper.indexOf('WIN') !== -1 || stUpper === 'EXECUTADO' || stUpper === 'OK' || stUpper.indexOf('SUCESSO') !== -1) {
    statusCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (stUpper.indexOf('ABERTO') !== -1) {
    statusCell.setBackground('#e0f2fe').setFontColor('#0369a1').setFontWeight('bold');
  } else {
    statusCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // 3. Cor de Resultado Real (GREEN / RED)
  var outcomeCell = sheet.getRange(lastRow, 10);
  var outStr = String(data.outcome || '').toUpperCase();
  if (outStr.indexOf('GREEN') !== -1 || pnlUsdVal > 0) {
    outcomeCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outStr.indexOf('RED') !== -1 || pnlUsdVal < 0) {
    outcomeCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outcomeCell.setBackground('#fef3c7').setFontColor('#92400e').setFontWeight('bold');
  }

  // 4. Formatação de Moedas e Números
  sheet.getRange(lastRow, 5).setNumberFormat('$#,##0.00'); // Preço Entrada
  sheet.getRange(lastRow, 7).setNumberFormat('$#,##0.00'); // Stop Loss
  sheet.getRange(lastRow, 8).setNumberFormat('$#,##0.00'); // Take Profit
  sheet.getRange(lastRow, 11).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"'); // P&L $
  sheet.getRange(lastRow, 12).setNumberFormat('+0.00%;-0.00%;0.00%'); // Retorno %
  sheet.getRange(lastRow, 13).setNumberFormat('+0.0"R";-0.0"R";0.0"R"'); // R-Múltiplo

  sheet.autoResizeColumns(1, 14);
}

/**
 * Inicializa aba '🛡️ AUDITORIA SHADOW MODE'
 */
function initSheetShadow(ss, forceRefresh) {
  var name = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

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
      'Impacto Financeiro ($)',
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
 * Registra avaliação quantitativa e desfecho na aba '🛡️ AUDITORIA SHADOW MODE'
 */
function logShadowAudit(ss, data) {
  var sheet = initSheetShadow(ss, false);

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var pnlUsdVal = Number(data.pnlUsd || 0);
  var pnlPctVal = Number(data.pnlPct || 0) / 100;
  var rMultipleVal = Number(data.rMultiple || 0);

  var row = [
    formattedDate,
    data.symbol || '',
    (data.side || '').toUpperCase(),
    data.oldMode || 'PADRÃO',
    data.newMode || 'PERMITIDO',
    data.reasons || 'Confluência de Absorção L2 aprovada',
    Number(data.spreadPips || 0),
    Number(data.usdExposureR || 0),
    data.outcome || (pnlUsdVal > 0 ? 'GREEN 🟢' : (pnlUsdVal < 0 ? 'RED 🔴' : 'EM ANDAMENTO ⏳')),
    pnlPctVal,
    pnlUsdVal,
    rMultipleVal,
    data.safetyVerdict || 'Monitorando saída...'
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // 1. Cor Decisão Pré-Trade (BLOQUEADO / PERMITIDO)
  var evalCell = sheet.getRange(lastRow, 5);
  if (String(data.newMode).indexOf('BLOQUEADO') !== -1) {
    evalCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    evalCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  }

  // 2. Cor Desfecho Real (GREEN / RED)
  var outcomeCell = sheet.getRange(lastRow, 9);
  var outStr = String(data.outcome || '').toUpperCase();
  if (outStr.indexOf('GREEN') !== -1 || pnlUsdVal > 0) {
    outcomeCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (outStr.indexOf('RED') !== -1 || pnlUsdVal < 0) {
    outcomeCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    outcomeCell.setBackground('#fef3c7').setFontColor('#92400e').setFontWeight('bold');
  }

  // 3. Cor Veredito Estrutural de Segurança
  var verdictCell = sheet.getRange(lastRow, 13);
  var verdStr = String(data.safetyVerdict || '').toUpperCase();
  if (verdStr.indexOf('SALVOU') !== -1) {
    verdictCell.setBackground('#f3e8ff').setFontColor('#7e22ce').setFontWeight('bold'); // Roxo Realce: Salvou Capital!
  } else if (verdStr.indexOf('PERFEITA') !== -1) {
    verdictCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (verdStr.indexOf('FALSO POSITIVO') !== -1 || verdStr.indexOf('RISCO NÃO EVITADO') !== -1) {
    verdictCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    verdictCell.setBackground('#f1f5f9').setFontColor('#475569');
  }

  // 4. Formatações Numéricas
  sheet.getRange(lastRow, 10).setNumberFormat('+0.00%;-0.00%;0.00%'); // Retorno %
  sheet.getRange(lastRow, 11).setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"'); // Impacto $
  sheet.getRange(lastRow, 12).setNumberFormat('+0.0"R";-0.0"R";0.0"R"'); // R-Múltiplo

  sheet.autoResizeColumns(1, 13);
}

/**
 * Constrói o Painel Executivo Estrutural na aba '📊 PAINEL & SAÚDE QUANT'
 */
function updateDashboard(ss) {
  var name = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, 0);
  }

  sheet.setTabColor('#10b981');
  sheet.clear();

  // Título Principal
  sheet.getRange('A1:F1').merge()
    .setValue('MARKETFLOW PRO — MONITORAMENTO QUANTITATIVO & SHADOW AUDITOR')
    .setFontSize(13)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#38bdf8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  // Sub-header
  var now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange('A2:F2').merge()
    .setValue('Status: 🟢 24/7 ONLINE | Conexão: Bybit Linear Perpetuals | Última Atualização: ' + now)
    .setFontSize(9)
    .setBackground('#1e293b')
    .setFontColor('#94a3b8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(2, 24);

  // Leitura e Cálculos Dinâmicos Diretos da Aba de Trades
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  var tradesCount = tradesSheet ? Math.max(0, tradesSheet.getLastRow() - 1) : 0;

  var greenCount = 0;
  var redCount = 0;
  var totalNetPnl = 0;

  if (tradesSheet && tradesCount > 0) {
    var rows = tradesSheet.getRange(2, 1, tradesCount, 13).getValues();
    for (var i = 0; i < rows.length; i++) {
      var outcome = String(rows[i][9] || '').toUpperCase();
      var pnl = Number(rows[i][10] || 0);

      if (outcome.indexOf('GREEN') !== -1 || pnl > 0) {
        greenCount++;
      } else if (outcome.indexOf('RED') !== -1 || pnl < 0) {
        redCount++;
      }
      totalNetPnl += pnl;
    }
  }

  var closedTrades = greenCount + redCount;
  var winRate = closedTrades > 0 ? (greenCount / closedTrades) * 100 : 0;

  // Leitura e Cálculos Dinâmicos da Aba de Shadow Mode
  var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  var shadowBlocks = 0;
  var capitalSaved = 0;

  if (shadowSheet && shadowSheet.getLastRow() > 1) {
    var shadowRows = shadowSheet.getRange(2, 1, shadowSheet.getLastRow() - 1, 13).getValues();
    for (var j = 0; j < shadowRows.length; j++) {
      var decision = String(shadowRows[j][4] || '').toUpperCase();
      var verdict = String(shadowRows[j][12] || '').toUpperCase();
      var impact = Number(shadowRows[j][10] || 0);

      if (decision.indexOf('BLOQUEADO') !== -1) {
        shadowBlocks++;
      }
      if (verdict.indexOf('SALVOU') !== -1) {
        capitalSaved += Math.abs(impact);
      }
    }
  }

  // ── LINHA 1 DE CARTÕES: FLUXO OPERACIONAL ──
  sheet.getRange('A4:B4').merge().setValue('TOTAL DE OPERAÇÕES').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A5:B5').merge().setValue(tradesCount).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('TRADES GREEN 🟢 (LUCROS)').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  sheet.getRange('C5:D5').merge().setValue(greenCount).setFontSize(22).setFontWeight('bold').setFontColor('#15803d').setHorizontalAlignment('center');

  sheet.getRange('E4:F4').merge().setValue('TRADES RED 🔴 (PREJUÍZOS)').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('E5:F5').merge().setValue(redCount).setFontSize(22).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center');

  sheet.setRowHeight(4, 24);
  sheet.setRowHeight(5, 38);

  // ── LINHA 2 DE CARTÕES: EFICIÊNCIA & PROTEÇÃO SHADOW ──
  sheet.getRange('A7:B7').merge().setValue('TAXA DE ACERTO (WIN RATE)').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A8:B8').merge().setValue(winRate.toFixed(1) + '%').setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(winRate >= 50 ? '#15803d' : '#b91c1c');

  sheet.getRange('C7:D7').merge().setValue('LUCRO LÍQUIDO ACUMULADO ($)').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  var pnlCell = sheet.getRange('C8:D8').merge();
  pnlCell.setValue(totalNetPnl).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');
  pnlCell.setNumberFormat('$#,##0.00;[Red]($#,##0.00);"$0.00"');
  if (totalNetPnl >= 0) pnlCell.setFontColor('#15803d'); else pnlCell.setFontColor('#b91c1c');

  sheet.getRange('E7:F7').merge().setValue('CAPITAL SALVO PELO SHADOW MODE').setFontWeight('bold').setBackground('#f3e8ff').setFontColor('#7e22ce').setHorizontalAlignment('center');
  var savedCell = sheet.getRange('E8:F8').merge();
  savedCell.setValue(capitalSaved).setFontSize(22).setFontWeight('bold').setFontColor('#7e22ce').setHorizontalAlignment('center');
  savedCell.setNumberFormat('$#,##0.00');

  sheet.setRowHeight(7, 24);
  sheet.setRowHeight(8, 38);

  // Bloco de Parametrização Institucional
  sheet.getRange('A10:F10').merge().setValue('PARAMETRIZAÇÃO QUANTITATIVA ATIVA NO SERVIDOR (BYBIT LINEAR)').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(10, 26);

  var params = [
    ['Corretora Oficial', 'Bybit Contratos Perpétuos Lineares (USDT)', 'Modo de Margem', 'Isolada (Isolated 10x)'],
    ['Pares Cripto Ativos', 'BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT', 'Risco por Trade', '1.0% Risco Travado na Banca Real'],
    ['Stop Loss Técnico', '1.00% (Protegido de ruídos e spreads)', 'Take Profit (Alvo)', '2.50% (Assimetria Positiva de 2.5R)'],
    ['Teto de Spread L2', '3.0 bps (0.030% máx na Bybit)', 'Shadow Mode Audit', 'ATIVO (Cruzamento de GREEN/RED em tempo real)']
  ];

  for (var r = 0; r < params.length; r++) {
    sheet.getRange(11 + r, 1).setValue(params[r][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(11 + r, 2, 1, 2).merge().setValue(params[r][1]).setBackground('#ffffff');
    sheet.getRange(11 + r, 4).setValue(params[r][2]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(11 + r, 5, 1, 2).merge().setValue(params[r][3]).setBackground('#ffffff');
    sheet.setRowHeight(11 + r, 24);
  }

  sheet.autoResizeColumns(1, 6);
}

/**
 * Estilização moderna de cabeçalhos de tabela
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
