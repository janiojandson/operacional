import { PaperAccount, SimulatedTrade } from '../../../shared/paperTypes';
import { RISK_CONFIG } from '../config/riskConfig';

export type PostureAction =
  | { action: 'CLOSE'; symbol: string; rationale?: string }
  | { action: 'MOVE_STOP'; symbol: string; newStop: number; rationale?: string }
  | { action: 'MOVE_TARGET'; symbol: string; newTarget: number; rationale?: string }
  | { action: 'SCALE_OUT'; symbol: string; fraction: number; rationale?: string }
  | { action: 'ADJUST_POWER'; power: number; rationale?: string }
  | { action: 'SET_PAIR_ACTIVE'; symbol: string; active: boolean; rationale?: string };

export interface PostureSnapshot {
  account: PaperAccount;
  pairConfigs: Array<{ symbol: string; regime: string; temperature: string; powerMultiplier: number; isActiveForTrading: boolean }>;
  recentClosed: Array<{ symbol: string; type: string; netPnl: number; rMultiple: number; temperature: string; session: string; closeReason?: string }>;
}

export interface PostureDeps {
  getAccountState(): PaperAccount;
  closePosition(symbol: string, price: number, isMaker: boolean, reason?: SimulatedTrade['closeReason']): { success: boolean; pnl?: number };
  updateStopLoss(symbol: string, newStop: number): { success: boolean; reason?: string };
  updateTakeProfit(symbol: string, newTarget: number): { success: boolean; reason?: string };
  partialClose(symbol: string, closePrice: number, fraction: number): { success: boolean; reason?: string };
  setMinTemperature(t: number): void;
  getMinTemperature(): number;
  setActivePairs(pairs: string[]): void;
  getActivePairs(): string[];
  isDailyLockoutActive(): boolean;
}

export interface ApplyResult {
  applied: Array<{ action: PostureAction; detail: string }>;
  rejected: Array<{ action: PostureAction; reason: string }>;
}

const PAIR_WHITELIST = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'AVAX/USDT', 'LINK/USDT', 'ADA/USDT', 'NEAR/USDT', 'SUI/USDT', 'DOGE/USDT'];

function extractJson(text: string): any | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
}

export class AiPostureEngine {
  private enabled: boolean;
  private apiKey: string;
  private model: string;
  private baseUrls: string[];
  private timeoutMs: number;

  constructor() {
    this.enabled = RISK_CONFIG.AI_POSTURE_ENABLED;
    this.apiKey = process.env.OMNIROUTE_API_KEY || '';
    this.model = RISK_CONFIG.AI_POSTURE_MODEL || 'auto/best-coding';
    this.timeoutMs = RISK_CONFIG.AI_POSTURE_TIMEOUT_MS || 45000;
    // Prioridade: URL interna do Railway; fallback para a pública.
    this.baseUrls = [
      process.env.OMNIROUTE_BASE_URL_INTERNAL,
      process.env.OMNIROUTE_BASE_URL,
    ].filter((u): u is string => Boolean(u));
  }

  public isEnabled(): boolean {
    return this.enabled && this.baseUrls.length > 0 && Boolean(this.apiKey);
  }

