// Servidor estático de loopback y dobles REST/WSS aislados de AWS.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
  ?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.env.NODE01_PLATFORM_EVIDENCE_DIR??'entregables/practica-4.3/evidencias/browser-local');
await mkdir(output,{recursive:true});
const bootstrap=await readFile(resolve(root,'.local/bootstrap-5.3.3.min.css'),'utf8').catch(()=>'');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=createServer(async(request,response)=>{
  try{
    const pathname=new URL(request.url,'http://local').pathname;
    const path=resolve(root,pathname==='/'?'index.html':`.${pathname}`);
    if(request.method!=='GET'||!path.startsWith(resolve(root)+sep)||!types[extname(path)])throw Error('Recurso no encontrado.');
    const body=await readFile(path);
    response.writeHead(200,{'Content-Type':`${types[extname(path)]}; charset=utf-8`});response.end(body);
  }catch{response.writeHead(404);response.end();}
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE||undefined});
const testToken='T'.repeat(43),ticket='J'.repeat(32),expiry=()=>new Date(Date.now()+600000).toISOString();
const api='https://184-72-72-255.sslip.io';
const metrics={modelos_activos:1,unidades_activas:2,unidades_inventario:0,unidades_vendidas:1,
  unidades_exhibicion:1,clientes_activos:1,demos_activas:1,reservas_activas:0};
const model={id:3,sku:'NODO-V',nombre:'Modelo de banco',descripcion:'Catálogo de prueba local',publicado:true,activo:true,
  capacidades:[{codigo:2,control:true,invitado:true},{codigo:5,control:true,invitado:true}]};
const units=[
  {id:10,id_vehiculo:17,id_modelo:3,nombre:'Unidad de Ana',serie:'PRUEBA-17',estado:'vendida',fisico:false,id_cliente:7,version:1,modelo:model.nombre},
  {id:12,id_vehiculo:19,id_modelo:3,nombre:'Unidad de exhibición',serie:'PRUEBA-19',estado:'exhibicion',fisico:false,id_cliente:null,version:1,modelo:model.nombre,disponible:true},
];
const buyerUnits=[
  units[0],{...units[0],id:13,id_vehiculo:24,nombre:'Segunda unidad de Ana',serie:'PRUEBA-24'},
];
const viewports=[
  [320,568],[360,640],[375,667],[390,844],[414,896],[430,932],[568,320],[640,360],[667,375],
  [740,360],[844,390],[896,414],[932,430],[768,1024],[1024,768],[1280,720],[1366,768],[1920,1080],
];
const report={entorno:'Chromium local con dobles REST/WSS',real_posts:0,casos:[],vista:[],capturas:[]};

