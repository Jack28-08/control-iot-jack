// Pruebas de navegador con aislamiento de red. PLAYWRIGHT_MODULE y BROWSER_EXE
// pueden apuntar al runtime y navegador ya instalados en la máquina.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
  ?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.env.NODE42_EVIDENCE_DIR??resolve(root,'.local/evidencia-4-2'));
await mkdir(output,{recursive:true});
const prefix='/control-iot-jack/';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    let path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith(prefix)||req.method!=='GET')throw Error();
    path=resolve(root,decodeURIComponent(path.slice(prefix.length)||'index.html'));
    assert(path.startsWith(resolve(root)+sep));
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'});
    res.end(await readFile(path));
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise((ok,bad)=>server.listen(0,'127.0.0.1',ok).on('error',bad));
const local='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE||undefined});
const api='https://184-72-72-255.sslip.io';
const ws='wss://184-72-72-255.sslip.io/ws/vehiculos/1';
const fixtureBearer='A'.repeat(43);
const stamp=id=>new Date(Date.UTC(2026,10,13,16,0,id)).toISOString();
const bootstrap=await readFile(resolve(root,'.local/bootstrap-5.3.3.min.css'),'utf8').catch(()=>null);
const viewports=[[320,568],[360,640],[360,740],[390,844],[412,915],[667,375],[844,390],[915,412],[768,1024],[1440,900]];
const baseCommands=['AVANZAR','RETROCEDER','GI','GIRAR_DERECHA','CAMBIAR_VELOCIDAD','SUBIR_GRUA','BAJAR_GRUA','DEMO'];
const report={mode:'browser_local_with_rest_and_wss_doubles',browser:`Chromium ${browser.version()}`,
  real_posts:0,bootstrapFixture:Boolean(bootstrap),viewports:[],scenarios:{},images:[]};
const errors=[];
const wait=async(fn,msg)=>{for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error(msg);};
const label=async(page,selector,value)=>wait(async()=>String(await page.locator(selector).textContent()).includes(value),selector+' no muestra '+value);

