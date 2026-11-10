import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlSession} from '../js/control.js';

// Dobles locales: ninguna prueba de este archivo usa fetch, WebSocket ni AWS.
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function setup(){
  const calls={move:[],stop:[],startDemo:[],cancelDemo:[]};
  const api=Object.fromEntries(Object.keys(calls).map(name=>[name,(...args)=>{
    const result=deferred();calls[name].push({...result,args});return result.promise;
  }]));
  const operations=[],movements=[],steps=[];
  const session=new ControlSession(api,{
    operation:(...args)=>operations.push(args),movement:value=>movements.push(value),
    step:value=>steps.push(value),
  });
  const commands=[
    {id_comando:42,codigo:2,nombre:'AVANZAR',id_vehiculo:1,activo:true},
    {id_comando:84,codigo:5,nombre:'RETROCEDER',id_vehiculo:1,activo:true},
    {id_comando:126,codigo:8,nombre:'GIRAR_DERECHA',id_vehiculo:1,activo:true},
  ];
  Object.assign(session.state,{commands,selectedDemo:7,stepsReady:true});
  return {session,calls,commands,operations,movements,steps};
}
const event=(tipo,id_ejecucion='run-1',extras={})=>({tipo,id_vehiculo:1,id_demo:7,id_ejecucion,...extras});
const accepted=(id_ejecucion='run-1')=>({id_vehiculo:1,id_demo:7,id_ejecucion,total_movimientos:3,estado:'iniciada'});

test('STOP sale inmediatamente, aborta movimiento y descarta dirección pendiente',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);
  await h.session.move(h.commands[1]);
  const stopping=h.session.stop();
  assert.equal(h.calls.stop.length,1);
  assert.equal(h.calls.move[0].args[1].aborted,true);
  assert.equal(h.session.state.pending,null);
  assert.equal(h.session.state.stopBusy,true);
  await h.session.move(h.commands[2]);assert.equal(h.calls.move.length,1);
  h.calls.stop[0].resolve({detencion_logica:true});await stopping;
  const lastOperation=h.operations.at(-1)[0];
  // Incluso una respuesta del movimiento que sobreviva al aborto no reactiva la UI.
  h.calls.move[0].resolve({id_comando:42});await running;
  assert.equal(h.calls.move.length,1);assert.equal(h.movements.at(-1),'NEUTRAL');
  assert.equal(h.operations.at(-1)[0],lastOperation);
});

test('sólo se envía la última dirección pendiente, sin duplicados mientras hay petición',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);
  await h.session.move(h.commands[1]);await h.session.move(h.commands[2]);await h.session.move(h.commands[2]);
  assert.equal(h.calls.move.length,1);
  h.calls.move[0].resolve({id_comando:42});await running;
  assert.equal(h.calls.move.length,2);assert.equal(h.calls.move[1].args[0],126);
  h.calls.move[1].resolve({id_comando:126});await Promise.resolve();
  assert.equal(h.calls.move.length,2);
});

test('volver a la dirección en vuelo elimina un cambio pendiente obsoleto',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);
  await h.session.move(h.commands[1]);await h.session.move(h.commands[0]);
  h.calls.move[0].resolve({id_comando:42});await running;
  assert.equal(h.calls.move.length,1);assert.equal(h.session.state.pending,null);
});

test('sólo se aceptan comandos presentes en el catálogo recibido',async()=>{
  const h=setup();
  await h.session.move({...h.commands[0]});
  await h.session.move({id_comando:999,nombre:'INVENTADO'});
  assert.equal(h.calls.move.length,0);
  const running=h.session.move(h.commands[0]);
  assert.equal(h.calls.move[0].args[0],42);
  h.calls.move[0].resolve({id_comando:42});await running;
});

test('DEMO no inicia sin pasos cargados ni durante un movimiento en curso',async()=>{
  const h=setup();h.session.state.stepsReady=false;
  await h.session.start();assert.equal(h.calls.startDemo.length,0);
  h.session.state.stepsReady=true;
  const running=h.session.move(h.commands[0]);
  await h.session.start();assert.equal(h.calls.startDemo.length,0);
  h.calls.move[0].resolve({id_comando:42});await running;
  const starting=h.session.start();assert.equal(h.calls.startDemo.length,1);
  h.calls.startDemo[0].resolve(accepted());await starting;
});

