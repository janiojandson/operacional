# Implementação: Agente Soberano Auto-Sustentável (Nexus Sovereign Agent — Solana & Web3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o motor autônomo do `nexus-quant-solana`, um Agente Econômico Soberano dotado de carteira Solana nativa Phantom (`FBx2SKLDLsdeLM8owxU8MNVPKAfJpLpmpHHRgiZDqBoi`), acesso livre à internet (X/Twitter via `Agent Reach`, Instagram e YouTube via `AgentTube`), capacidade de caçar liquidez em memecoins (Pump.fun/Raydium com Jito Bundles), instanciar subagentes filhos e operar sob a regra estrita de Darwinismo Digital (Burn Rate vs. PnL: gerar lucro ou morrer por falta de saldo).

**Architecture:**
- **Núcleo de Sobrevivência (Burn Rate & Vitality Engine):** Monitor em tempo real que calcula o custo de cada computação (RPC, gas, tokens) e o Runway restante. Se o saldo cair abaixo de 0.05 SOL, entra em modo de hibernação espartana; se ultrapassar 0.50 SOL, destrava 50% de lucro para o Janio e provisiona o primeiro agente filho.
- **Camada de Execução On-Chain (Solana & DEXs):** Integração com `@solana/web3.js`, Jupiter API v6, Pump.fun SDK e Jito Relay para envio de transações atômicas anti-MEV.
- **Camada Social e Inteligência Livre (X / Twitter via Agent Reach):** Scanner de narrativas virais e tendências no X, postagens autônomas de alpha e captação de gorjetas em SOL sem custos de API oficial do Twitter.
- **Governança & Sentinela de Decisão (Laya Sistema 1):** Validação ultrarrápida (sub-33ms) com operações primitivas (*Choice/Noul*) para barrar honeypots, rugs e spreads tóxicos antes de assinar qualquer ordem.

**Tech Stack:** Node.js 22+, TypeScript 5.3+, `@solana/web3.js`, `@jup-ag/core`, `axios`, PostgreSQL (Railway), Laya API (`http://nexus-decisor-laya.railway.internal:8080`), Docker / Railway CLI.

**Spec:** Baseado na diretiva suprema de sobrevivência econômica, nas 28 ferramentas mapeadas no GitHub (`Tauric/TradingAgents`, `agent-reach`, `omkarcloud/gosom`, `autonomous-agent`) e na carteira `FBx2SKLDLsdeLM8owxU8MNVPKAfJpLpmpHHRgiZDqBoi`.

## Global Constraints
- Seguir estritamente o protocolo `safe-dev` (módulos desacoplados, contratos imutáveis, TDD e zero vazamento de chaves privadas).
- A chave privada NUNCA deve ser commitada no Git, trafegar em logs ou em prompts de IA; deve ser carregada estritamente via variável de ambiente volátil em memória (`AGENT_SOLANA_PRIVATE_KEY`).
- O agente tem autonomia de escolha, mas o Teto de Risco por operação nunca pode exceder **10% do saldo total da carteira**.
- O sistema deve operar prioritariamente via malha interna do Railway e carrossel local/Omni para custo de raciocínio próximo de R$ 0,00.

---

### Task 1: Motor de Vitalidade e Equação de Sobrevivência (Runway & Burn Rate Engine)

**Files:**
- Create: `src/core/vitalityEngine.ts`
- Test: `src/core/vitalityEngine.test.ts`

**Interfaces:**
- Produces: `calculateRunway(balanceSol: number, burnRatePerHourSol: number): number`
- Produces: `getAgentVitalityState(balanceSol: number): 'PROSPERITY' | 'NORMAL' | 'SPARTAN_SURVIVAL' | 'DEAD'`
- Produces: `canExecuteAction(costSol: number, balanceSol: number, estimatedYieldSol: number): boolean`

