/*
 * MARKETFLOW — PATCH V4 DO WEBHOOK (Google Apps Script)
 *
 * COMO APLICAR
 * 1. Abra a planilha > Extensões > Apps Script.
 * 2. Mantenha todo o arquivo V3.1 atual.
 * 3. Substitua SOMENTE a função doPost(e) por MFWebhook_doPost(e) abaixo,
 *    renomeando-a para doPost(e), e cole as demais funções deste arquivo no fim.
 * 4. Implante uma nova versão do Web App e use a URL terminada em /exec.
 *
 * O patch continua usando as funções V3 existentes: getSpreadsheet, logTrade,
 * logShadowAudit, logMasterMirrorComparison, resetAllSheets, updateDashboard e
 * scheduleDashboardRefresh. Não apaga dados nem recria o painel.
 *
 * SEGURANÇA GRADUAL
 * - Primeiro configure GOOGLE_SHEETS_WEB_APP_URL no Railway e publique este patch.
 * - Depois configure o mesmo segredo em Railway (GOOGLE_SHEETS_WEBHOOK_SECRET)
 *   e nas Propriedades do script (NEXUS_WEBHOOK_SECRET).
 * - Somente então defina REQUIRE_WEBHOOK_SIGNATURE=true nas Propriedades do script.
 */

function MFWebhook_doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var cache = CacheService.getScriptCache();
  var requestId = '';
  var cacheKey = '';

  try {
    var rawBody = MFWebhook_readBody(e);
    var data = JSON.parse(rawBody);
    MFWebhook_validateEvent(data);
    MFWebhook_validateSignature(data);

    requestId = MFWebhook_requestId(data);
    cacheKey = 'marketflow:sheet-event:' + requestId;

    if (!lock.tryLock(1000)) {
      return MFWebhook_response('retry', 'LOCK_BUSY', 'Planilha ocupada; tente novamente.', requestId, true);
    }
    lockAcquired = true;

    if (cache.get(cacheKey) === 'done') {
      return MFWebhook_response('success', 'DUPLICATE', 'Evento já processado.', requestId, false, { duplicate: true });
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
    }

    cache.put(cacheKey, 'done', 21600); // seis horas: protege contra retries duplicados
  } catch (err) {
    if (cacheKey) cache.remove(cacheKey);
    return MFWebhook_response('error', 'PROCESSING_ERROR', String(err), requestId, false);
  } finally {
    if (lockAcquired) lock.releaseLock();
  }

  try {
    // Esta operação pode criar/atualizar gatilho; não deve segurar o lock de escrita.
    scheduleDashboardRefresh(getSpreadsheet());
  } catch (scheduleError) {
    console.log('Registro salvo; atualização do painel será tentada depois: ' + scheduleError);
  }

  return MFWebhook_response('success', 'ACCEPTED', 'Registrado com sucesso.', requestId, false);
}

function MFWebhook_readBody(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Payload vazio');
  var raw = String(e.postData.contents);
  if (raw.length > 262144) throw new Error('Payload excede 256 KB');
  return raw;
}

function MFWebhook_validateEvent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Payload inválido');
  var allowed = {
    'TRADE': true,
    'SHADOW_AUDIT': true,
    'SHADOW_OPPORTUNITY': true,
    'RESET_SESSION': true,
    'RESET': true
  };
  if (!allowed[String(data.type || '')]) throw new Error('Tipo de evento não permitido');
}

function MFWebhook_requestId(data) {
  var value = String(data.requestId || data.tradeId || data.id || '');
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(value)) throw new Error('requestId ausente ou inválido');
  return value;
}

function MFWebhook_response(status, code, message, requestId, retryable, extra) {
  var body = {
    status: status,
    code: code,
    message: message,
    requestId: requestId || null,
    retryable: Boolean(retryable),
    timestamp: new Date().toISOString()
  };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) body[key] = extra[key];
    }
  }
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function MFWebhook_validateSignature(data) {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('REQUIRE_WEBHOOK_SIGNATURE') !== 'true') return;

  var secret = properties.getProperty('NEXUS_WEBHOOK_SECRET');
  if (!secret) throw new Error('NEXUS_WEBHOOK_SECRET não configurado');

  var timestamp = Number(data.signatureTimestamp);
  if (!isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300000) {
    throw new Error('Timestamp de assinatura inválido ou expirado');
  }
  if (!data.signature || typeof data.signature !== 'string') throw new Error('Assinatura ausente');

  var expected = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(MFWebhook_stableStringify(data, true), secret)
  );
  if (!MFWebhook_constantTimeEquals(expected, MFWebhook_normalizeBase64(data.signature))) {
    throw new Error('Assinatura inválida');
  }
}

function MFWebhook_normalizeBase64(value) {
  return String(value).replace(/-/g, '+').replace(/_/g, '/');
}

function MFWebhook_constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function MFWebhook_stableStringify(value, omitSignature) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
  if (Array.isArray(value)) {
    var values = [];
    for (var i = 0; i < value.length; i++) values.push(MFWebhook_stableStringify(value[i], false));
    return '[' + values.join(',') + ']';
  }
  if (typeof value === 'object') {
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      if ((omitSignature && key === 'signature') || typeof value[key] === 'undefined') continue;
      parts.push(JSON.stringify(key) + ':' + MFWebhook_stableStringify(value[key], false));
    }
    return '{' + parts.join(',') + '}';
  }
  return 'null';
}
