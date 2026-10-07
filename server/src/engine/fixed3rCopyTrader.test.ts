import assert from 'node:assert/strict';
import { test,mock } from 'node:test';
import { ClientCopyTraderEngine } from './clientCopyTraderEngine.js';
import { ClientConfigDB } from '../database/db.js';
import { BybitExecutionEngine } from './bybitExecutionEngine.js';

test('fixed client native barriers govern automatic exits; manual exception still closes',async()=>{
  const engine=new ClientCopyTraderEngine();
  for(const client of engine.getClients()) engine.addOrUpdateClient({...client,isActive:false});
  const config=mock.method(ClientConfigDB,'listAll',async()=>[{client_id:'native',is_active:1,plan_active:1,
    plan_type:'PRO',sync_enabled:1,bybit_real_connected:1,bybit_real_api_key_enc:'fake'}] as any);
  const close=mock.method(BybitExecutionEngine,'closeCopyPosition',async()=>({success:true}));
  try {
    const trade={id:'master',symbol:'BTC/USDT',type:'BUY',status:'CLOSED_TP',exitPolicy:'FIXED_3R',
      closeReason:'FIXED_TP',entryPrice:100,currentPrice:103,powerMultiplier:1.5} as any;
    await engine.replicateTrade(trade);
    assert.equal(close.mock.callCount(),0);
    await engine.replicateTrade({...trade,closeReason:'MANUAL'});
    assert.equal(close.mock.callCount(),1);
  } finally {config.mock.restore();close.mock.restore();}
});