async function scenario(width,height){
  const handheld=width<600||height<500;
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:handheld,isMobile:handheld,serviceWorkers:'block'});
  const page=await ctx.newPage();
  const commands=baseCommands.map((nombre,i)=>({nombre,id_comando:i+1,codigo:(i+1)*10,activo:true,id_vehiculo:1}));
  const demos=[{id_demo:1,nombre:'Recorrido corto',id_vehiculo:1,activo:true}];
  const steps=commands.slice(0,2).map((c,i)=>({id_demo_movimiento:i+1,id_demo:1,orden:i+1,id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,duracion_ms:600,pausa_ms:300}));
  const historyRow=(id,c)=>({id_historial:id,id_vehiculo:1,id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,fecha_hora:stamp(id).slice(0,-1),origen:'PRUEBA'});
  const f={page,ctx,commands,steps,posts:[],routes:[],sockets:[],state:null,history:[],id:12,
    status:{health:200,rds:200},authorized:true,authHits:0,historyHits:0,stateHits:0,version:0,
    socketsOpened:0,heldMove:null,holdMove:false,holdState:false,heldState:null,
    holdHistory:false,heldHistory:null,holdStop:false,heldStop:null,
  };
  const put=(id,c)=>({id_vehiculo:1,vehiculo:'Vehículo IoT',id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,fecha_actualizacion:stamp(id).slice(0,-1),conectado:false});
  f.state=put(f.id,commands[0]);
  f.history=Array.from({length:12},(_,i)=>historyRow(12-i,commands[i%commands.length]));
  f.event=(tipo,override={})=>({tipo,id_vehiculo:1,id_comando:f.state?.id_comando??null,comando:f.state?.comando??null,codigo:f.state?.codigo??null,conectado:false,
    fecha_hora:f.state?.fecha_actualizacion?f.state.fecha_actualizacion+'Z':stamp(f.id),...override});
  f.send=(tipo,override)=>{for(const s of f.sockets)try{s.send(JSON.stringify(f.event(tipo,override)));}catch{}};
  f.external=(c,vehicle=1)=>{
    if(vehicle===1){f.id++;f.state=put(f.id,c);f.history.unshift(historyRow(f.id,c));}
    f.send('movimiento_individual',{id_vehiculo:vehicle,id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,fecha_hora:stamp(f.id)});
  };
  function observeErrors(tab){
    tab.on('pageerror',error=>errors.push(error.message));
    tab.on('console',message=>{
      const expectedResourceError=message.text().startsWith('Failed to load resource: the server responded with a status of');
      if(message.type()==='error'&&!expectedResourceError)errors.push(message.text());
    });
  }
  observeErrors(page);
  ctx.on('page',observeErrors);
  await ctx.routeWebSocket('**/*', socket=>{
    assert.equal(socket.url(),ws);
    f.socketsOpened++;f.sockets.push(socket);
    socket.onClose(()=>{f.sockets=f.sockets.filter(s=>s!==socket);});
    // routeWebSocket simula un servidor; no se llama a connectToServer.
    setTimeout(()=>{try{socket.send(JSON.stringify(f.event('estado_inicial')));}catch{}},30);
  });
  await ctx.route('**/*',async route=>{
    const req=route.request(),url=req.url(),method=req.method(),headers=req.headers();
    if(url.startsWith(local+prefix)&&method==='GET'){await route.continue();return;}
    if(url.startsWith('https://cdn.jsdelivr.net/')){
      if(bootstrap)await route.fulfill({contentType:'text/css',body:bootstrap,headers:{'access-control-allow-origin':'*'}});
      else await route.fulfill({status:404,body:'',headers:{'access-control-allow-origin':'*'}});
      return;
    }
    if(!url.startsWith(api+'/')){await route.abort();return;}
    const path=new URL(url).pathname;
    f.routes.push({method,path});
    const send=(status,data)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type, x-api-key','access-control-allow-methods':'GET, POST, OPTIONS'}});
    if(method==='OPTIONS'){await send(204,null);return;}
    const vehicle={id_vehiculo:1,nombre:'Vehículo IoT',activo:true};
    if(method==='GET'){
      if(path==='/evaluacion/vehiculos/1'){f.authHits++;await send(f.authorized?200:403,f.authorized?{token:fixtureBearer,expires_at:new Date(Date.now()+600000).toISOString()}:{detail:'cerrado'});return;}
      if(path==='/health'||path==='/health/db'){const status=path==='/health'?f.status.health:f.status.rds;await send(status,status===200?{status:'ok'}:{status:'unavailable'});return;}
      if(path==='/vehiculos/1'){await send(200,vehicle);return;}
      if(path==='/vehiculos/1/comandos'){await send(200,commands);return;}
      if(path==='/vehiculos/1/demos'){await send(200,demos);return;}
      if(path==='/vehiculos/1/demos/1/movimientos'){await send(200,steps);return;}
      if(path==='/vehiculos/1/estado'){
        f.stateHits++;
        if(f.holdState){f.holdState=false;const snapshot=f.state;await new Promise(ok=>{f.heldState=ok;});await send(200,snapshot).catch(()=>{});return;}
        await send(200,f.state);return;
      }
      if(path==='/vehiculos/1/historial'){
        f.historyHits++;
        // Entrega 12+, una repetición y otro vehículo para ejercer filtros del cliente.
        const rows=[...f.history.slice().reverse(),...(f.history.length?[f.history[0],{...f.history[0],id_historial:999,id_vehiculo:2}]:[])];
        if(f.holdHistory){f.holdHistory=false;await new Promise(ok=>{f.heldHistory=ok;});await send(200,rows).catch(()=>{});return;}
        await send(200,rows);return;
      }
    }
    if(method==='POST'){
      const valid=f.authorized&&headers.authorization==='Bearer '+fixtureBearer&&!headers['x-api-key'];
      f.posts.push({path,authorized:valid});
      if(!valid){await send(401,{detail:'sin acceso'});return;}
      if(path==='/vehiculos/1/movimientos'){
        const body=req.postDataJSON(),c=commands.find(c=>c.id_comando===body.id_comando);
        if(!c){await send(422,{detail:'id inválido'});return;}
        if(f.holdMove){f.holdMove=false;await new Promise(ok=>{f.heldMove=ok;});await send(409,{}).catch(()=>{});return;}
        f.external(c);
        await send(200,{id_vehiculo:1,id_comando:c.id_comando,origen:body.origen,estado:f.state,historial:f.history[0]});return;
      }
      const execution={id_demo:1,id_ejecucion:'00000000-0000-4000-8000-000000000001',id_vehiculo:1,total_movimientos:2};
      if(path.endsWith('/iniciar')){
        await send(202,{...execution,estado:'iniciada'});
        f.send('demo_inicio',{...execution,fecha_hora:stamp(++f.id)});
        f.state=put(++f.id,commands[1]);
        f.send('demo_movimiento',{...execution,orden:1,duracion_ms:600,pausa_ms:300});
        return;
      }
      if(path.endsWith('/cancelar')){f.send('demo_cancelada',{...execution,fecha_hora:stamp(++f.id)});await send(200,{...execution,estado:'cancelada'});return;}
      if(path.endsWith('/detener')){
        if(f.holdStop){f.holdStop=false;await new Promise(ok=>{f.heldStop=ok;});}
        f.send('detencion_logica',{fecha_hora:stamp(++f.id)});
        await send(200,{id_vehiculo:1,id_ejecucion:null,detencion_logica:true,estado:'detenida_logicamente'});return;
      }
    }
    await send(404,{detail:'ruta no prevista por el doble'});
  });
  await page.goto(local+prefix,{waitUntil:'domcontentloaded'});
  await label(page,'#wsStatus','En línea');
  await label(page,'#apiStatus','Disponible');
  await label(page,'#dbStatus','Disponible');
  await page.locator('#commandButtons button').first().waitFor();
  return f;
}

