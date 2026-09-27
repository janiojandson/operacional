# Implementation Plan - Sobrevivência Sistêmica e Curadoria de Ferramentas Open-Source

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar o ouro real do lixo nas ferramentas open-source do Instagram, integrando inteligência macro/segurança no Mercado Financeiro e no Nexus Cérebro para alimentar a sobrevivência financeira do Nexus Quant Solana sem onerar a infraestrutura.

**Architecture:** 
1. **Nexus Quant Solana:** Motor de alta frequência e micro-posições (Solana) 24/7.
2. **Mercado Financeiro (MarketFlow Pro):** Incorporar camada macro institucional (inspirada no TradingAgents e OpenBB) para validar regime de mercado antes de exposição em altcoins/memecoins.
3. **Nexus Cérebro & Strix:** Sentinela central de segurança que audita dependências e contratos sem instalar bibliotecas inchadas.
4. **Descarte Cirúrgico de Lixo:** Banimento de frameworks inflados que exigem servidores pesados (> 1GB RAM) ou scraping invasivo frágil.

**Tech Stack:** Node.js, TypeScript, Python (Laya), PostgreSQL Central, Docker, Railway.

---

## 🗑️ 1. O que é LIXO DESNECESSÁRIO (Descartar Imediatamente)

| Ferramenta / Promessa do Instagram | Por que é LIXO / Inviável para nós | Ação |
|---|---|---|
| **Bots de Scraping de Redes sem API (Instagram/TikTok massivo)** | Quebram a cada 24h por detecção de bot e bloqueiam IP da AWS/Railway. Custo de proxy residencial é proibitivo. | ❌ DESCARTADO |
| **Frameworks de Multi-Agente Inflados (Autogen / CrewAI vanilla)** | Gastam centenas de milhares de tokens conversando entre si em loops infinitos sem tomar decisão prática. | ❌ DESCARTADO (Usamos Laya Sistema 1 que custa R$ 0,00) |
| **Bancos de Dados Vetoriais Pesados (Milvus / Pinecone pago)** | O nosso PostgreSQL Central com `pgvector` já faz busca semântica perfeita sem custo adicional de servidor. | ❌ DESCARTADO |
| **Terminais Web Pesados que requerem 2GB+ de RAM** | Consomem o plano do Railway rapidamente. | ❌ DESCARTADO |

---

## 💎 2. O OURO REAL (As Únicas Tecnologias que Geram Dinheiro & Sobrevivência)

### 🥇 1. TradingAgents (Tauric/TradingAgents) ➔ Para o Mercado Financeiro & Solana
- **O que faz:** Estrutura uma mesa institucional: Sentinela Macro + Analista Técnico + Gestor de Risco.
- **Aplicação no Ecossistema:**
  - O **Mercado Financeiro** já analisa fluxo de ordens (Book L2, CVD, Agressão).
  - Adicionamos um filtro de **Regime Macro (BTC Dominance & Solana Volatility)**: quando o BTC estiver em despejo ou volatilidade caótica, o robô da Solana entra em modo defensivo automaticamente.

### 🥇 2. Gosom Maps Scraper ➔ Para o Buscador & Captação de Clientes
- **O que faz:** Extrai empresas e contatos em segundos em Go de alta performance.
- **Aplicação:** Gera leads B2B para venda de sistemas ou serviços, injetando receita real em reais/dólares para bancar a infraestrutura e capital de trading.

### 🥇 3. Strix (Security Testing) ➔ Sentinela de Vulnerabilidade
- **O que faz:** Testes automatizados de brechas e injeções.
- **Aplicação:** Garante que os endpoints públicos e contratos não tenham vulnerabilidades.

---

## 📋 Tasks de Execução

### Task 1: Módulo de Sincronia de Regime Macro (Mercado Financeiro ➔ Solana)
- [ ] **Step 1:** Criar endpoint leve no Mercado Financeiro `/api/macro-regime` retornando estado de mercado (BULLISH, BEARISH, VOLATILE).
- [ ] **Step 2:** Integrar consulta periódica no `nexus-quant-solana`: se o regime for BEARISH caótico, suspender compras em micro-caps.
- [ ] **Step 3:** Testar integração e commitar.

### Task 2: Auditoria de Segurança dos Containers (Strix Principles)
- [ ] **Step 1:** Auditar variáveis de ambiente expostas e sanitizar headers no Nginx/Express.
- [ ] **Step 2:** Validar regras de rate limit para impedir ataques de DDoS nas APIs públicas.
