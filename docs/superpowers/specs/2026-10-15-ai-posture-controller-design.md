# Design — IA Controladora de Postura (aiPostureEngine)

**Data:** 2026-10-15 · **Estado:** aprovado pelo operador · **Projeto:** MarketFlow Pro (Mercado Financeiro)

## Objetivo
Adicionar uma camada de IA que, de forma autônoma e 24/7, analisa o momento do mercado e ajusta a postura das operações (dimensionar, mover stop/alvo, fechar, rotacionar pares, inverter lado), saindo do padrão "engessado". Também consultável on-demand.

## Decisões (aprovadas)
- **Papel:** controladora autônoma + consultora on-demand.
- **Capital:** papel + real (copy-trading) desde já.
- **Poderes:** dimensionar, mover stop/alvo, fechar, rotacionar pares, inverter lado.
- **Arquitetura:** módulo interno (`aiPostureEngine.ts`) chamando o **omniroute diretamente** (não via cerebro).
- **Endpoint IA (prioridade interna → fallback externo):**
  - `OMNIROUTE_BASE_URL_INTERNAL=http://nexus-omniroute.railway.internal:8080/v1`
  - `OMNIROUTE_BASE_URL=https://nexus-omniroute-production.up.railway.app/v1`
  - `OMNIROUTE_API_KEY` = chave de produção (env var, não versionada).
  - Modelo: `auto/best-coding` (tool-calling + reasoning).

## Componentes
1. **Config** — env vars (`OMNIROUTE_BASE_URL`, `OMNIROUTE_BASE_URL_INTERNAL`, `OMNIROUTE_API_KEY`) + flags no `RISK_CONFIG` (`AI_POSTURE_ENABLED`, `AI_POSTURE_INTERVAL_MS`, `AI_POSTURE_TIMEOUT_MS`, `AI_POSTURE_MODEL`, limites por ação).
2. **`aiPostureEngine.ts`** — monta snapshot (candles, book, fluxo, posições abertas, últimos trades, regime/temperatura), monta prompt "master-class" (direto e claro), chama omniroute (interno→externo), parseia JSON de ações.
3. **Validador de segurança** — toda ação passa por: kill-switch manual da autonomia; lockout/safe-halt determinísticos (a IA não desliga); limites por ação (teto de potência 3x, máx 2 same-side, whitelist de pares, sem alavancagem extra).
4. **Executor** — aplica as ações no paper engine (e replica via copy-trading).
5. **Auditoria** — tabela `ai_posture_decisions` (prompt, resposta crua, ações, racional, resultado).
6. **Endpoint** — `POST /api/ai-copilot/consult` (on-demand) + `GET /api/ai-copilot/status`.
7. **Agendador** — disparo periódico (default 10 min) + gatilho opcional em novos sinais.

## Ações suportadas (JSON)
`ADJUST_STOP`, `ADJUST_TARGET`, `CLOSE`, `SCALE_OUT`, `SET_PAIR_ACTIVE`, `ADJUST_POWER`, `FLIP_SIDE` — cada uma com bounds e validação.

## Trilhos de segurança (não-negociáveis, a IA não pode desligar)
- Lockout diário −3R e safe-halt 15% DD (determinísticos).
- Kill-switch manual `AI_POSTURE_ENABLED=false` (desliga a autonomia na hora).
- Limites por ação (potência ≤3x, ≤2 same-side, pares whitelist, risco por trade ≤1%).
- Fail-safe: IA timeout/erro → motor determinístico continua sem ações IA.

## Fluxo de dados
snapshot → prompt → omniroute (`auto/best-coding`) → JSON ações → validação (trilhos) → execução (papel+real) → auditoria.

## O que muda
Novo módulo + config + endpoint + tabela `ai_posture_decisions` + atualização do `AGENTS.md` (governança = determinística + camada IA com trilhos).