- [ ] **Step 1: Escrever teste unitário para os estados de vitalidade do agente**
Criar teste validando que:
  - Saldo <= 0.001 SOL retorna `'DEAD'`.
  - Saldo < 0.05 SOL retorna `'SPARTAN_SURVIVAL'` (bloqueia qualquer gasto discricionário).
  - Saldo entre 0.05 e 0.50 SOL retorna `'NORMAL'`.
  - Saldo > 0.50 SOL retorna `'PROSPERITY'` (aciona gatilho de spawn de agente filho e 50% de saque de lucro).

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npx tsx --test src/core/vitalityEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `vitalityEngine.ts`**
Implementar o cálculo de runway em horas, o controle estrito de burn rate e as regras de autorização de gastos com base no saldo da carteira.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npx tsx --test src/core/vitalityEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add src/core/vitalityEngine.ts src/core/vitalityEngine.test.ts
git commit -m "feat(vitality): implementa motor de sobrevivencia e calculo de runway darwinista"
```

---

### Task 2: Conector de Carteira Solana Blindada e Executor Jupiter/Pump.fun

**Files:**
- Create: `src/blockchain/solanaWallet.ts`
- Create: `src/blockchain/dexAggregator.ts`
- Test: `src/blockchain/solanaWallet.test.ts`

**Interfaces:**
- Consumes: `AGENT_SOLANA_PRIVATE_KEY` (Base58 ou Array de bytes)
- Produces: `getWalletPublicKey(): string` (deve retornar `FBx2SKLDLsdeLM8owxU8MNVPKAfJpLpmpHHRgiZDqBoi`)
- Produces: `getSolBalance(): Promise<number>`
- Produces: `executeSwapJupiter(inputMint: string, outputMint: string, amountLamports: number, maxSlippageBps: number): Promise<string>`

- [ ] **Step 1: Escrever teste unitário mockando o Keypair da Solana e a leitura de saldo**
Validar que a chave pública corresponde à carteira oficial e que a assinatura de transações bloqueia ordens que excedam 10% do saldo total.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npx tsx --test src/blockchain/solanaWallet.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `solanaWallet.ts` e `dexAggregator.ts`**
Configurar conexão RPC (Helius/Quicknode), carregamento seguro do Keypair na RAM, verificação de saldo SPL e swap direto via rota Jupiter v6 com proteção de slippage.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npx tsx --test src/blockchain/solanaWallet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add src/blockchain/solanaWallet.ts src/blockchain/dexAggregator.ts src/blockchain/solanaWallet.test.ts
git commit -m "feat(blockchain): conector de carteira solana blindada e integracao jupiter v6"
```

---

### Task 3: Sentinela de Risco em Memecoins com Validação Laya (Sub-33ms)

**Files:**
- Create: `src/risk/memeRiskGatekeeper.ts`
- Test: `src/risk/memeRiskGatekeeper.test.ts`

**Interfaces:**
- Consumes: Metadados do token (mint, freezeAuthority, mintAuthority, liquidityUsd, holdersCount)
- Consumes: Decisão Laya (`http://nexus-decisor-laya.railway.internal:8080/v1/systemone`)
- Produces: `auditTokenSecurity(mint: string): Promise<{ safe: boolean; reason?: string }>`

