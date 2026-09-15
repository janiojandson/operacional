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

  // Update Candles and Timeframe fetch
  useEffect(() => {
    let isCancelled = false;

    const loadTimeframeData = async () => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      console.log("Buscando TF:", selectedTf);

      try {
        const token = localStorage.getItem('mfp_token') || localStorage.getItem('token');
        const res = await fetch(`/api/assets/${encodeURIComponent(symbol)}/klines?tf=${selectedTf}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (res.ok) {
          const data = await res.json();
          const rawCandles = Array.isArray(data) ? data : (Array.isArray(data.candles) ? data.candles : []);
          
          if (!isCancelled && rawCandles.length > 0) {
            console.log("Candles renderizados:", rawCandles.length);

            const chartCandles: CandlestickData[] = rawCandles.map((c: any) => ({
              time: c.time as any,
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close)
            }));

            const chartVolume: HistogramData[] = rawCandles.map((c: any) => ({
              time: c.time as any,
              value: Number(c.volume || 0),
              color: Number(c.close) >= Number(c.open) ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
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

      // Fallback: usar candles recebidos via props apenas se estiver no timeframe 1m
      if (!isCancelled && selectedTf === '1m' && candles && candles.length > 0) {
        console.log("Candles renderizados:", candles.length);
        const chartCandles: CandlestickData[] = candles.map(c => ({
          time: c.time as any,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        }));

        const chartVolume: HistogramData[] = candles.map(c => ({
          time: c.time as any,
          value: Number(c.volume || 0),
          color: Number(c.close) >= Number(c.open) ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
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

  // Update Live Candle (apenas no timeframe 1m para não distorcer candles agregados de tempos maiores)
  useEffect(() => {
    if (!activeCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (selectedTf === '1m') {
      candleSeriesRef.current.update({
        time: activeCandle.time as any,
        open: Number(activeCandle.open),
        high: Number(activeCandle.high),
        low: Number(activeCandle.low),
        close: Number(activeCandle.close)
      });

      volumeSeriesRef.current.update({
        time: activeCandle.time as any,
        value: Number(activeCandle.volume || 0),
        color: Number(activeCandle.close) >= Number(activeCandle.open) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
      });
    }
  }, [activeCandle, selectedTf]);

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
        color: isBuy ? '#0ECB81' : '#F6465D',
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
        color: '#0ECB81',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `TAKE PROFIT (ALVO)`,
      });

      slLineRef.current = candleSeriesRef.current.createPriceLine({
        price: openPosition.stopLoss,
        color: '#F6465D',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `STOP LOSS (PROTEÇÃO)`,
      });
    }
  }, [openPosition, symbol]);

  return (
    <div className="relative w-full h-full flex flex-col bg-bg-panel select-none">
      {/* Chart Top Bar with Pro Indicator Toggles, Timeframe & Flow Pressure */}
      <div className="flex flex-col border-b border-border-panel bg-bg-panel">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center space-x-2.5">
            <span className="font-mono font-bold text-sm text-text-primary tracking-wider">{symbol}</span>
            
            {/* Timeframe Selector */}
            <div className="flex items-center bg-bg-app p-0.5 rounded border border-border-panel text-[11px] font-mono">
              {(['1m', '3m', '5m', '15m', '1h', '4h', '1D'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedTf === tf
                      ? 'bg-accent text-white font-bold shadow-sm'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Indicator Toggles */}
            <div className="flex items-center space-x-2 ml-1">
              <button
                onClick={() => setShowFlowMarkers(!showFlowMarkers)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                  showFlowMarkers
                    ? 'bg-trade-green/15 text-trade-green border-trade-green/40'
                    : 'bg-bg-app text-text-muted border-border-panel'
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
              <span className="text-text-muted">Delta CVD:</span>
              <span className={`font-semibold ${activeCandle && activeCandle.cvd >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
                {activeCandle ? (activeCandle.cvd >= 0 ? `+${activeCandle.cvd.toLocaleString()}` : activeCandle.cvd.toLocaleString()) : '0'}
              </span>
            </div>
          </div>
        </div>

        {/* 📊 BARRA DE PRESSÃO DE FLUXO INSTITUCIONAL (Buy/Sell Pressure) */}
        <div className="px-3 py-1 bg-bg-app/60 border-t border-border-panel/60 flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 shrink-0 text-text-primary font-semibold text-[10px]">
            <Activity className="w-3 h-3 text-accent animate-pulse" />
            <span>PRESSÃO INSTITUCIONAL:</span>
          </div>

          {/* Visual Dual-Colored Pressure Bar */}
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

          <div className={`px-2 py-0.2 rounded text-[10px] font-bold shrink-0 border ${
            dominantSide === 'BUY'
              ? 'bg-trade-green/15 text-trade-green border-trade-green/40'
              : dominantSide === 'SELL'
              ? 'bg-trade-red/15 text-trade-red border-trade-red/40'
              : 'bg-bg-app text-text-muted border-border-panel'
          }`}>
            {dominantSide === 'BUY' ? '🔥 ABSORÇÃO / COMPRA' : dominantSide === 'SELL' ? '⚠️ PRESSÃO / VENDA' : '⚖️ EQUILÍBRIO'}
          </div>
        </div>
      </div>

      {/* Floating Active Trade Box if In Position */}
      {openPosition && openPosition.symbol === symbol && (
        <div className="absolute top-20 left-4 z-20 bg-bg-panel/95 border border-accent/50 rounded-md p-2.5 backdrop-blur-md shadow-xl text-xs font-mono flex items-center space-x-4 animate-pulse">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded font-bold ${openPosition.type === 'BUY' ? 'bg-trade-green text-black' : 'bg-trade-red text-white'}`}>
              {openPosition.type}
            </span>
            <div>
              <div className="text-[10px] text-text-muted">ENTRADA EM CURSO</div>
              <div className="text-text-primary font-bold">${openPosition.entryPrice.toLocaleString()}</div>
            </div>
          </div>

          <div className="border-l border-border-panel pl-3">
            <div className="text-[10px] text-text-muted">LUCRO / PREJUÍZO (P&L)</div>
            <div className={`font-bold ${openPosition.pnlUsd >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
              {openPosition.pnlUsd >= 0 ? `+$${openPosition.pnlUsd}` : `-$${Math.abs(openPosition.pnlUsd)}`} ({openPosition.pnlPct}%)
            </div>
          </div>

          <div className="border-l border-border-panel pl-3 text-[10px] text-text-muted">
            <div>TP: <span className="text-trade-green font-semibold">${openPosition.takeProfit.toLocaleString()}</span></div>
            <div>SL: <span className="text-trade-red font-semibold">${openPosition.stopLoss.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="w-full flex-1" />
    </div>
  );
};