test('respuesta de inicio DEMO posterior a STOP no vuelve a activar la ejecución',async()=>{
  const h=setup();h.session.connected();const starting=h.session.start();
  const stopping=h.session.stop();
  h.calls.stop[0].resolve({detencion_logica:true});await stopping;
  h.calls.startDemo[0].resolve(accepted());await starting;
  assert.equal(h.session.state.demoActive,false);assert.equal(h.session.state.execution,null);
  assert.equal(h.movements.at(-1),'NEUTRAL');
});

test('terminal WSS anterior a respuesta de inicio prevalece sobre el HTTP tardío',async()=>{
  const h=setup();h.session.connected();const starting=h.session.start();
  h.session.event(event('demo_inicio'));
  h.session.event(event('demo_fin'));
  h.calls.startDemo[0].resolve(accepted());await starting;
  assert.equal(h.session.state.demoActive,false);assert.equal(h.session.state.execution,null);
  assert.equal(h.movements.at(-1),'NEUTRAL');
});

test('pasos WSS mantienen orden y rechazan duplicados o eventos de otra ejecución activa',()=>{
  const h=setup();h.session.connected();h.session.event(event('demo_inicio'));
  h.session.event(event('demo_movimiento','run-1',{orden:1,comando:'AVANZAR'}));
  h.session.event(event('demo_movimiento','run-1',{orden:1,comando:'AVANZAR'}));
  h.session.event(event('demo_movimiento','run-1',{orden:0,comando:'AVANZAR'}));
  h.session.event(event('demo_movimiento','run-2',{orden:9,comando:'RETROCEDER'}));
  h.session.event(event('demo_fin','run-2'));
  assert.equal(h.session.state.lastOrder,1);assert.equal(h.session.state.demoActive,true);
  assert.equal(h.session.state.execution,'run-1');assert.deepEqual(h.steps,[1]);
  h.session.event(event('demo_movimiento','run-1',{orden:2,comando:'RETROCEDER'}));
  assert.deepEqual(h.steps,[1,2]);
  h.session.event(event('demo_fin'));assert.equal(h.session.state.demoActive,false);
  h.session.event(event('demo_movimiento','run-1',{orden:3}));
  assert.equal(h.session.state.demoActive,false);assert.equal(h.session.state.execution,null);
});

test('cancelación HTTP tardía no desactiva una ejecución nueva observada tras STOP',async()=>{
  const h=setup();h.session.connected();h.session.event(event('demo_inicio'));
  const cancelling=h.session.cancel();assert.equal(h.calls.cancelDemo[0].args[0],7);
  const stopping=h.session.stop();h.calls.stop[0].resolve({detencion_logica:true});await stopping;
  h.session.event(event('demo_inicio','run-2'));
  h.calls.cancelDemo[0].resolve({...accepted(),estado:'cancelada'});await cancelling;
  assert.equal(h.session.state.demoActive,true);assert.equal(h.session.state.execution,'run-2');
  assert.equal(h.movements.at(-1),'DEMO EN CURSO');
});

test('error de cancelación tardío no marca incierta una nueva ejecución tras terminal',async()=>{
  const h=setup();h.session.connected();h.session.event(event('demo_inicio'));
  const cancelling=h.session.cancel();
  h.session.event(event('demo_cancelada'));h.session.event(event('demo_inicio','run-2'));
  h.calls.cancelDemo[0].reject(Error('Respuesta perdida'));await cancelling;
  assert.equal(h.session.state.demoActive,true);assert.equal(h.session.state.execution,'run-2');
  assert.equal(h.session.state.uncertain,false);
});

test('desconexión durante DEMO conserva incertidumbre tras reconnect y estado_inicial',async()=>{
  const h=setup();h.session.connected();h.session.event(event('demo_inicio'));
  h.session.disconnected();assert.equal(h.session.state.uncertain,true);assert.equal(h.session.canMove(),false);
  h.session.connected();h.session.event({tipo:'estado_inicial',id_vehiculo:1,codigo:2});
  assert.equal(h.session.state.uncertain,true);
  const stopping=h.session.stop();h.calls.stop[0].resolve({detencion_logica:true});await stopping;
  assert.equal(h.session.state.uncertain,false);assert.equal(h.session.state.demoActive,false);
});

test('reconectar antes del HTTP de inicio no borra el hueco de observación WSS',async()=>{
  const h=setup();h.session.connected();const starting=h.session.start();
  h.session.disconnected();h.session.connected();
  h.calls.startDemo[0].resolve(accepted());await starting;
  assert.equal(h.session.state.demoActive,true);assert.equal(h.session.state.uncertain,true);
  assert.equal(h.session.canMove(),false);
});

