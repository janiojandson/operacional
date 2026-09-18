/**
 * ==============================================================================
 * 🚀 MARKETFLOW PRO — GOOGLE APPS SCRIPT DE INTEGRAÇÃO & AUDITORIA AUTOMÁTICA
 * ==============================================================================
 * 
 * Planilha ID: 1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA
 * URL: https://docs.google.com/spreadsheets/d/1eQZbBDskZGgPlaS8FmV0dtRhQEXS6jI48xbtXMKF8QA/edit
 * 
 * Este script recebe automaticamente os webhooks do MarketFlow Pro:
 * 1. TRADES EXECUTADOS (Disparos reais da Bybit com entradas, stops e alvos)
 * 2. AUDITORIA SHADOW MODE (Validação de risco, spread e correlação institucional)
 * 3. DASHBOARD DE SAÚDE QUANT (Resumo executivo de assertividade e volumes)
 * 
 * ──────────────────────────────────────────────────────────────────────────────
 * INSTRUÇÕES DE INSTALAÇÃO (1 MINUTO):
 * 1. Abra sua planilha Google no navegador.
 * 2. No menu superior, clique em: Extensões (Extensions) ➔ Apps Script.
 * 3. Apague qualquer código existente no editor e cole todo este arquivo.
 * 4. Clique no botão "Salvar" (ícone de disquete).
 * 5. Clique no botão azul "Implantar" (Deploy) ➔ "Nova implantação" (New deployment).
 * 6. Em "Selecione o tipo", escolha "App da Web" (Web app).
 * 7. Configure:
 *    - Descrição: MarketFlow Pro Webhook v2
 *    - Executar como: Eu (seu e-mail)
 *    - Quem pode acessar: Qualquer pessoa (Anyone) ➔ IMPORTANTE para receber os webhooks do servidor!
 * 8. Clique em "Implantar" e conceda as permissões solicitadas.
 * 9. Copie o URL do App da Web gerado (se for diferente da atual, atualizamos no backend).
 * ==============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Evita conflitos de concorrência com travas de até 10 segundos
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Payload vazio' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'TRADE') {
      logTrade(ss, data);
    } else if (data.type === 'SHADOW_AUDIT') {
      logShadowAudit(ss, data);
    } else {
      // Registro genérico
      logGeneric(ss, data);
    }

    updateDashboard(ss);

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Registrado com sucesso' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra operação na aba '⚡ TRADES EXECUTADOS'
 */
function logTrade(ss, data) {
  var sheetName = '⚡ TRADES EXECUTADOS';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = ['Data / Hora', 'Par (Symbol)', 'Direção', 'Preço Entrada', 'Quantidade', 'Stop Loss', 'Take Profit', 'Status', 'Mensagem / Detalhes'];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#0f172a');
  }

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var row = [
    formattedDate,
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
  
  // Cores condicionais na coluna Status
  var statusCell = sheet.getRange(lastRow, 8);
  if (data.status === 'EXECUTADO' || data.status === 'OK') {
    statusCell.setBackground('#dcfce7').setFontColor('#15803d').setFontWeight('bold');
  } else {
    statusCell.setBackground('#fee2e2').setFontColor('#b91c1c').setFontWeight('bold');
  }

  // Direção
  var sideCell = sheet.getRange(lastRow, 3);
  if ((data.side || '').toUpperCase() === 'BUY') {
    sideCell.setBackground('#dcfce7').setFontColor('#15803d');
  } else {
    sideCell.setBackground('#fee2e2').setFontColor('#b91c1c');
  }

  sheet.autoResizeColumns(1, 9);
}

/**
 * Registra avaliação na aba '🛡️ AUDITORIA SHADOW MODE'
 */
