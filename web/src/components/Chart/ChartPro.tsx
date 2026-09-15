import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, SeriesMarker } from 'lightweight-charts';
import { CandleData, FlowSignal } from '../../../shared/types';
import { SimulatedTrade } from '../../../shared/paperTypes';
import { Eye, EyeOff, Activity, ShieldAlert } from 'lucide-react';

interface ChartProProps {
  symbol: string;
  candles: CandleData[];
  activeCandle: CandleData | null;
  signals: FlowSignal[];
  openPosition?: SimulatedTrade;
}

export const ChartPro: React.FC<ChartProProps> = ({ 
  symbol, 
  candles, 
  activeCandle, 
  signals,
  openPosition 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const entryLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);

  const [showFlowMarkers, setShowFlowMarkers] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [selectedTf, setSelectedTf] = useState<'1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1D'>('1m');

  // Cálculo da barra de pressão institucional em tempo real
  const buyRatio = activeCandle 
    ? Math.max(0.05, Math.min(0.95, (activeCandle.buyVolume || 1) / Math.max(1, (activeCandle.buyVolume + activeCandle.sellVolume) || 1)))
    : 0.55;
  const buyPressurePct = Math.round(buyRatio * 100);
  const sellPressurePct = 100 - buyPressurePct;
  const dominantSide = buyPressurePct > 55 ? 'BUY' : sellPressurePct > 55 ? 'SELL' : 'NEUTRAL';

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Inter, sans-serif'
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      crosshair: {
        vertLine: { color: '#6366f1', width: 1, style: 2 },
        horzLine: { color: '#6366f1', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
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

  // Update Candles and Timeframe fetch
  useEffect(() => {
    let isCancelled = false;

    const loadTimeframeData = async () => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/assets/${encodeURIComponent(symbol)}/klines?tf=${selectedTf}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && Array.isArray(data) && data.length > 0) {
            const chartCandles: CandlestickData[] = data.map((c: any) => ({
              time: c.time as any,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close
            }));

            const chartVolume: HistogramData[] = data.map((c: any) => ({
              time: c.time as any,
              value: c.volume,
              color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
            }));

            candleSeriesRef.current.setData(chartCandles);
            volumeSeriesRef.current.setData(chartVolume);
            chartRef.current?.timeScale().fitContent();
            return;
          }
        }
      } catch (err) {
        console.warn('Erro ao buscar klines para timeframe:', err);
      }

      // Fallback: usar candles recebidos via props
      if (!isCancelled && candles && candles.length > 0) {
        const chartCandles: CandlestickData[] = candles.map(c => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }));

        const chartVolume: HistogramData[] = candles.map(c => ({
          time: c.time as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
        }));

        candleSeriesRef.current.setData(chartCandles);
        volumeSeriesRef.current.setData(chartVolume);
      }
    };

    loadTimeframeData();

    return () => {
      isCancelled = true;
    };
  }, [symbol, selectedTf, candles]);

  // Update Live Candle
  useEffect(() => {
    if (!activeCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    candleSeriesRef.current.update({
      time: activeCandle.time as any,
      open: activeCandle.open,
      high: activeCandle.high,
      low: activeCandle.low,
      close: activeCandle.close
    });

    volumeSeriesRef.current.update({
      time: activeCandle.time as any,
      value: activeCandle.volume,
      color: activeCandle.close >= activeCandle.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
    });
  }, [activeCandle]);

  // Non-Repainting Flow Signal Markers on Chart
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (!showFlowMarkers) {
      candleSeriesRef.current.setMarkers([]);
      return;
    }

    const markers: SeriesMarker<any>[] = [];
    const symbolSignals = signals.filter(s => s.symbol === symbol).slice(0, 15);

    for (const sig of symbolSignals) {
      const timeSec = Math.floor(sig.timestamp / 1000);
      const isBuy = sig.type === 'ABSORPTION_SELL' || (sig.type === 'BOOK_IMBALANCE' && sig.message.includes('Compradores'));

      markers.push({
        time: timeSec as any,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#10b981' : '#ef4444',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: isBuy ? `ENTRADA COMPRA [${sig.type.split('_')[0]}]` : `ENTRADA VENDA [${sig.type.split('_')[0]}]`,
        size: 2
      });
    }

    try {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      candleSeriesRef.current.setMarkers(markers);
    } catch (e) {
      // ignore sorting sync edge
    }
  }, [signals, symbol, showFlowMarkers]);

  // Draw Price Lines for Simulated Open Trades (Entry, TP, SL)
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Clear old lines
    if (entryLineRef.current) {
      candleSeriesRef.current.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (tpLineRef.current) {
      candleSeriesRef.current.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }
    if (slLineRef.current) {
      candleSeriesRef.current.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }

    if (openPosition && openPosition.symbol === symbol) {
      entryLineRef.current = candleSeriesRef.current.createPriceLine({
        price: openPosition.entryPrice,
        color: '#6366f1',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: `POSIÇÃO (${openPosition.type === 'BUY' ? 'COMPRA' : 'VENDA'})`,
      });

      tpLineRef.current = candleSeriesRef.current.createPriceLine({
        price: openPosition.takeProfit,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `TAKE PROFIT (ALVO)`,
      });

      slLineRef.current = candleSeriesRef.current.createPriceLine({
        price: openPosition.stopLoss,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `STOP LOSS (PROTEÇÃO)`,
      });
    }
  }, [openPosition, symbol]);

  return (
    <div className="relative w-full h-full flex flex-col bg-background">
      {/* Chart Top Bar with Pro Indicator Toggles, Timeframe & Flow Pressure */}
      <div className="flex flex-col border-b border-border/70 bg-surface/60 backdrop-blur-sm select-none">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center space-x-3">
            <span className="font-mono font-bold text-base text-white tracking-wider">{symbol}</span>
            
            {/* Timeframe Selector */}
            <div className="flex items-center bg-background/80 p-0.5 rounded-md border border-border/70 text-[11px] font-mono">
              {(['1m', '3m', '5m', '15m', '1h', '4h', '1D'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedTf === tf
                      ? 'bg-accent text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Indicator Toggles */}
            <div className="flex items-center space-x-2 ml-2">
              <button
                onClick={() => setShowFlowMarkers(!showFlowMarkers)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                  showFlowMarkers
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-surface text-slate-400 border-border'
                }`}
              >
                {showFlowMarkers ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Gatilhos de Fluxo</span>
              </button>
            </div>
          </div>

          {/* Delta & CVD HUD */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Delta CVD:</span>
              <span className={`font-semibold ${activeCandle && activeCandle.cvd >= 0 ? 'text-buy' : 'text-sell'}`}>
                {activeCandle ? (activeCandle.cvd >= 0 ? `+${activeCandle.cvd.toLocaleString()}` : activeCandle.cvd.toLocaleString()) : '0'}
              </span>
            </div>
          </div>
        </div>

        {/* 📊 BARRA DE PRESSÃO DE FLUXO INSTITUCIONAL (Buy/Sell Pressure) */}
        <div className="px-4 py-1.5 bg-background/40 border-t border-border/40 flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 shrink-0 text-slate-300 font-semibold">
            <Activity className="w-3.5 h-3.5 text-accent animate-pulse" />
            <span>PRESSÃO INSTITUCIONAL:</span>
          </div>

          {/* Visual Dual-Colored Pressure Bar */}
          <div className="flex-1 flex items-center space-x-2">
            <span className="text-emerald-400 font-bold text-[10px] w-12 text-right">
              {buyPressurePct}% BUY
            </span>
            
            <div className="flex-1 h-2.5 bg-surface rounded-full overflow-hidden flex border border-border/60 p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full transition-all duration-300 shadow-sm shadow-emerald-500/50"
                style={{ width: `${buyPressurePct}%` }}
              />
              <div 
                className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-r-full transition-all duration-300 shadow-sm shadow-rose-500/50"
                style={{ width: `${sellPressurePct}%` }}
              />
            </div>

            <span className="text-rose-400 font-bold text-[10px] w-12">
              {sellPressurePct}% SELL
            </span>
          </div>

          <div className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 border ${
            dominantSide === 'BUY'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : dominantSide === 'SELL'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              : 'bg-surface text-slate-400 border-border'
          }`}>
            {dominantSide === 'BUY' ? '🔥 ABSORÇÃO / DOMÍNIO COMPRADOR' : dominantSide === 'SELL' ? '⚠️ PRESSÃO / DOMÍNIO VENDEDOR' : '⚖️ FLUXO EM EQUILÍBRIO'}
          </div>
        </div>
      </div>

      {/* Floating Active Trade Box if In Position */}
      {openPosition && openPosition.symbol === symbol && (
        <div className="absolute top-20 left-4 z-20 bg-surface/90 border border-accent/50 rounded-lg p-2.5 backdrop-blur-md shadow-xl text-xs font-mono flex items-center space-x-4 animate-pulse">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded font-bold ${openPosition.type === 'BUY' ? 'bg-buy text-black' : 'bg-sell text-white'}`}>
              {openPosition.type}
            </span>
            <div>
              <div className="text-[10px] text-slate-400">ENTRADA EM CURSO</div>
              <div className="text-white font-bold">${openPosition.entryPrice.toLocaleString()}</div>
            </div>
          </div>

          <div className="border-l border-border/80 pl-3">
            <div className="text-[10px] text-slate-400">LUCRO / PREJUÍZO (P&L)</div>
            <div className={`font-bold ${openPosition.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
              {openPosition.pnlUsd >= 0 ? `+$${openPosition.pnlUsd}` : `-$${Math.abs(openPosition.pnlUsd)}`} ({openPosition.pnlPct}%)
            </div>
          </div>

          <div className="border-l border-border/80 pl-3 text-[10px] text-slate-300">
            <div>TP: <span className="text-buy">${openPosition.takeProfit.toLocaleString()}</span></div>
            <div>SL: <span className="text-sell">${openPosition.stopLoss.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="w-full flex-1" />
    </div>
  );
};

