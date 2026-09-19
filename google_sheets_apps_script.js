/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO — GOOGLE APPS SCRIPT OFICIAL & 100% VINCULADO
 * ==============================================================================
 * 
 * PLANILHA CONECTADA:
 * ID: 1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA
 * Link: https://docs.google.com/spreadsheets/d/1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA/edit
 * 
 * URL DO APP DA WEB (MANTIDA INALTERADA):
 * https://script.google.com/macros/s/AKfycbzMTad90G0F_-VqJMRbPeoHqazT_-R5MqR4ZmYswyCII-K0vslKiWV_BuB2nIpu9tFkkQ/exec
 * 
 * ==============================================================================
 */

// 🔒 ID fixo da sua planilha Google (garante funcionamento mesmo em script autônomo)
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
  
  // 1. Criar e formatar as 3 abas principais
  initSheetTrades(ss);
  initSheetShadow(ss);
  updateDashboard(ss);

  Logger.log('✅ Configuração concluída com sucesso na planilha ID: ' + SPREADSHEET_ID);
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
    // Trava de segurança para evitar concorrência simultânea
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Payload vazio' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = getSpreadsheet();

    if (data.type === 'TRADE') {
      logTrade(ss, data);
    } else if (data.type === 'SHADOW_AUDIT') {
      logShadowAudit(ss, data);
    } else {
      // Registro fallback
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
 * Inicializa aba '⚡ TRADES EXECUTADOS'
 */
function initSheetTrades(ss) {
  var name = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Data / Hora (Brasília)',
      'Conta / Origem',
      'Par Bybit',
      'Direção',
      'Preço Entrada ($)',
      'Volume (Qty)',
      'Stop Loss ($)',
      'Take Profit ($)',
      'Status na Corretora',
      'Detalhes / Ordem'
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#0f172a', '#38bdf8');
  }
  return sheet;
}

/**
 * Registra ordem real de cliente na aba '⚡ TRADES EXECUTADOS'
 */
