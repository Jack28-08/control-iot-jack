import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {MonitorSession,normalizeHistory} from '../js/monitor.js';

const date='2026-11-13T14:00:00';
const rest=(id=2,time=date)=>({id_vehiculo:1,vehiculo:'Vehículo IoT',id_comando:id,
  comando:'AVANZAR',codigo:7,conectado:false,fecha_actualizacion:time});
const row=(id,time=date,vehicle=1)=>({id_historial:id,id_vehiculo:vehicle,comando:'AVANZAR',
  codigo:7,fecha_hora:time,origen:'PRUEBA'});
const individual=(id=2,time=date+'Z')=>({tipo:'movimiento_individual',id_vehiculo:1,id_comando:id,
  comando:'AVANZAR',codigo:7,fecha_hora:time});
const demo=(tipo,fecha_hora,extra={})=>({tipo,fecha_hora,id_vehiculo:1,id_demo:3,
  id_ejecucion:'demo-test',total_movimientos:2,...extra});

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

test('historial filtra vehículo, deduplica IDs y ordena por hora e ID hasta diez',()=>{
  const input=Array.from({length:13},(_,i)=>row(i+1));
  input.push(row(50,'2026-11-13T13:59:59'),row(3,'2026-11-13T15:00:00'),row(999,date,2));
  const rows=normalizeHistory(input);
  assert.deepEqual(rows.map(r=>r.id_historial),[3,13,12,11,10,9,8,7,6,5]);
  assert.equal(rows[0].fecha_hora,'2026-11-13T15:00:00.000Z');
  assert.throws(()=>normalizeHistory({}),TypeError);
});

test('al entrar consulta REST y no deja que la respuesta anterior desplace a WSS',async t=>{
  const initial=deferred();
  const api={state:()=>initial.promise,history:async()=>[]};
  const monitor=new MonitorSession(api,()=>{}, {historySettleMs:1});
  t.after(()=>monitor.close());
  const loading=monitor.enter();
  assert.equal(monitor.model.stateStatus,'loading');
  monitor.event(individual(8));
  initial.resolve(rest(2));await loading;
  assert.equal(monitor.model.state.commandId,8);
  assert.equal(monitor.model.state.source,'WSS');
  await monitor.refresh();
  assert.equal(monitor.model.state.commandId,8);
  assert.equal(monitor.model.historyStatus,'empty');
});

test('un snapshot inicial sin comando no usa la hora del sobre como fecha de movimiento',async t=>{
  const monitor=new MonitorSession({state:async()=>rest(2),history:async()=>[]},()=>{});
  t.after(()=>monitor.close());
  monitor.event({tipo:'estado_inicial',id_vehiculo:1,conectado:false,fecha_hora:'2026-11-13T16:00:00Z'});
  assert.equal(monitor.model.state.timestamp,null);
  await monitor.enter();
  assert.equal(monitor.model.state.commandId,2);
  assert.equal(monitor.model.state.timestamp,'2026-11-13T14:00:00.000Z');
});

test('eventos durante un GET programan una lectura posterior sin abortar cada petición',async t=>{
  const initial=deferred();
  const updated=deferred();
  let signal,calls=0;
  const api={state:async()=>null,history(input){
    if(++calls===1){signal=input;return initial.promise;}
    return updated.promise;
  }};
  const monitor=new MonitorSession(api,()=>{}, {historySettleMs:1});
  t.after(()=>monitor.close());
  const first=monitor.enter();
  assert.equal(monitor.event({...individual(),id_vehiculo:2}),false);
  monitor.event(individual());monitor.event(individual());
  assert.equal(signal.aborted,false);
  assert.equal(calls,1);
  initial.resolve([row(1)]);await first;
  assert.equal(monitor.model.historyStatus,'stale');
  await wait(10);
  assert.equal(calls,2);
  updated.resolve([row(1),row(2)]);
  await wait(0);
  assert.deepEqual(monitor.model.history.map(r=>r.id_historial),[2,1]);
  assert.equal(monitor.model.historyStatus,'ready');
});

test('una carga que ignora abort no revierte la reconciliación al reconectar',async t=>{
  const previous=deferred(),synced=deferred();
  let states=0,history=0;
  const api={state:async()=>rest(++states),history:()=>++history===1?previous.promise:synced.promise};
  const monitor=new MonitorSession(api,()=>{});
  t.after(()=>monitor.close());
  monitor.connection('En línea');
  const first=monitor.enter();
  monitor.connection('Desconectado');monitor.connection('Reconectando');monitor.connection('En línea');
  synced.resolve([row(3)]);await wait(0);
  previous.resolve([row(2)]);await first;
  assert.equal(monitor.model.history[0].id_historial,3);
  assert.equal(monitor.model.state.commandId,2);
  assert.equal(history,2);
});

test('DEMO acepta pasos con timestamp MySQL truncado y no añade historial',async t=>{
  let requests=0;
  const monitor=new MonitorSession({state:async()=>null,history:async()=>{requests++;return [row(1)];}},()=>{},{historySettleMs:1});
  t.after(()=>monitor.close());
  await monitor.enter();
  assert(monitor.event(demo('demo_inicio',date+'.604Z')));
  const step={...individual(8),tipo:'demo_movimiento',id_ejecucion:'demo-test',id_demo:3,
    total_movimientos:2,orden:1,duracion_ms:500,pausa_ms:0};
  assert(monitor.event(step));
  assert.equal(monitor.model.state.commandId,8);
  assert.equal(monitor.model.phase,'Paso de la demo confirmado');
  assert.equal(monitor.event(step),false);
  assert(monitor.event(demo('demo_cancelada',date+'.922Z')));
  assert.equal(monitor.event({...step,orden:2}),false);
  assert.equal(monitor.event(demo('demo_fin',date+'.501Z',{id_ejecucion:'otro'})),false);
  assert.equal(monitor.model.phase,'Demo cancelada');
  await wait(10);
  assert.equal(requests,1);
  assert.deepEqual(monitor.model.history.map(r=>r.id_historial),[1]);
});

test('respuesta de movimiento no fabrica filas y confirma órdenes del mismo segundo sin WSS',async t=>{
  const monitor=new MonitorSession({state:async()=>rest(2),history:async()=>[row(1)]},()=>{},{historySettleMs:1});
  t.after(()=>monitor.close());
  await monitor.enter();
  const result={id_vehiculo:1,id_comando:8,estado:rest(8),historial:row(3)};
  monitor.confirmIndividual(result);
  monitor.confirmIndividual({...result,id_comando:2,estado:rest(2),historial:row(2)});
  assert.equal(monitor.model.state.commandId,8);
  assert.deepEqual(monitor.model.history.map(r=>r.id_historial),[1]);
});
