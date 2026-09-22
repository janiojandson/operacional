# Estratégia Crypto, Shadow e Auditoria — Design

## Objetivo

Transformar o motor de fluxo atual em uma estratégia crypto auditável, com filtros por ativo, modos Shadow `AUDIT` e `FILTER`, espelhamento proporcional verificável e relatórios consistentes no painel e no Google Sheets. O sistema permanece 24 horas ativo, mas uma decisão só pode ser executada se os dados, o risco e a replicação forem válidos.

## Limites e princípios

- Não prometer rentabilidade nem permitir que a IA envie ordens.
- Não alterar rotas existentes nem adicionar dependências sem nova aprovação.
- Preservar a porta 4000, contratos de gráfico e as três estratégias já existentes.
- Dados de fallback ou livro vencido nunca podem autorizar entrada.
- `2.5R` é o alvo fixo; uma saída por trailing registra o R realizado e seu motivo próprio.
- Todo resultado financeiro usa PnL líquido de taxas quando disponível; `0R` é válido e nunca deve virar `2.5R` por fallback.

## Contrato da estratégia

Uma definição versionada `flow-crypto-v1` centraliza perfis de BTC, ETH, SOL, BNB e XRP. Cada perfil declara stop, alvo de 2,5R, spread máximo, idade máxima do book, cooldown, limiares de absorção, desequilíbrio e volatilidade. A entrada exige:

1. dados Bybit válidos e recentes;
2. par habilitado e sem posição aberta/cooldown;
3. margem e lote mínimo válidos;
4. filtros de liquidez e spread;
5. confluência mínima de direção, fluxo, book e regime;
6. decisão Shadow conforme o modo ativo.

O motor preserva os sinais brutos, mas passa a produzir uma decisão estruturada com fatores aprovados, reprovados, pontuação, versão da estratégia e razão final.

## Shadow Mode

O modo é persistido e incluído em toda oportunidade:

- `AUDIT`: grava decisão e razões, sem impedir o master.
- `FILTER`: bloqueia o master se a decisão não for aprovada.

O ledger Shadow registra identificador de sinal, ativo, instante, entrada candidata, SL, TP, trailing, filtros, decisão, motivo, versão, fonte/idade dos dados e elegibilidade de espelhamento. Não deve fabricar um desfecho `+2.5R` ou `-1R`; resultados só são reportados quando observados e identificados como tais.

## Master, clientes e risco

O master continua ativo 24h. O cliente conectado acompanha o estado publicado do master, mas a cópia usa a exposição percentual efetiva do master e somente é executável se margem, taxa e lote mínimo suportarem a posição. Operações impossíveis para determinada banca são registradas como bloqueadas, não contabilizadas como trade do cliente.

## Painel e gráfico

O gráfico continua apenas como visualização e não pode decidir entrada. Deve indicar fonte (`BYBIT`, fallback ou indisponível), timestamp/idade, entradas, saídas, oportunidade bloqueada, SL, TP e trailing com o mesmo identificador do ledger. Livro/dados vencidos bloqueiam o motor; atraso apenas visual gera aviso no painel.

## Google Sheets

As abas são:

- `TRADES`: operações master/espelho e todos os valores líquidos;
- `OPORTUNIDADES SHADOW`: oportunidades aprovadas/bloqueadas e fatores;
- `COMPARATIVO ESPELHO MASTER`: bancas, lote, margem, taxa e elegibilidade;
- `SETE BLOCOS`: métricas de operações fechadas;
- `QUALIDADE DE DADOS`: origem, atraso e falhas;
- `DASHBOARD`: gráficos derivados das abas anteriores.

Dados históricos sem campos suficientes devem ser identificados como indisponíveis, sem estimativa fictícia.

## Sete blocos e AI Advisor

Os sete blocos usam somente operações fechadas, PnL líquido, R efetivamente realizado, razão de encerramento e saldo inicial do respectivo book. Métricas que não possam ser calculadas por falta de dados são exibidas como indisponíveis. O AI Advisor recebe apenas um resumo sanitizado de estratégia, qualidade dos dados e métricas; não recebe segredos nem controla execução.

## Segurança e publicação

Credenciais ficam somente em variáveis de ambiente. Chaves expostas em arquivos de teste devem ser revogadas e removidas antes de push. Testes externos com Bybit ou Sheets só podem ocorrer por execução explícita. A publicação exige testes, build, teste controlado do Apps Script, revisão do diff, push e validação humana no Railway.

## Critérios de aceite

1. Cada decisão de entrada possui perfil, versão, fatores e motivo auditáveis.
2. Shadow `AUDIT` e `FILTER` têm efeitos distintos e rastreáveis.
3. Nenhuma operação nasce de fallback ou dados vencidos.
4. `0R`, trailing e taxas são representados corretamente nos sete blocos.
5. A planilha e o painel distinguem evento master, cópia, bloqueio e oportunidade Shadow.
6. O cliente de banca menor evidencia claramente operações não replicáveis.
7. Nenhuma credencial é incluída no repositório ou enviada à IA.