  private buildPrompt(snapshot: PostureSnapshot): { system: string; user: string } {
    const open = snapshot.account.openPositions
      .map((p: SimulatedTrade) => `${p.symbol} ${p.type} entry=${p.entryPrice} stop=${p.stopLoss} tp=${p.takeProfit} cur=${p.currentPrice} pnl=${p.pnlUsd} power=${p.powerMultiplier}`)
      .join('\n') || '(nenhuma posição aberta)';
    const closed = snapshot.recentClosed
      .map((t) => `${t.symbol} ${t.type} net=${t.netPnl} r=${t.rMultiple} temp=${t.temperature} sess=${t.session}`)
      .join('\n') || '(sem trades fechados recentes)';
    const pairs = snapshot.pairConfigs
      .map((c) => `${c.symbol} regime=${c.regime} temp=${c.temperature} power=${c.powerMultiplier} ativo=${c.isActiveForTrading}`)
      .join('\n');

    const system = `Você é um especialista master-class de mercado e momento (SMC, Tape Reading, Order Flow) e gestor de risco de um motor quant de cripto (perpetuals). Sua função é ajustar a POSTURA das operações de forma cirúrgica e conservadora para melhorar desempenho e capturar oportunidades, sem violar os limites de risco.

REGRAS ABSOLUTAS:
- Responda SOMENTE um JSON válido, sem markdown, sem texto fora do JSON.
- Formato: {"actions":[{"action":"CLOSE","symbol":"BTC/USDT","rationale":"..."}]}
- Ações permitidas (action): CLOSE, MOVE_STOP, MOVE_TARGET, SCALE_OUT, ADJUST_POWER, SET_PAIR_ACTIVE.
  - CLOSE: fechar posição. symbol obrigatório.
  - MOVE_STOP: mover stop-loss APENAS para TRAVAR lucro (aproximar do preço). symbol + newStop (número).
  - MOVE_TARGET: ajustar take-profit. symbol + newTarget (número).
  - SCALE_OUT: reduzir parte da posição (fração 0.1 a 0.9). symbol + fraction.
  - ADJUST_POWER: ajustar a potência global (1.5 a 5.0). power (número).
  - SET_PAIR_ACTIVE: ativar/desativar um par. symbol + active (boolean).
- Se não houver ação claramente justificada, retorne {"actions":[]}.
- Nunca sugira alavancagem acima de 5x, nunca aumente o risco por trade acima de 1%. Você pode operar BUY e SELL conforme o momento.`;

    const user = `DADOS DA CONTA:
- Saldo: ${snapshot.account.balance.toFixed(2)} | PnL realizado: ${snapshot.account.realizedPnl.toFixed(2)} | Win rate: ${snapshot.account.winRate.toFixed(1)}% (${snapshot.account.totalTrades} trades)

POSIÇÕES ABERTAS:
${open}

ÚLTIMOS TRADES FECHADOS:
${closed}

PARES (regime/temperatura/potência):
${pairs}

Analise o momento e retorne as ações de postura em JSON (ou ações vazias).`;

    return { system, user };
  }

