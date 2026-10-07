import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixed3rExit, configuredExitPolicy, permitsDiscretionaryClose } from './fixed3rExitPolicy.js';
import * as execution from './bybitExecutionEngine.js';

test('long and short fixed barriers, HOLD around harvest and invalid snapshots', () => {
  for (const [type, stop, price, expected] of [
    ['BUY', 99, 100.6, 'HOLD'], ['BUY', 99, 100, 'HOLD'], ['BUY', 99, 103, 'FIXED_TP'],
    ['BUY', 99, 99, 'STOP_LOSS'], ['SELL', 101, 97, 'FIXED_TP'], ['SELL', 101, 101, 'STOP_LOSS'],
    ['SELL', 101, 99.4, 'HOLD'], ['SELL', 101, 100.5, 'HOLD']
  ] as const) assert.equal(fixed3rExit({type, entryPrice:100, initialStopLoss:stop}, price), expected);
  assert.throws(() => fixed3rExit({type:'BUY',entryPrice:100,initialStopLoss:101},100));
  assert.throws(() => fixed3rExit({type:'BUY',entryPrice:100,initialStopLoss:99},NaN));
  assert.throws(() => fixed3rExit({type:'SELL',entryPrice:100,initialStopLoss:140},100));
});
test('configuration fails closed and asynchronous discretionary close validates ID and policy', () => {
  assert.equal(configuredExitPolicy('LEGACY'), 'LEGACY');
  assert.throws(() => configuredExitPolicy(''), /INVALID_MARKET_EXIT_POLICY/);
  assert.throws(() => configuredExitPolicy('fixed_3r'), /INVALID_MARKET_EXIT_POLICY/);
  assert.equal(permitsDiscretionaryClose({ id:'old', exitPolicy:'LEGACY' } as any,'new'),false);
  assert.equal(permitsDiscretionaryClose({ id:'new', exitPolicy:'FIXED_3R' } as any,'new'),false);
  assert.equal(permitsDiscretionaryClose({ id:'new', exitPolicy:'LEGACY' } as any,'new'),true);
});
test('native BingX protection overrides configured trailing and a stale 2.5R target for the full lot', () => {
  const build = (execution as any).buildBingxProtection;
  assert.equal(typeof build, 'function');
  const protection = build({side:'BUY',entryPrice:100,stopLoss:99,takeProfit:102.5,
    initialStopLoss:99,exitPolicy:'FIXED_3R',trailingStopAtivo:true},2,true,(x:number)=>x);
  assert.equal(protection.trailingActive,false);
  assert.deepEqual(protection.params.takeProfit, { stopPrice:103, type:'TAKE_PROFIT_MARKET', workingType:'MARK_PRICE', quantity:2 });
  assert.equal(protection.params.stopLoss.stopPrice,99);
  const short = build({side:'SELL',entryPrice:100,stopLoss:101,takeProfit:97.5,exitPolicy:'FIXED_3R'},3,true,(x:number)=>x);
  assert.equal(short.params.takeProfit.stopPrice,97);
  assert.equal(short.params.takeProfit.quantity,3);
});

test('BingX confirms full native protection at the actual average fill and cancels an unfilled remainder', async () => {
  const reconcile = (execution as any).reconcileFixed3rEntry;
  assert.equal(typeof reconcile,'function');
  let canceled = false;
  const orders = [
    {id:'sl',amount:2,stopPrice:99,info:{type:'STOP_MARKET',positionSide:'LONG'}},
    {id:'tp',amount:2,stopPrice:103,info:{type:'TAKE_PROFIT_MARKET',positionSide:'LONG'}}
  ];
  const exchange = {
    priceToPrecision:(_s:string,x:number)=>x.toFixed(2),
    fetchOrder:async ()=>({id:'entry',status:canceled?'canceled':'open',filled:1.5,amount:2,average:100.2}),
    cancelOrder:async ()=>{canceled=true;}, fetchOpenOrders:async ()=>orders,
    editOrder:async (id:string,_symbol:string,_type:string,_side:string,amount:number,_price:any,p:any)=>{
      const order=orders.find(o=>o.id===id)!;
      order.amount=amount; order.stopPrice=p.takeProfitPrice ?? p.stopLossPrice;
      assert.equal(p.reduceOnly,true);
      return order;
    }
  };
  const snapshot=await reconcile(exchange,'BTC/USDT:USDT',{side:'BUY',entryPrice:100,stopLoss:99,takeProfit:103,exitPolicy:'FIXED_3R'},{id:'entry'});
  assert.equal(canceled,true);
  assert.equal(snapshot.entryPrice,100.2);
  assert.equal(snapshot.initialQty,1.5);
  assert(Math.abs(snapshot.initialRiskUsd-1.8)<1e-9);
  assert.equal(snapshot.takeProfit,103.8);
  assert.equal(orders[1].amount,1.5);
  assert.equal(orders[0].amount,1.5);
});

test('BingX does not claim confirmation when the native target quantity cannot be verified', async () => {
  const reconcile = (execution as any).reconcileFixed3rEntry;
  const exchange = {
    priceToPrecision:(_s:string,x:number)=>x,
    fetchOrder:async ()=>({id:'entry',status:'closed',filled:2,amount:2,average:100}),
    fetchOpenOrders:async ()=>[],
  };
  await assert.rejects(reconcile(exchange,'BTC/USDT:USDT',
    {side:'BUY',entryPrice:100,stopLoss:99,takeProfit:103,exitPolicy:'FIXED_3R'},{id:'entry'}),/PROTECTION_AMBIGUOUS/);
});

test('BingX cannot freeze risk while a canceled entry is still reported open', async () => {
  const reconcile = (execution as any).reconcileFixed3rEntry;
  let snapshots=0;
  const exchange={ fetchOrder:async()=>({id:'e',status:'open',filled:1,amount:2,average:100}), cancelOrder:async()=>{},
    priceToPrecision:(_s:string,n:number)=>n, fetchOpenOrders:async()=>[] };
  await assert.rejects(reconcile(exchange,'BTC/USDT:USDT',
    {side:'BUY',entryPrice:100,stopLoss:99,takeProfit:103,exitPolicy:'FIXED_3R'},{id:'e'},async()=>{snapshots++;}),/ENTRY_NOT_TERMINAL/);
  assert.equal(snapshots,0);
});

test('BingX refetches after cancellation races a complete fill', async () => {
  let reads=0;
  const exchange={ fetchOrder:async()=>++reads===1?{id:'e',status:'open',filled:1,amount:2,average:100}:
    {id:'e',status:'closed',filled:2,amount:2,average:100}, cancelOrder:async()=>{throw Error('OrderNotFound');},
    priceToPrecision:(_s:string,n:number)=>n,
    fetchOpenOrders:async()=>[
      {id:'s',amount:2,stopPrice:99,info:{type:'STOP_MARKET',positionSide:'LONG'}},
      {id:'t',amount:2,stopPrice:103,info:{type:'TAKE_PROFIT_MARKET',positionSide:'LONG'}}] };
  const snapshot=await (execution as any).reconcileFixed3rEntry(exchange,'BTC/USDT:USDT',
    {side:'BUY',entryPrice:100,stopLoss:99,takeProfit:103,exitPolicy:'FIXED_3R'},{id:'e'});
  assert.equal(snapshot.initialQty,2);
});