async function fixture(width,height){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',hasTouch:width<450||height<440});
  const page=await context.newPage(),errors=[],mutations=[],sockets=[],requests=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  let role=null,models=[{...model}],demos=[],ticketId=null;
  await context.routeWebSocket('**/*',socket=>{
    const url=new URL(socket.url());
    assert.equal(url.search,'');
    const vehicle=Number(url.pathname.split('/').at(-1));
    assert.equal(vehicle,ticketId);
    sockets.push(vehicle);
  });
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(url.origin===local&&method==='GET'){await route.continue();return;}
    if(url.hostname==='cdn.jsdelivr.net'){await route.fulfill({body:bootstrap,contentType:'text/css'});return;}
    if(url.origin!==api){await route.abort();return;}
    const path=url.pathname,body=request.postDataJSON(),headers=request.headers();
    const send=(status,json)=>route.fulfill({
      status,...(json===null?{}:{json}),
      headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,x-iot-barrier',
        'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'},
    });
    if(method==='OPTIONS'){await send(204,null);return;}
    requests.push({path,method});
    if(path==='/health'||path==='/health/db'){await send(200,{status:'ok'});return;}
    if(path==='/plataforma/status'){await send(200,{habilitada:true});return;}
    if(path==='/plataforma/catalogo'){await send(200,[{...model,unidades:[units[1]]}]);return;}
    if(path==='/plataforma/auth/login'){
      if(body.contrasena!=='fixture-local-exclusivo'){await send(401,{});return;}
      role=body.usuario.startsWith('admin')?'administrador':'comprador';
      await send(200,{token:testToken,expira_en:expiry(),perfil:{id:7,usuario:body.usuario,nombre:'Cuenta de pruebas',rol:role}});return;
    }
    if(path==='/plataforma/reservas'&&method==='POST'){
      role='invitado';await send(201,{token:testToken,expires_at:new Date(Date.now()+120000).toISOString(),id_reserva:81,unidad:units[1]});return;
    }
    assert.equal(headers.authorization,`Bearer ${testToken}`,`falta autorización para ${path}`);
    if(method!=='GET')mutations.push({path,method,body});
    if(path==='/plataforma/admin/dashboard'){await send(role==='administrador'?200:403,metrics);return;}
    if(path==='/plataforma/admin/modelos'){
      if(method==='POST'){models.push({id:5,...body});await send(201,models.at(-1));return;}
      await send(200,models);return;
    }
    if(path==='/plataforma/admin/unidades'){await send(200,units);return;}
    if(path==='/plataforma/admin/clientes'){await send(200,[{id:7,nombre:'Ana de pruebas',correo:'ana@example.invalid',activo:true}]);return;}
    if(path==='/plataforma/admin/unidades/10/asignacion'){await send(200,{...units[0],version:2});return;}
    if(path==='/plataforma/admin/unidades/10/titularidad'){await send(200,[{id_cliente:7,cliente:'Ana de pruebas',
      id_actor:9,inicio:expiry(),fin:null}]);return;}
    if(path==='/plataforma/admin/reservas'){await send(200,[]);return;}
    if(path==='/plataforma/admin/auditoria'){await send(200,[{actor:'Cuenta de pruebas',accion:'asignar',recurso:'Unidad 10',resultado:'ok',fecha:expiry()}]);return;}
    if(path==='/plataforma/mis-unidades'){await send(200,buyerUnits);return;}
    if(path==='/plataforma/demos'){
      if(method==='POST'){demos.push({id:4,...body});await send(201,demos.at(-1));return;}
      const factory={id:4,id_modelo:3,nombre:'Recorrido de fábrica',tipo:'fabrica',activo:true,
        pasos:[{orden:1,codigo:2,duracion_ms:500,pausa_ms:0}]};
      await send(200,role==='comprador'?[factory,...demos]:demos);return;
    }
    if(path==='/plataforma/demos/4/ejecutar'){
      assert.equal(body.id_unidad,10);
      await send(202,{id_demo:4,id_ejecucion:'00000000-0000-4000-8000-000000000004',id_vehiculo:17,estado:'iniciada',
        total_movimientos:1});return;
    }
    if(path==='/plataforma/tickets'){
      ticketId=body.id_vehiculo;await send(201,{ticket,expira_en:expiry()});return;
    }
    if(path==='/plataforma/reservas/actual'||path==='/plataforma/auth/logout'){
      role=null;await send(204,null);return;
    }
    const match=/^\/vehiculos\/(\d+)(?:\/(.*))?$/.exec(path);
    if(match){
      const id=Number(match[1]),command={id_vehiculo:id,id_comando:id+100,codigo:2,nombre:'AVANZAR',activo:true};
      const allowed=role==='invitado'?id===19:role==='comprador'&&[17,24].includes(id);
      if(!allowed){await send(403,{});return;}
      const name=[...buyerUnits,units[1]].find(row=>row.id_vehiculo===id)?.nombre;
      const state={id_vehiculo:id,vehiculo:name,id_comando:command.id_comando,comando:command.nombre,codigo:2,
        conectado:false,fecha_actualizacion:'2026-11-23T16:00:00Z'};
      const history={id_historial:id,id_vehiculo:id,codigo:2,comando:`MOVIMIENTO UNIDAD ${id}`,
        fecha_hora:'2026-11-23T16:00:00Z',origen:'fixture'};
      const resources={comandos:[command],estado:state,historial:[history],demos:[],'control/capacidad':{habilitado:false}};
      if(match[2]==='movimientos'){await send(200,{id_comando:command.id_comando,id_vehiculo:id,estado:state,historial:history});return;}
      if(match[2]==='detener'){await send(200,{detencion_logica:true});return;}
      await send(200,resources[match[2]]??{id_vehiculo:id,nombre:name,activo:true});return;
    }
    await send(404,{});
  });
  await page.goto(local);
  await page.getByRole('heading',{name:'Plataforma NODE/01'}).waitFor();
  return {page,context,errors,mutations,sockets,requests};
}

