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

const sampleToken='t'.repeat(43);
const session=()=>({token:sampleToken,expires_at:new Date(Date.now()+60000).toISOString()});

test('sesión temporal va sólo a los POST de control y el operador puede usar su clave en memoria',async t=>{
  const calls=[];
  fakeFetch(t,async(url,options)=>{
    calls.push([new URL(url),options]);
    return url.includes('/evaluacion/')?json(session()):json({},url.endsWith('/iniciar')?202:200);
  });
  const api=new ApiClient();
  const [a,b]=await Promise.all([api.evaluation(),api.evaluation()]);
  assert.equal(a&&b,true);
  await api.state();await api.history();
  await api.move(42);await api.startDemo(3);await api.cancelDemo(3);await api.stop();
  api.setKey('test-operator');await api.stop();
  assert.deepEqual(calls.map(([url,o])=>[url.pathname,o.method,o.headers.Authorization]),[
    ['/evaluacion/vehiculos/1','GET',undefined],
    ['/vehiculos/1/estado','GET',undefined],
    ['/vehiculos/1/historial','GET',undefined],
    ['/vehiculos/1/movimientos','POST',`Bearer ${sampleToken}`],
    ['/vehiculos/1/demos/3/iniciar','POST',`Bearer ${sampleToken}`],
    ['/vehiculos/1/demos/3/cancelar','POST',`Bearer ${sampleToken}`],
    ['/vehiculos/1/detener','POST',`Bearer ${sampleToken}`],
    ['/vehiculos/1/detener','POST',undefined],
  ]);
  assert.equal(calls.at(-1)[1].headers['X-API-Key'],'test-operator');
  assert(calls.every(([url,o])=>url.protocol==='https:'&&o.credentials==='omit'&&o.redirect==='error'));
});

test('revocación del POST borra el token aun si el error no es JSON y no repite órdenes',async t=>{
  let release,gets=0,posts=0;
  fakeFetch(t,async(_url,{method})=>{
    if(method==='POST'){posts++;return new Response('Denied',{status:403});}
    if(++gets===1)return json(session());
    return new Promise(resolve=>{release=()=>resolve(json(session()));});
  });
  const api=new ApiClient();
  assert(await api.evaluation());
  const renewal=api.evaluation({force:true});
  await assert.rejects(api.stop(),e=>e.status===403);
  release();
  assert.equal(await renewal,false);
  assert.equal(api.hasAccess,false);
  assert.equal(api.evaluationStatus,'closed');
  await assert.rejects(api.stop(),e=>e.code==='auth_missing');
  assert.equal(posts,1);
});

test('sesiones expiradas o con fecha inválida mantienen la app en lectura',async t=>{
  let expiration='2026-11-13T00:00:00';
  fakeFetch(t,async()=>json({...session(),expires_at:expiration}));
  const api=new ApiClient();
  assert.equal(await api.evaluation(),false);
  expiration=new Date(Date.now()-1000).toISOString();
  assert.equal(await api.evaluation(),false);
  assert.equal(api.hasAccess,false);
});
