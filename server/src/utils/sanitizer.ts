/**
 * Sanitiza valores para evitar CSV/Excel Formula Injection
 * Previne a execução de comandos (=, +, -, @, \t, \r) em leitores de planilhas.
 */
export function sanitizeCsvField(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Se começar com caracteres de fórmula, prefixa com apóstrofo simples para forçar texto
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Escapa strings para saída em tabelas HTML de relatórios Excel (.xls)
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
