/**
 * Utilitários de formatação numérica e monetária com padrão pt-BR estrito (1.234,56).
 * Mantém consistência visual em todo o Trading Terminal Pro.
 */

const ptBrFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ptBr4DecimalsFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * Formata número com 2 casas decimais no padrão pt-BR (ex: 1.234,56)
 */
export function formatPtBrNumber(val: number | null | undefined, decimals = 2): string {
  const num = Number(val || 0);
  if (isNaN(num)) return '0,00';
  if (decimals === 2) return ptBrFormatter.format(num);
  if (decimals === 4) return ptBr4DecimalsFormatter.format(num);
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata valor monetário USD no padrão pt-BR (ex: $ 1.234,56)
 */
export function formatCurrencyPtBr(val: number | null | undefined, decimals = 2): string {
  return `$ ${formatPtBrNumber(val, decimals)}`;
}

/**
 * Formata preço de criptoativo no padrão pt-BR de acordo com a ordem de grandeza
 */
export function formatPricePtBr(price: number | null | undefined, symbol?: string): string {
  const num = Number(price || 0);
  if (isNaN(num)) return '0,00';
  if (symbol && (symbol.includes('XRP') || symbol.includes('DOGE') || num < 10)) {
    return ptBr4DecimalsFormatter.format(num);
  }
  return ptBrFormatter.format(num);
}

/**
 * Formata PnL com sinal explícito e percentual opcional (ex: +$ 123,45 (+1,23%))
 */
export function formatPnlPtBr(val: number | null | undefined, pct?: number | null): string {
  const num = Number(val || 0);
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  const absFormatted = formatPtBrNumber(Math.abs(num), 2);
  const baseStr = `${sign}$ ${absFormatted}`;
  if (pct !== undefined && pct !== null) {
    const pctNum = Number(pct || 0);
    const pctSign = pctNum > 0 ? '+' : pctNum < 0 ? '-' : '';
    const pctFormatted = formatPtBrNumber(Math.abs(pctNum), 2);
    return `${baseStr} (${pctSign}${pctFormatted}%)`;
  }
  return baseStr;
}

/**
 * Formata percentual com símbolo % (ex: 12,34%)
 */
export function formatPercentPtBr(val: number | null | undefined, decimals = 2): string {
  const num = Number(val || 0);
  return `${formatPtBrNumber(num, decimals)}%`;
}