function logTrade(ss, data) {
  var sheet = initSheetTrades(ss);

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
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
    data.errorMsg || 'Executado com sucesso via CCXT Bybit Linear'
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // Cores dinâmicas de Status
  var stUpper = String(data.status || '').toUpperCase();
  var statusCell = sheet.getRange(lastRow, 9);
  if (stUpper.indexOf('WIN') !== -1 || stUpper === 'EXECUTADO' || stUpper === 'OK' || stUpper.indexOf('SUCESSO') !== -1) {
    statusCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else if (stUpper.indexOf('ABERTO') !== -1) {
    statusCell.setBackground('#e0f2fe').setFontColor('#0369a1').setFontWeight('bold');
  } else {
    statusCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Cor de Direção
  var sideCell = sheet.getRange(lastRow, 4);
  if (String(data.side).toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Formatação de números e moedas
  sheet.getRange(lastRow, 5).setNumberFormat('$#,##0.00');
  sheet.getRange(lastRow, 7).setNumberFormat('$#,##0.00');
  sheet.getRange(lastRow, 8).setNumberFormat('$#,##0.00');

  sheet.autoResizeColumns(1, 10);
}

/**
 * Inicializa aba '🛡️ AUDITORIA SHADOW MODE'
 */
function initSheetShadow(ss) {
  var name = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    var headers = [
      'Data / Hora (Brasília)',
      'Par Avaliado',
      'Direção',
      'Modo Padrão',
      'Decisão Shadow Mode',
      'Regra Institucional / Motivo',
      'Spread L2 (Pips)',
      'Risco Global USD (R)'
    ];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#1e1b4b', '#a855f7');
  }
  return sheet;
}

/**
 * Registra avaliação quantitativa na aba '🛡️ AUDITORIA SHADOW MODE'
 */
function logShadowAudit(ss, data) {
  var sheet = initSheetShadow(ss);

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var row = [
    formattedDate,
    data.symbol || '',
    (data.side || '').toUpperCase(),
    data.oldMode || 'PADRÃO',
    data.newMode || 'PERMITIDO',
    data.reasons || 'Confluência de Absorção L2 aprovada',
    Number(data.spreadPips || 0),
    Number(data.usdExposureR || 0)
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  var evalCell = sheet.getRange(lastRow, 5);
  if (String(data.newMode).includes('BLOQUEADO')) {
    evalCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  } else {
    evalCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  }

  sheet.autoResizeColumns(1, 8);
}

/**
 * Constrói o Painel Executivo na aba '📊 PAINEL & SAÚDE QUANT'
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
    .setValue('MARKETFLOW PRO — MONITORAMENTO INSTITUCIONAL BYBIT')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#38bdf8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);

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

  // Cartões de Métricas Calculadas Diretamente (100% Imune a #ERROR! ou idioma)
  var tradesSheet = ss.getSheetByName('⚡ TRADES EXECUTADOS');
  var tradesCount = tradesSheet ? Math.max(0, tradesSheet.getLastRow() - 1) : 0;

  var successCount = 0;
  if (tradesSheet && tradesCount > 0) {
    var statuses = tradesSheet.getRange(2, 9, tradesCount, 1).getValues();
    for (var i = 0; i < statuses.length; i++) {
      var st = String(statuses[i][0]).toUpperCase();
      if (st === 'EXECUTADO' || st === 'OK' || st.indexOf('SUCESSO') !== -1 || st.indexOf('WIN') !== -1 || st.indexOf('ABERTO') !== -1) {
        successCount++;
      }
    }
  }

  var shadowSheet = ss.getSheetByName('🛡️ AUDITORIA SHADOW MODE');
  var shadowBlocks = 0;
  if (shadowSheet && shadowSheet.getLastRow() > 1) {
    var evals = shadowSheet.getRange(2, 5, shadowSheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < evals.length; j++) {
      if (String(evals[j][0]).includes('BLOQUEADO')) {
        shadowBlocks++;
      }
    }
  }

  sheet.getRange('A4:B4').merge().setValue('TOTAL DE DISPAROS REAIS').setFontWeight('bold').setBackground('#f1f5f9').setHorizontalAlignment('center');
  sheet.getRange('A5:B5').merge().setValue(tradesCount).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('TRADES EXECUTADOS COM SUCESSO').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d').setHorizontalAlignment('center');
  sheet.getRange('C5:D5').merge().setValue(successCount).setFontSize(22).setFontWeight('bold').setFontColor('#15803d').setHorizontalAlignment('center');

  sheet.getRange('E4:F4').merge().setValue('BLOQUEIOS PREVENTIVOS SHADOW').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c').setHorizontalAlignment('center');
  sheet.getRange('E5:F5').merge().setValue(shadowBlocks).setFontSize(22).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center');

  sheet.setRowHeight(4, 25);
  sheet.setRowHeight(5, 40);

  // Bloco de Parametrização Institucional
  sheet.getRange('A7:F7').merge().setValue('PARAMETRIZAÇÃO QUANTITATIVA ATIVA NO SERVIDOR').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(7, 28);

  var params = [
    ['Corretora Oficial', 'Bybit Contratos Perpétuos Lineares (USDT)', 'Modo de Margem', 'Isolada (Isolated 10x)'],
    ['Pares Cripto Ativos', 'BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT', 'Risco por Trade', '1.0% Risco Travado na Banca Real'],
    ['Stop Loss Técnico', '1.00% (Protegido de ruídos e spreads)', 'Take Profit (Alvo)', '2.50% (Assimetria Positiva de 2.5R)'],
    ['Regime Operacional', '24/7 Contínuo sem interrupção', 'Shadow Mode', 'ATIVO (Auditoria Silenciosa Pré-Trade)']
  ];

  for (var r = 0; r < params.length; r++) {
    sheet.getRange(8 + r, 1).setValue(params[r][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(8 + r, 2, 1, 2).merge().setValue(params[r][1]).setBackground('#ffffff');
    sheet.getRange(8 + r, 4).setValue(params[r][2]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(8 + r, 5, 1, 2).merge().setValue(params[r][3]).setBackground('#ffffff');
    sheet.setRowHeight(8 + r, 24);
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

/**
 * Teste Manual do Webhook (para verificar dentro do próprio editor)
 */
function testarWebhookCompleto() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        type: 'TRADE',
        clientName: 'Janio (Conta Principal Bybit)',
        symbol: 'BTC/USDT',
        side: 'BUY',
        entryPrice: 95450.00,
        qty: 0.081,
        stopLoss: 94495.50,
        takeProfit: 97836.25,
        status: 'EXECUTADO',
        errorMsg: 'Ordem de teste enviada com sucesso para a Bybit'
      })
    }
  };
  doPost(fakeEvent);
  Logger.log('Trade teste inserido com sucesso!');
}
