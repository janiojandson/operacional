type BookMetadata = { source?: 'BYBIT' | 'BINANCE' | 'LOCAL_FALLBACK'; timestamp: number };

export function bookStatus(book: BookMetadata, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - book.timestamp) / 1000));
  const isLive = book.source === 'BINANCE' || book.source === 'BYBIT';
  return {
    source: book.source === 'BINANCE' ? 'BINANCE' : book.source === 'BYBIT' ? 'BYBIT' : 'SIMULADO',
    age: `${seconds}s`,
    stale: seconds > 12 || !isLive
  };
}