test('fallo de STOP bloquea nuevas acciones hasta una detención confirmada',async()=>{
  const h=setup();const stopping=h.session.stop();
  h.calls.stop[0].reject(Error('Sin respuesta'));await stopping;
  assert.equal(h.session.state.uncertain,true);assert.equal(h.session.canMove(),false);
  await h.session.move(h.commands[0]);await h.session.start();
  assert.equal(h.calls.move.length,0);assert.equal(h.calls.startDemo.length,0);
  h.session.event({tipo:'detencion_logica',id_vehiculo:1});
  assert.equal(h.session.state.uncertain,false);assert.equal(h.session.canMove(),true);
});

test('detención WSS remota aborta movimiento pendiente y no requiere un POST del navegador',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);await h.session.move(h.commands[1]);
  h.session.event({tipo:'detencion_logica',id_vehiculo:1});
  assert.equal(h.calls.move[0].args[1].aborted,true);assert.equal(h.calls.stop.length,0);
  assert.equal(h.session.state.pending,null);
  h.calls.move[0].resolve({id_comando:42});await running;
  assert.equal(h.calls.move.length,1);assert.equal(h.movements.at(-1),'NEUTRAL');
});

test('un error HTTP tardío de STOP no sobrescribe detención confirmada por WSS',async()=>{
  const h=setup();const stopping=h.session.stop();
  h.session.event({tipo:'detencion_logica',id_vehiculo:1});
  const operation=h.operations.at(-1)[0];
  h.calls.stop[0].reject(Error('Tiempo agotado'));await stopping;
  assert.equal(h.session.state.uncertain,false);
  assert.equal(h.movements.at(-1),'NEUTRAL');assert.equal(h.operations.at(-1)[0],operation);
});

test('una ejecución nueva acepta paso 1 aunque falte inicio tras otra DEMO detenida',async()=>{
  const h=setup();h.session.event(event('demo_movimiento','run-1',{orden:8}));
  const stopping=h.session.stop();h.calls.stop[0].resolve({detencion_logica:true});await stopping;
  h.session.event(event('demo_movimiento','run-2',{orden:1}));
  assert.equal(h.session.state.lastOrder,1);assert.equal(h.session.state.execution,'run-2');
  assert.equal(h.session.state.demoActive,true);assert.equal(h.session.canMove(),false);
});

test('inicio duplicado no permite retroceder en los pasos de la misma ejecución',()=>{
  const h=setup();h.session.event(event('demo_movimiento','run-1',{orden:3}));
  h.session.event(event('demo_inicio'));h.session.event(event('demo_movimiento','run-1',{orden:2}));
  assert.equal(h.session.state.lastOrder,3);assert.deepEqual(h.steps,[3]);
});

test('inicio WSS previo al HTTP 202 conserva la aceptación de la misma ejecución',async()=>{
  const h=setup();h.session.connected();const starting=h.session.start();
  h.session.event(event('demo_inicio'));h.calls.startDemo[0].resolve(accepted());await starting;
  assert.equal(h.session.state.demoActive,true);assert.match(h.operations.at(-1)[0],/HTTP 202/);
});

test('aceptación HTTP tardía no degrada el estado de evento WSS de un comando',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);
  assert.equal(h.session.state.movementPhase,'sending');
  h.session.event({tipo:'movimiento_individual',id_vehiculo:1,id_comando:42,comando:'AVANZAR'});
  assert.equal(h.session.state.movementPhase,'received');
  h.calls.move[0].resolve({id_comando:42});await running;
  assert.equal(h.session.state.movementPhase,'received');
  const stopping=h.session.stop();assert.equal(h.session.state.movementPhase,'idle');
  h.calls.stop[0].resolve({detencion_logica:true});await stopping;
});

test('fallo HTTP posterior conserva la evidencia WSS y explica su correlación limitada',async()=>{
  const h=setup();const running=h.session.move(h.commands[0]);
  h.session.event({tipo:'movimiento_individual',id_vehiculo:1,id_comando:42,comando:'AVANZAR'});
  h.calls.move[0].reject(Error('Red interrumpida'));await running;
  assert.equal(h.session.state.movementPhase,'received');
  assert.match(h.operations.at(-1)[0],/HTTP sin confirmación; evento WSS recibido/);
});
