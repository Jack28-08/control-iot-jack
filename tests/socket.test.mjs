import test from 'node:test';
import assert from 'node:assert/strict';
import {VehicleSocket} from '../js/socket.js';

function harness(t){
  const originals={WebSocket:globalThis.WebSocket,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
  const sockets=[],timers=new Map();let next=0,throwConstructor=false;
  class FakeSocket{
    listeners=new Map();closed=false;
    constructor(url,protocols){if(throwConstructor)throw new Error('Connection unavailable');this.url=url;this.protocols=protocols;sockets.push(this);}
    addEventListener(type,callback){this.listeners.set(type,callback);}
    emit(type,data={}){this.listeners.get(type)?.(data);}
    close(){this.closed=true;this.emit('close');}
  }
  globalThis.WebSocket=FakeSocket;
  globalThis.setTimeout=(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  t.after(()=>Object.assign(globalThis,originals));
  const statuses=[],events=[];
  const client=new VehicleSocket(s=>statuses.push(s),e=>events.push(e));
  return {client,sockets,timers,statuses,events,setThrow:value=>{throwConstructor=value;},tick(){const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}};
}

test('start idempotente y close ignora eventos tardíos de una conexión anterior',t=>{
  const h=harness(t);h.client.start();h.client.start();
  assert.equal(h.sockets.length,1);
  const old=h.sockets[0];old.emit('open');assert.equal(h.statuses.at(-1),'En línea');
  h.client.close();
  old.emit('open');old.emit('message',{data:JSON.stringify({tipo:'estado_inicial',id_vehiculo:1,fecha_hora:'2026-11-13T14:00:00Z'})});
  assert.equal(h.statuses.at(-1),'Desconectado');assert.equal(h.events.length,0);
  assert.equal(h.timers.size,0);assert.equal(old.closed,true);
  h.client.start();assert.equal(h.sockets.length,2);
});

test('desconexión programa sólo una reconexión y close cancela la espera',t=>{
  const h=harness(t);h.client.start();h.sockets[0].emit('close');h.sockets[0].emit('close');
  assert.equal(h.timers.size,1);
  assert.ok([...h.timers.values()][0].delay>=1600);
  h.tick();assert.equal(h.sockets.length,2);assert.equal(h.statuses.at(-1),'Reconectando');
  h.sockets[1].emit('open');assert.equal(h.statuses.at(-1),'En línea');
  h.sockets[1].emit('close');assert.equal(h.timers.size,1);
  h.client.close();assert.equal(h.timers.size,0);
});

test('constructor WebSocket fallido reconecta y mensajes se filtran por vehículo',t=>{
  const h=harness(t);h.setThrow(true);h.client.start();
  assert.equal(h.statuses.at(-1),'Desconectado');assert.equal(h.timers.size,1);
  h.setThrow(false);h.tick();const socket=h.sockets[0];
  socket.emit('message',{data:'invalid'});
  const event={tipo:'estado_inicial',id_vehiculo:1,fecha_hora:'2026-11-13T14:00:00Z'};
  socket.emit('message',{data:JSON.stringify({...event,id_vehiculo:2})});
  socket.emit('message',{data:JSON.stringify(event)});
  assert.equal(h.events.length,1);assert.equal(h.events[0].id_vehiculo,1);
  h.client.close();
});

test('una conexión WSS sin handshake vence y reconecta sin aceptar apertura tardía',t=>{
  const h=harness(t);h.client.start();
  const first=h.sockets[0];
  assert.equal([...h.timers.values()][0].delay,12000);
  h.tick();
  assert.equal(first.closed,true);
  assert.equal(h.statuses.at(-1),'Desconectado');
  first.emit('open');
  assert.equal(h.statuses.at(-1),'Desconectado');
  h.tick();
  assert.equal(h.sockets.length,2);
  h.sockets[1].emit('open');
  assert.equal(h.statuses.at(-1),'En línea');
  assert.equal(h.timers.size,0);
  h.client.close();
});

test('el ticket de plataforma viaja en subprotocolo y un ticket anterior no abre otra unidad',async t=>{
  const h=harness(t);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  let settleFirst;
  h.client.configure(17,vehicle=>{
    assert.equal(vehicle,17);return new Promise(resolve=>{settleFirst=resolve;});
  });
  h.client.start();
  await flush();
  const latest='Z'.repeat(32);
  h.client.configure(22,vehicle=>{assert.equal(vehicle,22);return Promise.resolve(latest);});
  h.client.start();
  settleFirst('A'.repeat(32));
  await flush();
  assert.equal(h.sockets.length,1);
  assert.equal(h.sockets[0].url,'wss://184-72-72-255.sslip.io/ws/vehiculos/22');
  assert.deepEqual(h.sockets[0].protocols,['node01',`ticket.${latest}`]);
  const event={tipo:'estado_inicial',fecha_hora:'2026-11-23T15:00:00Z'};
  h.sockets[0].emit('message',{data:JSON.stringify({...event,id_vehiculo:17})});
  h.sockets[0].emit('message',{data:JSON.stringify({...event,id_vehiculo:22})});
  assert.deepEqual(h.events.map(event=>event.id_vehiculo),[22]);
  h.client.close();
});
