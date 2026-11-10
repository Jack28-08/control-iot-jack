import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiClient,ApiError} from '../js/api.js';

function fakeFetch(t,implementation){
  const previous=globalThis.fetch;
  globalThis.fetch=implementation;
  t.after(()=>{globalThis.fetch=previous;});
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('GET no transmite la clave y POST usa el id_comando recibido del catálogo',async t=>{
  const calls=[];
  fakeFetch(t,async(url,options)=>{calls.push({url,options});return json({id_comando:42});});
  const api=new ApiClient();api.setKey('test-operator');
  await api.commands();
  await api.move(42);
  assert.equal(calls[0].options.headers['X-API-Key'],undefined);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[1].options.method,'POST');
  assert.equal(calls[1].options.headers['X-API-Key'],'test-operator');
  assert.deepEqual(JSON.parse(calls[1].options.body),{id_comando:42,origen:'CONTROL-WEB'});
});

test('sin clave o después de borrarla no se envía ningún POST',async t=>{
  let calls=0;fakeFetch(t,async()=>{calls++;return json({});});
  const api=new ApiClient();
  await assert.rejects(api.stop(),e=>e instanceof ApiError&&e.code==='auth_missing');
  api.setKey('test-operator');assert.equal(api.hasKey,true);
  api.clearKey();assert.equal(api.hasKey,false);
  await assert.rejects(api.startDemo(3),e=>e.code==='auth_missing');
  assert.equal(calls,0);
});

test('inicio DEMO exige HTTP 202 y conserva el cuerpo del contrato',async t=>{
  const body={id_vehiculo:1,id_demo:3,id_ejecucion:'test-run',estado:'iniciada',total_movimientos:2};
  let status=202;fakeFetch(t,async()=>json(body,status));
  const api=new ApiClient();api.setKey('test-operator');
  assert.deepEqual(await api.startDemo(3),body);
  status=200;
  await assert.rejects(api.startDemo(3),e=>e.code==='unexpected_status'&&e.status===200);
});

test('salud exige HTTP 200 y conserva el 503 para diagnóstico RDS',async t=>{
  let status=202;fakeFetch(t,async()=>json({status:'ok'},status));
  const api=new ApiClient();
  await assert.rejects(api.health(),e=>e.code==='unexpected_status');
  status=503;
  await assert.rejects(api.rdsHealth(),e=>e.code==='http'&&e.status===503);
  status=200;
  assert.deepEqual(await api.rdsHealth(),{status:'ok'});
});

test('errores HTTP no reflejan detail arbitrario del servidor',async t=>{
  const reflected='sensitive-test-marker';
  fakeFetch(t,async()=>json({detail:reflected},401));
  await assert.rejects(new ApiClient().health(),e=>e.status===401&&!e.message.includes(reflected));
});

test('abortar movimiento propaga la señal sin reintentar ni ocultar la incertidumbre',async t=>{
  let calls=0;
  fakeFetch(t,(_url,{signal})=>new Promise((_resolve,reject)=>{
    calls++;
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  }));
  const api=new ApiClient();api.setKey('test-operator');
  const controller=new AbortController();const movement=api.move(42,controller.signal);
  controller.abort('priority_stop');
  await assert.rejects(movement,e=>e.code==='aborted'&&/Confirma el estado/.test(e.message));
  assert.equal(calls,1);
});

test('JSON inválido y fallo de red tienen errores distintos',async t=>{
  let network=false;
  fakeFetch(t,async()=>{if(network)throw new TypeError('Failed to fetch');return new Response('<html>error</html>',{status:200});});
  const api=new ApiClient();
  await assert.rejects(api.health(),e=>e.code==='invalid_json');
  network=true;
  await assert.rejects(api.health(),e=>e.code==='network'&&e.status===0);
});