function logShadowAudit(ss, data) {
  var sheetName = '🛡️ AUDITORIA SHADOW MODE';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = ['Data / Hora', 'Par (Symbol)', 'Direção', 'Modo Antigo', 'Avaliação Shadow Mode', 'Motivo / Regra Disparada', 'Spread (Pips)', 'Risco USD (R)'];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#1e1b4b');
  }

  var formattedDate = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  var row = [
    formattedDate,
    data.symbol || '',
    (data.side || '').toUpperCase(),
    data.oldMode || 'PADRÃO',
    data.newMode || 'PERMITIDO',
    data.reasons || 'Confluência aprovada sem bloqueios',
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
 * Atualiza automaticamente a aba '📊 PAINEL & SAÚDE QUANT'
 */
function updateDashboard(ss) {
  var sheetName = '📊 PAINEL & SAÚDE QUANT';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName, 0); // Primeira aba
  }

  sheet.clear();
  sheet.setTabColor('#10b981');

  // Cabeçalho Principal
  sheet.getRange('A1:F1').merge()
    .setValue('MARKETFLOW PRO — CENTRAL DE SAÚDE QUANTITATIVA & EXECUÇÃO BYBIT')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#38bdf8')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  // Sub-header de status
  var now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange('A2:F2').merge()
    .setValue('Status: 🟢 24/7 ONLINE | Conexão: Bybit Linear Perpetuals | Última Atualização: ' + now)
    .setFontSize(9)
    .setBackground('#1e293b')
    .setFontColor('#94a3b8')
    .setHorizontalAlignment('center');
  sheet.setRowHeight(2, 24);

  // Cartões de Métricas
  sheet.getRange('A4:B4').merge().setValue('TOTAL DE TRADES REGISTRADOS').setFontWeight('bold').setBackground('#f1f5f9');
  sheet.getRange('A5:B5').merge().setFormula('=IFERROR(COUNTA(\'⚡ TRADES EXECUTADOS\'!A2:A), 0)').setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C4:D4').merge().setValue('TRADES EXECUTADOS COM SUCESSO').setFontWeight('bold').setBackground('#dcfce7').setFontColor('#15803d');
  sheet.getRange('C5:D5').merge().setFormula('=IFERROR(COUNTIF(\'⚡ TRADES EXECUTADOS\'!H2:H, "EXECUTADO"), 0)').setFontSize(18).setFontWeight('bold').setFontColor('#15803d').setHorizontalAlignment('center');

  sheet.getRange('E4:F4').merge().setValue('BLOQUEIOS PREVENTIVOS SHADOW').setFontWeight('bold').setBackground('#fee2e2').setFontColor('#b91c1c');
  sheet.getRange('E5:F5').merge().setFormula('=IFERROR(COUNTIF(\'🛡️ AUDITORIA SHADOW MODE\'!E2:E, "*BLOQUEADO*"), 0)').setFontSize(18).setFontWeight('bold').setFontColor('#b91c1c').setHorizontalAlignment('center');

  // Tabela de Configuração e Parâmetros Atuais
  sheet.getRange('A7:F7').merge().setValue('PARAMETRIZAÇÃO INSTITUCIONAL ATIVA').setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  
  var params = [
    ['Exchange Oficial', 'Bybit Contratos Perpétuos Lineares (USDT)', 'Modo de Margem', 'Isolada (Isolated 10x)'],
    ['Pares Cripto Ativos', 'BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT', 'Risco por Trade', '1.0% da Banca Real'],
    ['Stop Loss Técnico', '1.00% (Protegido contra ruído de spread)', 'Take Profit (Alvo)', '2.50% (Relação Assimétrica 2.5R)'],
    ['Regime Operacional', '24/7 Contínuo sem interrupção', 'Shadow Mode', 'ATIVO (Auditoria Silenciosa L2)']
  ];

  for (var r = 0; r < params.length; r++) {
    sheet.getRange(8 + r, 1).setValue(params[r][0]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(8 + r, 2, 1, 2).merge().setValue(params[r][1]);
    sheet.getRange(8 + r, 4).setValue(params[r][2]).setFontWeight('bold').setBackground('#f8fafc');
    sheet.getRange(8 + r, 5, 1, 2).merge().setValue(params[r][3]);
  }

  sheet.autoResizeColumns(1, 6);
}

/**
 * Formata linha de cabeçalho padrão
 */
function formatHeaderRow(sheet, bgHex) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  header.setBackground(bgHex || '#0f172a');
  header.setFontColor('#ffffff');
  header.setFontWeight('bold');
  header.setFontSize(10);
  header.setHorizontalAlignment('center');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);
}

/**
 * Teste manual dentro do próprio Apps Script
 */
function testWebhook() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        type: 'TRADE',
        symbol: 'BTC/USDT',
        side: 'BUY',
        entryPrice: 95400.50,
        qty: 0.081,
        stopLoss: 94446.50,
        takeProfit: 97785.50,
        status: 'EXECUTADO',
        errorMsg: 'Ordem de teste disparada com sucesso'
      })
    }
  };
  doPost(fakeEvent);
}
