import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {SustainedControl} from '../js/sustained.js';

const capability={habilitado:true,disponible:true,diagonales:true,barrera:'barrera-1',ttl_ms:300,renovar_ms:50};

async function until(predicate){
  for(let i=0;i<200;i++){
    if(predicate())return;
    await wait(5);
  }
  assert.fail('No se observó la transición esperada');
}

function setup(t){
  const calls=[],events=[];
  const api={
    async sustainedCapability(){return capability;},
    sustainedRequest(action,payload,signal){
      let resolve,reject;
      const reply=new Promise((yes,no)=>{resolve=yes;reject=no;});
      calls.push({action,payload,signal,resolve,reject});
      return reply;
    },
  };
  let ids=0;
  const session=new SustainedControl(api,{
    accepted:(direction,sample)=>events.push({direction,sample}),
    released:sample=>events.push({sample}),
    failed:sample=>events.push({sample}),
  },{uuid:()=>`gesto-${++ids}`});
  t.after(()=>session.invalidate());
  function ack(index,extra={}){
    const call=calls[index];
    call.resolve({...call.payload,ttl_ms:capability.ttl_ms,liberado:true,...extra});
  }
  return {session,api,calls,events,ack};
}

test('liberar mientras el permiso sigue en vuelo impide despachar el primer vector',async t=>{
  const {session,calls,ack}=setup(t);
  await session.refresh();
  assert(session.direction('up'));
  const release=session.release();
  assert.equal(session.active,false);
  assert.equal(calls[0].signal.aborted,true);
  assert.deepEqual(calls.map(c=>c.action),['permiso','liberar']);
  ack(0);
  ack(1);
  assert(await release);
  assert.equal(calls.length,2);
});

test('un solo vector en vuelo y el último cambio gana al confirmar',async t=>{
  const {session,calls,ack}=setup(t);
  await session.refresh();
  session.direction('up');ack(0);
  await until(()=>calls.length===2);
  assert.equal(calls[1].payload.secuencia,2);
  session.direction('down');session.direction('up-right');
  assert.equal(calls.length,2);
  ack(1);
  await until(()=>calls.length===3);
  assert.deepEqual(calls[2].payload,{barrera:'barrera-1',gesto:'gesto-1',secuencia:3,longitudinal:1,lateral:1});
});

test('renueva sólo mientras se mantiene el gesto y continúa el eje restante',async t=>{
  const {session,calls,ack}=setup(t);
  await session.refresh();
  session.direction('down-left');ack(0);
  await until(()=>calls.length===2);
  ack(1);
  await until(()=>calls.length===3);
  assert.equal(calls[2].payload.longitudinal,-1);
  assert.equal(calls[2].payload.lateral,-1);
  session.direction('left');ack(2);
  await until(()=>calls.length===4);
  assert.equal(calls[3].payload.longitudinal,0);
  assert.equal(calls[3].payload.lateral,-1);
  const release=session.release();
  ack(3);ack(4);
  assert(await release);
  assert.equal(calls.length,5);
});

test('STOP global descarta respuestas de un gesto y no degrada a legado',async t=>{
  const {session,api,calls,events,ack}=setup(t);
  await session.refresh();
  session.direction('up');ack(0);
  await until(()=>calls.length===2);
  session.invalidate();
  ack(1);
  api.sustainedCapability=async()=>{throw Object.assign(new Error('missing'),{status:404});};
  await session.refresh();
  assert.equal(events.length,0);
  assert.equal(session.mode,'unavailable');
  assert.equal(session.direction('up'),false);
});

test('un permiso estancado vence y se libera sin reintentos',async t=>{
  const {session,calls,events,ack}=setup(t);
  await session.refresh();
  session.direction('up');
  await until(()=>calls.length===2);
  assert.equal(calls[1].action,'liberar');
  assert.equal(calls[0].signal.aborted,true);
  assert.equal(events[0].sample.action,'vencimiento');
  ack(0);ack(1);
  assert(await session.release());
  assert.equal(calls.length,2);
});

test('una diagonal requiere capacidad explícita y un HTTP 404 inicial detecta legado',async t=>{
  const {session,api,calls}=setup(t);
  api.sustainedCapability=async()=>{throw Object.assign(new Error('missing'),{status:404});};
  await session.refresh();
  assert.equal(session.mode,'legacy');
  api.sustainedCapability=async()=>({...capability,diagonales:false});
  await session.refresh();
  assert.equal(session.direction('down-right'),false);
  assert.equal(calls.length,0);
});