- [ ] **Step 1: Escrever teste unitário para barrar tokens com honeypot ou mint ativo**
Testar que tokens com `mintAuthority != null` ou liquidez < $5.000 são rejeitados sumariamente antes de qualquer transação.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npx tsx --test src/risk/memeRiskGatekeeper.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `memeRiskGatekeeper.ts` com chamada Laya**
Integrar consulta à Laya usando primitiva `Choice` ou `Noul` para validar assimetria de fluxo e risco de rug pull em 30ms.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npx tsx --test src/risk/memeRiskGatekeeper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add src/risk/memeRiskGatekeeper.ts src/risk/memeRiskGatekeeper.test.ts
git commit -m "feat(risk): gatekeeper de seguranca de memecoins integrado com Laya sub-33ms"
```

---

### Task 4: Presença Multicanal de Monetização (X/Twitter via Agent Reach + Instagram & YouTube via AgentTube)

**Files:**
- Create: `src/social/agentReachClient.ts`
- Create: `src/social/agentTubeEngine.ts`
- Test: `src/social/agentReachClient.test.ts`
- Test: `src/social/agentTubeEngine.test.ts`

**Interfaces:**
- Produces: `scanViralNarratives(keywords: string[]): Promise<Array<{ trend: string; volumeScore: number }>>`
- Produces: `publishSocialPost(platform: 'X' | 'INSTAGRAM', content: string, mediaUrl?: string): Promise<{ success: boolean; postId?: string }>`
- Produces: `generateAndUploadShortVideo(topic: string, script: string): Promise<{ success: boolean; videoUrl?: string }>`
- Produces: `checkWalletTips(): Promise<{ receivedTipsSol: number }>`

- [ ] **Step 1: Escrever teste unitário para os conectores sociais (X, Instagram e YouTube)**
Testar a formatação de copy viral, sanitização, injeção da chave pública Solana (`FBx2SKLDLsdeLM8owxU8MNVPKAfJpLpmpHHRgiZDqBoi`) para recebimento de gorjetas/parcerias e pipeline de vídeo via AgentTube.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npx tsx --test src/social/agentReachClient.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `agentReachClient.ts` e `agentTubeEngine.ts`**
Implementar os conectores open-source:
  - `agent-reach`: Leitura e postagem autônoma no X e Instagram sem pagar APIs corporativas abusivas.
  - `AgentTube`: Pipeline autônomo que gera roteiro com a Laya, cria voz sintética, monta o vídeo vertical (Reels/Shorts) sobre a memecoin do momento e publica para monetizar visualizações e atrair comunidade.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npx tsx --test src/social/agentReachClient.test.ts && npx tsx --test src/social/agentTubeEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add src/social/agentReachClient.ts src/social/agentTubeEngine.ts src/social/agentReachClient.test.ts src/social/agentTubeEngine.test.ts
git commit -m "feat(social): integra presenca multicanal no X, Instagram e gerador de video AgentTube"
```

---

### Task 5: Protocolo de Replicação e Auto-Spawning (Spawn do Agente Filho)

**Files:**
- Create: `src/lifecycle/reproductionEngine.ts`
- Test: `src/lifecycle/reproductionEngine.test.ts`

**Interfaces:**
- Produces: `evaluateReproductionTrigger(balanceSol: number, initialStakeSol: number): boolean`
- Produces: `spawnChildAgent(childSpecialty: 'LEAD_GENERATOR' | 'MEME_HUNTER' | 'X_INFLUENCER'): Promise<{ childWalletAddress: string; processId: string }>`

- [ ] **Step 1: Escrever teste unitário para o gatilho de auto-replicação**
Validar que com saldo de 0.50 SOL (dobro da banca inicial de 0.25 SOL), o motor autoriza a divisão 50/50: 0.125 SOL para saque do sócio Janio, 0.125 SOL para a carteira do novo agente filho e 0.25 SOL retido para a operação do pai.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npx tsx --test src/lifecycle/reproductionEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `reproductionEngine.ts`**
Criar a rotina que gera um novo par de chaves, provisiona uma task worker no Cérebro e delega um nicho autônomo específico para o agente filho.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npx tsx --test src/lifecycle/reproductionEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add src/lifecycle/reproductionEngine.ts src/lifecycle/reproductionEngine.test.ts
git commit -m "feat(lifecycle): implementa motor de reproducao e spawn de agentes filhos"
```

---

### Task 6: Orquestração Central e Deploy no Railway

**Files:**
- Create: `src/index.ts`
- Modify: `Dockerfile`
- Test: Teste de integração ponta a ponta (E2E) simulado

- [ ] **Step 1: Montar loop principal em `src/index.ts`**
Amarrar o ciclo contínuo:
  1. Leitura de saldo e vitalidade (`VitalityEngine`).
  2. Scout de tendências no X e Pump.fun (`AgentReach` + `Jupiter`).
  3. Filtro Laya (`MemeRiskGatekeeper`).
  4. Execução de trades assimétricos ou posts.
  5. Verificação de metas para Saque/Spawn.
  6. Sleep adaptativo (respiro de economia de CPU).

- [ ] **Step 2: Testar execução do loop com simulação local**
Run: `npx tsx src/index.ts --dry-run`
Expected: Loop executa sem erros, exibe o saldo de teste e loga o estado de vitalidade.

- [ ] **Step 3: Deploy no Railway (`nexus-quant-solana`)**
Commit final e push para o repositório oficial:
```bash
git add .
git commit -m "feat(core): orquestracao completa do agente soberano auto-sustentavel"
git push origin main
```