async function checkLayout(page,view,{allowVertical=false}={}){
  const layout=await page.evaluate(({view,allowVertical})=>{
    const {documentElement:html,scrollingElement:doc}=document;
    const limits={width:html.clientWidth,height:html.clientHeight};
    const controlView=view!=='monitor';
    const common=['#showControl','#showMonitor','#retryConnectionButton','#credentialsButton',
      '#wsStatus','#apiStatus','#dbStatus','.feedback-panel','.site-footer'];
    const control=['#joystick','#joystickStick','#stopButton','#showCommands','#showDemos'];
    const commands=['#commandButtons button'];
    const demo=['#demoSelect','#demoSteps','#startDemoButton','#cancelDemoButton'];
    const monitor=['#monitorMovement','#monitorDate','#monitorTime','#monitorCode','#monitorRefresh',
      '.history-table thead th','#historyRows td','#historyPagination','#historyPrevious','#historyNext'];
    const selectors=[...common,...(controlView?[...control,...(view==='demo'?demo:commands)]:monitor)];
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height};};
    const visible=e=>!e.closest('[hidden]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const elements=selectors.flatMap(s=>Array.from(document.querySelectorAll(s),e=>({selector:s,e}))).filter(({e})=>visible(e));
    const clipped=[];
    for(const {selector,e} of elements){
      const b=rect(e);
      const outsideX=b.x<-.75||b.r>limits.width+.75;
      const outsideY=!allowVertical&&(b.y<-.75||b.b>limits.height+.75);
      if(outsideX||outsideY||b.w<=0||b.h<=0)clipped.push({selector,...b});
    }
    const touch=[];
    const covered=[];
    const overlaps=[];
    const targets=elements.filter(({e})=>e.matches('button,select,summary,#joystick'));
    for(const [index,{selector,e}] of targets.entries()){
      const b=rect(e);
      const minSize=e.matches('#stopButton,#commandButtons button,#startDemoButton,#cancelDemoButton,#joystick')?44:24;
      if(b.h<minSize-.5||b.w<minSize-.5)touch.push({selector,minSize,...b});
      if(!allowVertical&&!e.contains(document.elementFromPoint(b.x+b.w/2,b.y+b.h/2)))covered.push({selector,...b});
      for(const other of targets.slice(index+1)){
        const a=rect(other.e);
        const intersectionX=Math.min(b.r,a.r)-Math.max(b.x,a.x);
        const intersectionY=Math.min(b.b,a.b)-Math.max(b.y,a.y);
        if(intersectionX>1&&intersectionY>1)overlaps.push([selector,other.selector]);
      }
    }
    const joystick=document.querySelector('#joystick'),knob=document.querySelector('#joystickStick');
    const j=rect(joystick),k=rect(knob);
    const centered=!controlView||Math.abs(j.x+j.w/2-k.x-k.w/2)<2&&Math.abs(j.y+j.h/2-k.y-k.h/2)<2;
    const userLabels=[...document.querySelectorAll('#commandButtons button,#monitorMovement,#historyRows td:nth-child(2),#movementDisplay')]
      .filter(visible).map(e=>e.textContent+' '+(e.getAttribute('aria-label')??'')+' '+(e.title??''));
    const overflow=[doc.scrollWidth-limits.width,doc.scrollHeight-limits.height];
    const scrollable=[html,document.body].every(e=>['overflowX','overflowY'].every(axis=>!['hidden','clip'].includes(getComputedStyle(e)[axis])));
    const footerVisible=elements.some(({selector,e})=>selector==='.site-footer'&&e.textContent.includes('Desarrollado por José Héctor Rosales Cabrera · 2026'));
    const stopVisible=!controlView||elements.some(({selector,e})=>selector==='#stopButton'&&e.textContent.includes('DETENER'));
    return {viewport:limits,overflow,clipped,touch,covered,overlaps,centered,scrollable,footerVisible,stopVisible,
      labelsClean:userLabels.every(s=>!/_|\b(?:undefined|null)\b/i.test(s)),
      horizontalGrid:!controlView||limits.width<570||limits.width<=limits.height||rect(document.querySelector('.actions-panel')).x>j.x};
  },{view,allowVertical});
  for(const [key,ok] of Object.entries({
    noOverflow:layout.overflow[0]===0&&(allowVertical||layout.overflow[1]===0),
    clipped:layout.clipped.length===0,touch:layout.touch.length===0,covered:layout.covered.length===0,
    overlaps:layout.overlaps.length===0,centered:layout.centered,scrollable:layout.scrollable,
    footerVisible:layout.footerVisible,stopVisible:layout.stopVisible,labelsClean:layout.labelsClean,horizontalGrid:layout.horizontalGrid,
  })){
    assert(ok,view+' '+key+' '+JSON.stringify(layout));
  }
  return layout;
}

