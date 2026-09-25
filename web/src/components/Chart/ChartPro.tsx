import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { Eye, EyeOff, Activity } from 'lucide-react';
import { chartHistoryKey } from './chartRefreshPolicy.js';

export interface CandleData {
  time: any;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  buyVolume?: number;
  sellVolume?: number;
  cvd?: number;
}

export interface FlowSignal {
  id?: string;
  symbol: string;
  type: string;
  side?: string;
  price?: number;
  volume?: number;
  timestamp: number;
  message: string;
}

interface ChartProProps {
  symbol: string;
  candles?: CandleData[];
  activeCandle?: CandleData | null;
  signals?: FlowSignal[];
  openPosition?: any;
  trailingStopEnabled?: boolean; // <-- Declaração da propriedade
}

export const ChartPro: React.FC<ChartProProps> = ({
  symbol,
  candles = [],
  activeCandle,
  signals = [],
  openPosition,
  trailingStopEnabled = true // <-- Recebe o estado com valor padrão
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const candlesRef = useRef<CandleData[]>(candles);
  const historyKeyRef = useRef<string | null>(null);

  const entryLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const trailingTriggerLineRef = useRef<any>(null);
  const trailingStopLineRef = useRef<any>(null);

  const [showFlowMarkers, setShowFlowMarkers] = useState(true);
  const [selectedTf, setSelectedTf] = useState<'1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1D'>('1m');
  const [candleSource, setCandleSource] = useState<'BINGX' | 'BINANCE' | 'BYBIT' | 'LOCAL_FALLBACK' | 'UNAVAILABLE'>('UNAVAILABLE');

  // Cálculo da pressão institucional blindado contra undefined e divisão por zero
  const buyVol = Number(activeCandle?.buyVolume ?? 0);
  const sellVol = Number(activeCandle?.sellVolume ?? 0);
  const totalVol = buyVol + sellVol;

  const buyRatio = activeCandle && totalVol > 0
    ? Math.max(0.05, Math.min(0.95, buyVol / totalVol))
    : 0.55;
  const buyPressurePct = Math.round(buyRatio * 100);
  const sellPressurePct = 100 - buyPressurePct;
  const dominantSide = buyPressurePct > 55 ? 'BUY' : sellPressurePct > 55 ? 'SELL' : 'NEUTRAL';

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0B0E11' },
        textColor: '#848E9C',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Roboto Mono, monospace'
      },
      grid: {
        vertLines: { color: 'rgba(43, 49, 57, 0.4)' },
        horzLines: { color: 'rgba(43, 49, 57, 0.4)' },
      },
      crosshair: {
        vertLine: { color: '#6366f1', width: 1, style: 2 },
        horzLine: { color: '#6366f1', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#2B3139',
        autoScale: true,
        scaleMargins: {
          top: 0.20,
          bottom: 0.20,
        },
      },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#0ECB81',
      downColor: '#F6465D',
      borderVisible: false,
      wickUpColor: '#0ECB81',
      wickDownColor: '#F6465D',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#0ECB81',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const historyKey = chartHistoryKey(symbol, selectedTf);

    const loadTimeframeData = async () => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      try {
        const token = localStorage.getItem('mfp_token') || localStorage.getItem('token');
        const res = await fetch(`/api/assets/${encodeURIComponent(symbol)}/klines?tf=${selectedTf}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.source === 'BINGX' || data?.source === 'BINANCE' || data?.source === 'BYBIT') {
            setCandleSource(data.source);
          } else {
            setCandleSource('LOCAL_FALLBACK');
          }
          const rawCandles = Array.isArray(data) ? data : (Array.isArray(data.candles) ? data.candles : []);

          if (!isCancelled && rawCandles.length > 0) {
            const chartCandles = rawCandles.map((c: any) => ({
              time: c.time,
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close)
            }));

            const chartVolume = rawCandles.map((c: any) => ({
              time: c.time,
              value: Number(c.volume || 0),
              color: Number(c.close) >= Number(c.open) ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
            }));

            candleSeriesRef.current.setData(chartCandles);
            volumeSeriesRef.current.setData(chartVolume);
            if (historyKeyRef.current !== historyKey) {
              chartRef.current?.timeScale().fitContent();
              historyKeyRef.current = historyKey;
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar klines para timeframe:', err);
        setCandleSource('UNAVAILABLE');
      }

      const liveCandles = candlesRef.current;
      if (!isCancelled && selectedTf === '1m' && liveCandles.length > 0) {
        setCandleSource((prev) => (prev === 'UNAVAILABLE' ? 'LOCAL_FALLBACK' : prev));
        const chartCandles = liveCandles.map(c => ({
          time: c.time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        }));

        const chartVolume = liveCandles.map(c => ({
          time: c.time,
          value: Number(c.volume || 0),
          color: Number(c.close) >= Number(c.open) ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
        }));

        candleSeriesRef.current.setData(chartCandles);
        volumeSeriesRef.current.setData(chartVolume);
        if (historyKeyRef.current !== historyKey) {
          chartRef.current?.timeScale().fitContent();
          historyKeyRef.current = historyKey;
        }
      }
    };

    loadTimeframeData();

    return () => {
      isCancelled = true;
    };
  }, [symbol, selectedTf]);

  useEffect(() => {
    if (!activeCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (selectedTf === '1m') {
      candleSeriesRef.current.update({
        time: activeCandle.time,
        open: Number(activeCandle.open),
        high: Number(activeCandle.high),
        low: Number(activeCandle.low),
        close: Number(activeCandle.close)
      });

      volumeSeriesRef.current.update({
        time: activeCandle.time,
        value: Number(activeCandle.volume || 0),
        color: Number(activeCandle.close) >= Number(activeCandle.open) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
      });
    }
  }, [activeCandle, selectedTf]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (!showFlowMarkers) {
      candleSeriesRef.current.setMarkers([]);
      return;
    }

    const markers: any[] = [];
    const symbolSignals = signals.filter(s => s.symbol === symbol).slice(0, 15);
    const usedTimes = new Set<number>();

    for (const sig of symbolSignals) {
      let timeSec = Math.floor(sig.timestamp / 1000);
      if (usedTimes.has(timeSec)) continue;
      usedTimes.add(timeSec);
      const isBuy = sig.type === 'ABSORPTION_SELL' || (sig.type === 'BOOK_IMBALANCE' && sig.message.includes('Compradores'));

      markers.push({
        time: timeSec,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#0ECB81' : '#F6465D',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: isBuy ? `ENTRADA COMPRA [${sig.type.split('_')[0]}]` : `ENTRADA VENDA [${sig.type.split('_')[0]}]`,
        size: 2
      });
    }

    try {
      markers.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
      candleSeriesRef.current.setMarkers(markers);
    } catch { }
  }, [signals, symbol, showFlowMarkers]);

  // ─── DESENHO DAS LINHAS DE ORDEM E TRAILING STOP ──────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    try {
      if (entryLineRef.current) { candleSeriesRef.current.removePriceLine(entryLineRef.current); entryLineRef.current = null; }
      if (tpLineRef.current) { candleSeriesRef.current.removePriceLine(tpLineRef.current); tpLineRef.current = null; }
      if (slLineRef.current) { candleSeriesRef.current.removePriceLine(slLineRef.current); slLineRef.current = null; }
      if (trailingTriggerLineRef.current) { candleSeriesRef.current.removePriceLine(trailingTriggerLineRef.current); trailingTriggerLineRef.current = null; }
      if (trailingStopLineRef.current) { candleSeriesRef.current.removePriceLine(trailingStopLineRef.current); trailingStopLineRef.current = null; }
    } catch { }

    if (openPosition && openPosition.symbol === symbol) {
      const isPosLong = String(openPosition.type || openPosition.side || '').toUpperCase().includes('BUY');
      const entryVal = Number(openPosition.entryPrice || 0);
      const tpVal = Number(openPosition.takeProfit || 0);
      const slVal = Number(openPosition.stopLoss || 0);

      // Coeficientes específicos do par
      const coinTps: Record<string, number> = {
        'BTC/USDT': 0.0200,
        'ETH/USDT': 0.0250,
        'SOL/USDT': 0.0350,
        'BNB/USDT': 0.0225,
        'XRP/USDT': 0.0300
      };
      const cleanKey = symbol.replace(':USDT', '').trim();
      const tpRate = coinTps[cleanKey] || 0.0250;

      // 1. Linha de Entrada (Azul Sólida)
      if (entryVal > 0) {
        entryLineRef.current = candleSeriesRef.current.createPriceLine({
          price: entryVal,
          color: '#6366f1',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `POSIÇÃO (${isPosLong ? 'COMPRA' : 'VENDA'}) [10x ISOLADA]`,
        });
      }

      // 2. Linha de Take Profit (Verde Tracejada)
      if (tpVal > 0) {
        tpLineRef.current = candleSeriesRef.current.createPriceLine({
          price: tpVal,
          color: '#0ECB81',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'TAKE PROFIT (ALVO)',
        });
      }

      // 3. Linha do Gatilho do Trailing Stop — Só desenha se o botão estiver ATIVO
      const calculatedTrigger = openPosition.trailingTriggerPrice
        ? Number(openPosition.trailingTriggerPrice)
        : (isPosLong ? entryVal * (1 + 0.80 * tpRate) : entryVal * (1 - 0.80 * tpRate));

      if (trailingStopEnabled && calculatedTrigger > 0) {
        trailingTriggerLineRef.current = candleSeriesRef.current.createPriceLine({
          price: calculatedTrigger,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'GATILHO TRAILING (80%)',
        });
      }

      // 4. Se o Trailing estiver ativo e ligado
      if (trailingStopEnabled && openPosition.trailingActive && openPosition.trailingStopPrice) {
        trailingStopLineRef.current = candleSeriesRef.current.createPriceLine({
          price: Number(openPosition.trailingStopPrice),
          color: '#a855f7',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: 'TRAILING STOP ATIVO 🚀',
        });
      } else if (slVal > 0) {
        slLineRef.current = candleSeriesRef.current.createPriceLine({
          price: slVal,
          color: '#F6465D',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'STOP LOSS (PROTEÇÃO)',
        });
      }
    }
  }, [openPosition, symbol, trailingStopEnabled]); // <-- Atualiza dinamicamente ao clicar no botão

  const currentTrade = Boolean(openPosition && openPosition.symbol === symbol) ? openPosition : null;
  const isTradeLong = currentTrade ? String(currentTrade.type || currentTrade.side || '').toUpperCase().includes('BUY') : false;
  const tradeEntryPrice = currentTrade ? Number(currentTrade.entryPrice || 0) : 0;
  const tradeTpPrice = currentTrade ? Number(currentTrade.takeProfit || 0) : 0;
  const tradePnlValue = currentTrade ? Number(currentTrade.pnlUsd || 0) : 0;
  const tradePnlPercentage = currentTrade ? Number(currentTrade.pnlPct || 0) : 0;
  const isTsRunning = currentTrade ? Boolean(currentTrade.trailingActive) : false;
  const runningTsPrice = currentTrade && currentTrade.trailingStopPrice ? Number(currentTrade.trailingStopPrice) : null;
  const triggerToDisplay = currentTrade
    ? (currentTrade.trailingTriggerPrice
      ? Number(currentTrade.trailingTriggerPrice)
      : (isTradeLong ? tradeEntryPrice * 1.016 : tradeEntryPrice * 0.984))
    : 0;

  return (
    <div className="relative w-full h-full flex flex-col bg-bg-panel select-none">
      <div className="flex flex-col border-b border-border-panel bg-bg-panel">
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center space-x-2.5">
            <span className="font-mono font-bold text-sm text-text-primary tracking-wider">{symbol}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${(candleSource === 'BINGX' || candleSource === 'BINANCE' || candleSource === 'BYBIT') ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : candleSource === 'LOCAL_FALLBACK' ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-rose-300 border-rose-500/40 bg-rose-500/10'}`}>
              {candleSource === 'BINGX' ? 'BINGX AO VIVO' : candleSource === 'BINANCE' ? 'BINANCE AO VIVO' : candleSource === 'BYBIT' ? 'BYBIT AO VIVO' : candleSource === 'LOCAL_FALLBACK' ? 'FALLBACK LOCAL' : 'DADOS INDISPONIVEIS'}
            </span>

            <div className="flex items-center bg-bg-app p-0.5 rounded border border-border-panel text-[11px] font-mono">
              {(['1m', '3m', '5m', '15m', '1h', '4h', '1D'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  className={`px-2 py-0.5 rounded transition-all ${selectedTf === tf
                      ? 'bg-accent text-white font-bold shadow-sm'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                    }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2 ml-1">
              <button
                onClick={() => setShowFlowMarkers(!showFlowMarkers)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${showFlowMarkers
                    ? 'bg-trade-green/15 text-trade-green border-trade-green/40'
                    : 'bg-bg-app text-text-muted border-border-panel'
                  }`}
              >
                {showFlowMarkers ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Gatilhos de Fluxo</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="text-text-muted">Delta CVD:</span>
              {(() => {
                const cvdVal = Number(activeCandle?.cvd ?? 0);
                return (
                  <span className={`font-semibold ${cvdVal >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
                    {cvdVal >= 0 ? `+${cvdVal.toLocaleString()}` : cvdVal.toLocaleString()}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="px-3 py-1 bg-bg-app/60 border-t border-border-panel/60 flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 shrink-0 text-text-primary font-semibold text-[10px]">
            <Activity className="w-3 h-3 text-accent animate-pulse" />
            <span>PRESSÃO INSTITUCIONAL:</span>
          </div>

          <div className="flex-1 flex items-center space-x-2">
            <span className="text-trade-green font-bold text-[10px] w-12 text-right">
              {buyPressurePct}% BUY
            </span>

            <div className="flex-1 h-2 bg-bg-app rounded-full overflow-hidden flex border border-border-panel p-0.5">
              <div
                className="h-full bg-trade-green rounded-l-full transition-all duration-300"
                style={{ width: `${buyPressurePct}%` }}
              />
              <div
                className="h-full bg-trade-red rounded-r-full transition-all duration-300"
                style={{ width: `${sellPressurePct}%` }}
              />
            </div>

            <span className="text-trade-red font-bold text-[10px] w-12">
              {sellPressurePct}% SELL
            </span>
          </div>

          <div className={`px-2 py-0.2 rounded text-[10px] font-bold shrink-0 border ${dominantSide === 'BUY'
              ? 'bg-trade-green/15 text-trade-green border-trade-green/40'
              : dominantSide === 'SELL'
                ? 'bg-trade-red/15 text-trade-red border-trade-red/40'
                : 'bg-bg-app text-text-muted border-border-panel'
            }`}>
            {dominantSide === 'BUY' ? '🔥 ABSORÇÃO / COMPRA' : dominantSide === 'SELL' ? '⚠️ PRESSÃO / VENDA' : '⚖️ EQUILÍBRIO'}
          </div>
        </div>
      </div>

      {currentTrade && (
        <div className="absolute top-20 left-4 z-20 bg-bg-panel/95 border border-accent/50 rounded-md p-2.5 backdrop-blur-md shadow-xl text-xs font-mono flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded font-bold ${isTradeLong ? 'bg-trade-green text-black' : 'bg-trade-red text-white'}`}>
              {currentTrade.type || currentTrade.side || 'TRADE'}
            </span>
            <div>
              <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                <span>ENTRADA EM CURSO</span>
                <span className="px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/40 text-[9px]">10x ISOLADA</span>
              </div>
              <div className="text-text-primary font-bold">${tradeEntryPrice.toLocaleString()}</div>
            </div>
          </div>

          <div className="border-l border-border-panel pl-3">
            <div className="text-[10px] text-text-muted">LUCRO / PREJUÍZO (P&L)</div>
            <div className={`font-bold ${tradePnlValue >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
              {tradePnlValue >= 0 ? `+$${tradePnlValue.toFixed(2)}` : `-$${Math.abs(tradePnlValue).toFixed(2)}`} ({tradePnlPercentage.toFixed(2)}%)
            </div>
            {currentTrade.marginUsd && (
              <div className="text-[10px] text-amber-400 font-medium">
                Margem: ${Number(currentTrade.marginUsd).toFixed(2)}
              </div>
            )}
          </div>

          <div className="border-l border-border-panel pl-3 text-[10px] space-y-0.5">
            <div>TP: <span className="text-trade-green font-semibold">${tradeTpPrice.toLocaleString()}</span></div>
            {trailingStopEnabled ? (
              isTsRunning && runningTsPrice ? (
                <div className="text-purple-400 font-bold flex items-center gap-1 animate-pulse">
                  <span>TS: ${runningTsPrice.toLocaleString()}</span>
                  <span>🚀</span>
                </div>
              ) : (
                <div>Gatilho TS: <span className="text-amber-400 font-semibold">${triggerToDisplay.toFixed(2)}</span></div>
              )
            ) : (
              <div className="text-slate-400 font-semibold">Alvo Fixo (100%)</div>
            )}
          </div>
        </div>
      )}

      <div ref={chartContainerRef} className="w-full flex-1" />
    </div>
  );
};