async function login(page,account,password='fixture-local-exclusivo'){
  await page.getByLabel('Correo',{exact:true}).fill(`${account}@example.invalid`);
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
}
async function screenshot(page,name){
  const file=`${name}.png`;
  await page.screenshot({path:resolve(output,file),fullPage:true,animations:'disabled'});
  report.capturas.push({archivo:file,origen:'Dobles REST/WSS locales'});
}
async function noHorizontal(page){
  return page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);
}
try{
  const admin=await fixture(1280,720);
  try{
    const {page}=admin;
    await login(page,'admin','clave-incorrecta-de-prueba');
    await page.locator('#platformView [role=status]').getByText(/HTTP 401/).waitFor();
    await screenshot(page,'autorizacion-401-local');
    await login(page,'admin');
    await page.getByRole('heading',{name:'Resumen de operaciones'}).waitFor();
    assert(await page.locator('#showControl').isHidden());
    await screenshot(page,'administracion-dashboard-local');
    await page.getByRole('button',{name:'Modelos',exact:true}).click();
    await page.getByRole('button',{name:'Nuevo modelo',exact:true}).click();
    await page.getByLabel('SKU',{exact:true}).fill('MODELO-02');
    await page.getByLabel('Nombre',{exact:true}).fill('Modelo de prueba 02');
    await page.getByRole('button',{name:'Guardar modelo',exact:true}).click();
    await page.getByText('Modelo de prueba 02',{exact:true}).waitFor();
    await screenshot(page,'administracion-modelos-local');
    await page.getByRole('button',{name:'Unidades',exact:true}).click();
    await page.getByRole('heading',{name:'Inventario de unidades'}).waitFor();
    await screenshot(page,'administracion-unidades-local');
    await page.getByRole('button',{name:'Asignar',exact:true}).first().click();
    await page.getByLabel('Comprador',{exact:true}).selectOption('7');
    await page.getByRole('button',{name:'Confirmar asignación'}).click();
    await page.getByText('Asignación registrada.',{exact:true}).waitFor();
    assert.deepEqual(admin.mutations.find(action=>action.path.endsWith('/asignacion')).body,{id_cliente:7,version:1});
    await page.getByRole('button',{name:'Titularidad',exact:true}).first().click();
    await page.getByRole('heading',{name:'Historial de titularidad'}).waitFor();
    await screenshot(page,'administracion-titularidad-local');
    await page.getByRole('button',{name:'Clientes',exact:true}).click();
    await page.getByText('Ana de pruebas',{exact:true}).waitFor();
    await screenshot(page,'administracion-clientes-local');
    await page.getByRole('button',{name:'DEMOS de fábrica',exact:true}).click();
    await page.getByLabel('Modelo de fábrica',{exact:true}).selectOption('3');
    await page.getByRole('button',{name:'Nueva DEMO',exact:true}).click();
    await page.getByLabel('Nombre',{exact:true}).fill('Circuito de banco');
    await page.getByRole('button',{name:'Agregar paso',exact:true}).click();
    await page.getByLabel('Comando',{exact:true}).last().selectOption('5');
    await page.getByRole('button',{name:'Subir paso',exact:true}).last().click();
    await screenshot(page,'administracion-editor-demo-local');
    await page.getByRole('button',{name:'Guardar DEMO',exact:true}).click();
    await page.getByText('Circuito de banco',{exact:true}).waitFor();
    assert.deepEqual(admin.mutations.find(action=>action.path==='/plataforma/demos').body.pasos.map(step=>step.codigo),[5,2]);
    await page.getByRole('button',{name:'Auditoría',exact:true}).click();
    await page.getByText('asignar',{exact:true}).waitFor();
    await screenshot(page,'administracion-auditoria-local');
    assert.deepEqual(admin.errors,[]);
    report.casos.push('401 y login administrador','Dashboard','Alta de modelo','Asignación versionada',
      'Historial de titularidad','Clientes','Editor y reordenación de DEMO','Auditoría');
  }finally{await admin.context.close();}
  const buyer=await fixture(390,844);
  try{
    const {page}=buyer;
    await login(page,'ana');
    await page.getByRole('button',{name:'Seleccionar unidad',exact:true}).first().click();
    await page.getByRole('button',{name:'Avanzar',exact:true}).waitFor();
    await page.locator('#wsStatus').getByText('En línea').waitFor();
    await screenshot(page,'comprador-control-local');
    await page.getByRole('tab',{name:'Monitoreo'}).click();
    await page.locator('#historyRows').getByText(/Movimiento unidad 17/i).waitFor();
    await screenshot(page,'comprador-monitoreo-local');
    await page.getByRole('tab',{name:'Demo',exact:true}).click();
    await page.locator('#demoSelect').selectOption('43:4');
    await page.getByRole('button',{name:'Iniciar demo'}).click();
    await page.getByText(/DEMO · aceptada por API/i).waitFor();
    assert(buyer.mutations.some(action=>action.path==='/plataforma/demos/4/ejecutar'));
    await page.locator('#stopDemoButton').click();
    await page.getByText(/DETENER · aceptado por API/i).waitFor();
    await page.getByRole('tab',{name:'Mi cuenta'}).click();
    await page.getByRole('button',{name:'Seleccionar unidad',exact:true}).click();
    await page.locator('#unitName').getByText('Segunda unidad de Ana').waitFor();
    await page.getByRole('tab',{name:'Monitoreo'}).click();
    await page.locator('#historyRows').getByText(/Movimiento unidad 24/i).waitFor();
    assert(!await page.locator('#historyRows').getByText(/Movimiento unidad 17/i).count());
    assert.deepEqual(buyer.sockets,[17,24]);
    assert.deepEqual(buyer.errors,[]);
    report.casos.push('Comprador','Tickets por unidad','DEMO de fábrica con unidad comercial',
      'Cambio de unidad sin historial anterior');
  }finally{await buyer.context.close();}
  const guest=await fixture(390,844);
  try{
    const {page}=guest;
    await page.getByRole('button',{name:'Reservar prueba virtual'}).waitFor();
    await screenshot(page,'invitado-catalogo-local');
    await page.getByRole('button',{name:'Reservar prueba virtual'}).click();
    await page.getByRole('tab',{name:'Mi reserva'}).waitFor();
    await page.locator('#wsStatus').getByText('En línea').waitFor();
    await page.locator('#stopButton').click();
    await page.getByRole('tab',{name:'Mi reserva'}).click();
    await page.getByRole('timer').getByText(/Tiempo restante/).waitFor();
    await screenshot(page,'invitado-reserva-local');
    await page.getByRole('button',{name:'Finalizar prueba'}).click();
    await page.getByRole('heading',{name:'Plataforma NODE/01'}).waitFor();
    assert(await page.locator('#showControl').isHidden());
    assert(guest.mutations.some(action=>action.path==='/plataforma/reservas/actual'&&action.method==='DELETE'));
    assert.deepEqual(guest.errors,[]);
    report.casos.push('Reserva sin cuenta','DETENER lógico virtual','Fin de reserva');
  }finally{await guest.context.close();}
  const responsive=await fixture(...viewports[0]);
  try{
    const {page}=responsive;
    await login(page,'admin');
    await page.getByRole('heading',{name:'Resumen de operaciones'}).waitFor();
    for(const [width,height] of viewports){
      await page.setViewportSize({width,height});
      assert(await noHorizontal(page),`Desbordamiento general de Administración a ${width}x${height}`);
      report.vista.push({ancho:width,alto:height,desbordamiento_horizontal:false});
    }
    assert.deepEqual(responsive.errors,[]);
  }finally{await responsive.context.close();}
  console.log(`${report.casos.length} casos de plataforma y ${report.vista.length} tamaños correctos.`);
}finally{
  await writeFile(resolve(output,'platform43-browser-results.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