async function image(page,name,evidence,caption){
  const path=resolve(output,name+'.png');
  await page.screenshot({path,animations:'disabled'});
  report.images.push({evidence,path:relative(output,path),caption,kind:'simulacion-local'});
}

async function checkZoom(){
  const f=await scenario(320,568);
  try{
    const {page,ctx}=f;
    const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');
    assert(!/user-scalable\s*=\s*(?:no|0)/i.test(viewport),'zoom de usuario desactivado');
    const maximum=viewport.match(/maximum-scale\s*=\s*([\d.]+)/i);
    assert(!maximum||Number(maximum[1])>=2,'zoom máximo menor al 200%');
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
    await wait(()=>page.evaluate(()=>window.visualViewport.scale>=1.99),'zoom visual al 200% no aplicado');
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await page.setViewportSize({width:160,height:284});
    const control=await checkLayout(page,'control',{allowVertical:true});
    assert.deepEqual(control.viewport,{width:160,height:284},'reflujo CSS al 200% no aplicado');
    await page.locator('#joystick').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'stopButton','DETENER inaccesible por teclado al ampliar');
    assert(await page.locator('#stopButton').evaluate(e=>e.matches(':focus-visible')),'foco invisible al ampliar');
    await wait(()=>page.locator('#stopButton').evaluate(e=>{
      const r=e.getBoundingClientRect();
      return r.top>=0&&r.bottom<=document.documentElement.clientHeight;
    }),'enfocar DETENER no lo vuelve visible al ampliar');
    await page.locator('#showDemos').click();
    await page.locator('#demoSelect').selectOption('1');
    await wait(()=>page.locator('#startDemoButton').isEnabled(),'no se pudo preparar DEMO ampliada');
    await page.evaluate(()=>window.scrollTo(0,0));
    const demo=await checkLayout(page,'demo',{allowVertical:true});
    await page.locator('#showMonitor').click();
    await label(page,'#monitorMovement','Avanzar');
    await wait(async()=>await page.locator('#historyRows tr').count()>0,'historial ampliado no renderizado');
    const monitor=await checkLayout(page,'monitor',{allowVertical:true});
    report.scenarios.zoom200={control,demo,monitor,stopKeyboard:true,scale:2};
    assert.equal(f.posts.length,0,'verificación de zoom emitió escrituras');
  }finally{await f.ctx.close();}
}