  public async consult(snapshot: PostureSnapshot): Promise<{ ok: boolean; raw: string; actions: PostureAction[]; error?: string }> {
    if (!this.isEnabled()) return { ok: false, raw: '', actions: [], error: 'AI_POSTURE_DESABILITADA_OU_SEM_CONFIG' };
    const { system, user } = this.buildPrompt(snapshot);

    for (const base of this.baseUrls) {
      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          console.warn(`[AiPosture] omniroute ${base} respondeu ${response.status}`);
          continue;
        }
        const data = (await response.json()) as any;
        const raw = data?.choices?.[0]?.message?.content || '';
        const parsed = extractJson(raw);
        const actions = Array.isArray(parsed?.actions) ? (parsed.actions as PostureAction[]) : [];
        return { ok: true, raw, actions };
      } catch (e: any) {
        console.warn(`[AiPosture] falha em ${base}: ${e.message}`);
      }
    }
    return { ok: false, raw: '', actions: [], error: 'OMNIROUTE_INDISPONIVEL' };
  }

  public applyActions(actions: PostureAction[], deps: PostureDeps): ApplyResult {
    const result: ApplyResult = { applied: [], rejected: [] };

    if (!this.enabled) {
      for (const action of actions) result.rejected.push({ action, reason: 'AI_POSTURE_KILLSWITCH' });
      return result;
    }
    if (deps.isDailyLockoutActive()) {
      for (const action of actions) result.rejected.push({ action, reason: 'LOCKOUT_ATIVO' });
      return result;
    }

    const account = deps.getAccountState();
    const openBySymbol = new Map(account.openPositions.map((p) => [p.symbol, p]));

    for (const action of actions) {
      try {
        switch (action.action) {
          case 'CLOSE': {
            const pos = openBySymbol.get(action.symbol);
            if (!pos) { result.rejected.push({ action, reason: 'SEM_POSICAO' }); break; }
            const r = deps.closePosition(action.symbol, pos.currentPrice, false, 'MARKET_EARLY_HARVEST');
            if (r.success) result.applied.push({ action, detail: `CLOSE ${action.symbol} pnl=${r.pnl}` });
            else result.rejected.push({ action, reason: 'CLOSE_FALHOU' });
            break;
          }
          case 'MOVE_STOP': {
            const pos = openBySymbol.get(action.symbol);
            if (!pos) { result.rejected.push({ action, reason: 'SEM_POSICAO' }); break; }
            const isBuy = pos.type === 'BUY';
            const tightening = isBuy ? action.newStop > pos.stopLoss && action.newStop <= pos.currentPrice
              : action.newStop < pos.stopLoss && action.newStop >= pos.currentPrice;
            if (!Number.isFinite(action.newStop) || !tightening) {
              result.rejected.push({ action, reason: 'STOP_NAO_TRAVA_LUCRO' });
              break;
            }
            const r = deps.updateStopLoss(action.symbol, action.newStop);
            if (r.success) result.applied.push({ action, detail: `MOVE_STOP ${action.symbol} -> ${action.newStop}` });
            else result.rejected.push({ action, reason: r.reason || 'UPDATE_STOP_FALHOU' });
            break;
          }
          case 'MOVE_TARGET': {
            const pos = openBySymbol.get(action.symbol);
            if (!pos) { result.rejected.push({ action, reason: 'SEM_POSICAO' }); break; }
            if (!Number.isFinite(action.newTarget)) { result.rejected.push({ action, reason: 'TARGET_INVALIDO' }); break; }
            const r = deps.updateTakeProfit(action.symbol, action.newTarget);
            if (r.success) result.applied.push({ action, detail: `MOVE_TARGET ${action.symbol} -> ${action.newTarget}` });
            else result.rejected.push({ action, reason: r.reason || 'UPDATE_TARGET_FALHOU' });
            break;
          }
          case 'SCALE_OUT': {
            const pos = openBySymbol.get(action.symbol);
            if (!pos) { result.rejected.push({ action, reason: 'SEM_POSICAO' }); break; }
            const f = Number(action.fraction);
            if (!Number.isFinite(f) || f <= 0 || f >= 1) { result.rejected.push({ action, reason: 'FRACAO_INVALIDA' }); break; }
            const r = deps.partialClose(action.symbol, pos.currentPrice, f);
            if (r.success) result.applied.push({ action, detail: `SCALE_OUT ${action.symbol} ${f}` });
            else result.rejected.push({ action, reason: r.reason || 'SCALE_OUT_FALHOU' });
            break;
          }
          case 'ADJUST_POWER': {
            const p = Number(action.power);
            if (!Number.isFinite(p)) { result.rejected.push({ action, reason: 'POWER_INVALIDO' }); break; }
            const clamped = Math.min(RISK_CONFIG.AI_POSTURE_MAX_POWER, Math.max(RISK_CONFIG.AI_POSTURE_MIN_POWER, p));
            deps.setMinTemperature(clamped);
            result.applied.push({ action, detail: `ADJUST_POWER -> ${clamped}` });
            break;
          }
          case 'SET_PAIR_ACTIVE': {
            if (!PAIR_WHITELIST.includes(action.symbol)) { result.rejected.push({ action, reason: 'PAR_FORA_WHITELIST' }); break; }
            const current = new Set(deps.getActivePairs());
            if (action.active) current.add(action.symbol);
            else current.delete(action.symbol);
            deps.setActivePairs(Array.from(current));
            result.applied.push({ action, detail: `SET_PAIR_ACTIVE ${action.symbol} -> ${action.active}` });
            break;
          }
          default:
            result.rejected.push({ action, reason: 'ACAO_DESCONHECIDA' });
        }
      } catch (e: any) {
        result.rejected.push({ action, reason: `ERRO:${e.message}` });
      }
    }
    return result;
  }
}