const reps=new Set(['390x844','844x390','1440x900']);
try{
  for(const [width,height] of viewports){
    const tag=width+'x'+height;
    const f=await scenario(width,height);
    try{
      const {page}=f;
      const record={width,height,control:false,monitor:false};
      report.viewports.push(record);
      record.controlLayout=await checkLayout(page,'control');record.control=true;
      assert.deepEqual(record.controlLayout.viewport,{width,height},'viewport CSS inesperado');
      if(reps.has(tag))await image(page,'control-'+tag,2,'Control '+tag+' · navegador local con servicios simulados.');
      await page.locator('#showMonitor').click();
      await label(page,'#monitorMovement','Avanzar');
      await wait(async()=>await page.locator('#historyRows tr').count()>0,'historial no renderizado');
      record.monitorLayout=await checkLayout(page,'monitor');record.monitor=true;
      if(reps.has(tag))await image(page,'monitoreo-'+tag,2,'Monitoreo '+tag+' · navegador local con servicios simulados.');
      await page.locator('#showControl').click();
      await page.locator('#showDemos').click();
      await page.locator('#demoSelect').selectOption('1');
      await wait(()=>page.locator('#startDemoButton').isEnabled(),'no se pudo preparar DEMO');
      record.demoLayout=await checkLayout(page,'demo');
      record.demo=true;
      if(reps.has(tag))await image(page,'secuencias-'+tag,2,'Secuencias '+tag+' con Detener visible · navegador local con servicios simulados.');
      assert.equal(f.socketsOpened,1,'duplicación de WSS al navegar');
      assert.equal(f.posts.length,0,'navegación emitió escrituras');
      console.log(tag,'CONTROL y MONITOREO OK');
    }catch(error){await f.page.screenshot({path:resolve(output,'fallo-'+tag+'.png')}).catch(()=>{});throw error;}
    finally{await f.ctx.close();}
  }
  await checkZoom();
  const f=await scenario(390,844);
  try{
    const {page}=f;
    assert.equal(await page.locator('#authDialog').evaluate(e=>e.open),false);
    await page.locator('#showControl').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#showMonitor').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#showMonitor').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#showControl').getAttribute('aria-selected'),'true');
    report.scenarios.keyboardNavigation=true;
    await page.evaluate(()=>window.__node42NoReload=42);
    await page.getByRole('button',{name:'Girar a la derecha',exact:false}).first().click();
    await wait(()=>f.posts.length===1,'movimiento individual no enviado');
    assert(f.posts[0].authorized,'sin credencial efímera');
    await page.locator('#showMonitor').click();
    await label(page,'#monitorMovement','Girar a la derecha');
    await label(page,'#historyRows tr:first-child','Girar a la derecha');
    assert.equal(await page.evaluate(()=>window.__node42NoReload),42);
    await image(page,'control-a-monitoreo',4,'Movimiento desde CONTROL y reconciliación sin recarga · REST y WSS simulados.');
    report.scenarios.individual=true;
    const before=f.historyHits;
    f.external(f.commands[4],2);
    await page.waitForTimeout(160);
    assert.equal(f.historyHits,before,'otro vehículo disparó historial');
    const other=await f.ctx.newPage();
    await other.goto(local+prefix,{waitUntil:'domcontentloaded'});
    await other.getByRole('button',{name:'Subir grúa',exact:false}).first().click();
    await wait(()=>f.posts.length===2,'segundo cliente no emitió POST al doble local');
    await label(page,'#monitorMovement','Subir grúa');
    await label(page,'#historyRows tr:first-child','Subir grúa');
    assert.equal(await page.evaluate(()=>window.__node42NoReload),42);
    await other.close();
    report.scenarios.external=true;
    const viewRows=[],viewIds=[];
    for(let i=0;i<10;i++){
      viewRows.push(...await page.locator('#historyRows tr td:first-child').allTextContents());
      viewIds.push(...await page.locator('#historyRows tr').evaluateAll(rows=>rows.map(row=>Number(row.dataset.historyId))));
      const next=page.locator('#historyNext');
      if(!await next.isVisible()||!await next.isEnabled())break;
      await next.click();
    }
    assert.deepEqual(viewRows.map(x=>Number(x.trim())),Array.from({length:10},(_,i)=>i+1),'límite o duplicación de filas');
    assert.deepEqual(viewIds,Array.from({length:10},(_,i)=>f.id-i),'IDs no corresponden a diez registros recientes únicos');
    await image(page,'historial-paginado',5,'Más de diez entradas en el doble; la tabla mantiene diez filas únicas paginadas.');
    report.scenarios.history=true;
    f.send('movimiento_individual',{id_comando:1,comando:'AVANZAR',fecha_hora:stamp(1)});
    await page.waitForTimeout(150);
    await label(page,'#monitorMovement','Subir grúa');
    f.holdState=true;
    await page.locator('#monitorRefresh').click();
    await wait(()=>Boolean(f.heldState),'GET estado retrasado no capturado');
    f.external(f.commands[6]);
    await label(page,'#monitorMovement','Bajar grúa');
    f.heldState();
    await page.waitForTimeout(150);
    await label(page,'#monitorMovement','Bajar grúa');
    report.scenarios.outOfOrder=true;
    const beforeDemo=f.history.length;
    await page.locator('#showControl').click();
    await page.locator('#showDemos').click();
    await page.locator('#demoSelect').selectOption('1');
    await page.locator('#startDemoButton').click();
    await wait(()=>f.posts.some(p=>p.path.endsWith('/iniciar')),'no inició DEMO');
    await page.locator('#showMonitor').click();
    await label(page,'#monitorMovement','Retroceder');
    assert.equal(f.history.length,beforeDemo);
    assert(!(await page.locator('#historyRows tr:first-child').textContent()).includes('Retroceder'));
    await page.locator('#showControl').click();
    await page.locator('#cancelDemoButton').click();
    await wait(()=>f.posts.some(p=>p.path.endsWith('/cancelar')),'no canceló DEMO');
    report.scenarios.demo=true;
    await page.locator('#showCommands').click();
    f.holdMove=true;
    await page.getByRole('button',{name:'Avanzar',exact:false}).first().click();
    await wait(()=>Boolean(f.heldMove),'POST retenido no observado');
    f.holdStop=true;
    await page.locator('#stopButton').click();
    await wait(()=>Boolean(f.heldStop),'DETENER bloqueado por movimiento pendiente');
    f.heldMove();
    f.heldStop();
    await wait(async()=>await page.locator('#joystick').getAttribute('aria-disabled')==='false','joystick no se habilitó después de DETENER');
    await label(page,'#movementDisplay','Neutral');
    report.scenarios.stopPriority=true;
    await page.locator('#joystick').focus();
    await page.keyboard.down('ArrowUp');
    await wait(()=>f.posts.filter(p=>p.path.endsWith('/movimientos')).length>=4,'joystick de teclado no envía movimiento');
    await page.keyboard.up('ArrowUp');
    await wait(()=>f.posts.filter(p=>p.path.endsWith('/detener')).length>=2,'soltar teclado no envía DETENER');
    report.scenarios.keyboard=true;
    await page.locator('#showMonitor').click();
    const startHistory=f.historyHits,startState=f.stateHits;
    const opened=f.socketsOpened;
    for(const socket of [...f.sockets])socket.close({code:1012,reason:'reinicio simulado'});
    await label(page,'#wsStatus','Desconectado');
    await image(page,'wss-desconectado',6,'WSS interrumpido en el doble; el servidor y la base conservan su diagnóstico independiente.');
    await wait(()=>f.socketsOpened>opened,'no reconectó');
    await wait(()=>f.historyHits>startHistory&&f.stateHits>startState,'sin reconciliación REST al reconectar');
    await label(page,'#wsStatus','En línea');
    f.status.rds=503;
    await page.locator('#retryConnectionButton').click();
    await label(page,'#dbStatus','No disponible');
    await label(page,'#apiStatus','Disponible');
    await image(page,'wss-recuperado-rds-503',6,'WSS recuperado y REST resincronizado; RDS simulado responde 503 de forma independiente.');
    report.scenarios.reconnect=true;
    report.scenarios.indicators=true;
    assert(f.posts.every(p=>p.authorized));
  }finally{await f.ctx.close();}
  const touch=await scenario(360,740);
  try{
    const {page}=touch,base=await page.locator('#joystick').boundingBox();
    assert(base,'joystick táctil fuera del viewport');
    const cdp=await touch.ctx.newCDPSession(page);
    const x=Math.round(base.x+base.width/2),y=Math.round(base.y+base.height/2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-Math.floor(base.height*.35)}]});
    await wait(()=>touch.posts.some(p=>p.path.endsWith('/movimientos')),'joystick táctil sin movimiento');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait(()=>touch.posts.some(p=>p.path.endsWith('/detener')),'soltar touch sin detener');
    report.scenarios.touch=true;
    touch.authorized=false;
    await page.reload({waitUntil:'domcontentloaded'});
    await wait(()=>touch.authHits>=2,'no se verificó modo cerrado');
    const previous=touch.posts.length;
    await page.locator('#stopButton').click();
    await page.waitForTimeout(250);
    assert.equal(touch.posts.length,previous,'modo cerrado emitió POST');
    assert.equal(await page.locator('#authDialog').evaluate(e=>e.open),false);
    report.scenarios.closedWithoutKey=true;
    touch.history=[];touch.state=null;
    await page.locator('#showMonitor').click();
    await label(page,'#historyStatus','Sin movimientos registrados');
    assert.equal(await page.locator('#historyRows tr').count(),0);
    report.scenarios.empty=true;
  }finally{await touch.ctx.close();}
  assert.deepEqual(errors,[],'errores de consola');
}catch(error){
  report.error=error.stack;
  process.exitCode=1;
  console.error(error.stack);
}finally{
  await writeFile(resolve(output,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
  await new Promise(ok=>server.close(ok));
}
