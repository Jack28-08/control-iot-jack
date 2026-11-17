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
const output=resolve(process.env.NODE01_EVIDENCE_DIR??resolve(root,'evidencias/definitivo/simulacion'));
await mkdir(output,{recursive:true});
const prefix='/control-iot-jack/';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const urlPath=new URL(req.url,'http://localhost').pathname;
    if(!urlPath.startsWith(prefix)||req.method!=='GET')throw Error();
    const asset=decodeURIComponent(urlPath.slice(prefix.length)||'index.html');
    if(asset!=='index.html'&&!/^(?:css|js|assets)\/[a-z\d._/-]+$/i.test(asset))throw Error();
    if(asset.split('/').some(part=>!part||part==='.'||part==='..'))throw Error();
    const path=resolve(root,asset);
    assert(path.startsWith(resolve(root)+sep));
    res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'});
    res.end(await readFile(path));
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise((ok,bad)=>server.listen(0,'127.0.0.1',ok).on('error',bad));
const local='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({
  headless:true,executablePath:process.env.BROWSER_EXE||undefined,args:['--no-proxy-server'],
});
const api='https://184-72-72-255.sslip.io';
const ws='wss://184-72-72-255.sslip.io/ws/vehiculos/1';
const fixtureBearer='A'.repeat(43);
const stamp=id=>new Date(Date.UTC(2026,10,13,16,0,id)).toISOString();
const bootstrap=await readFile(resolve(root,'.local/bootstrap-5.3.3.min.css'),'utf8').catch(()=>null);
const viewports=[
  [320,568],[360,640],[360,740],[390,844],[412,915],
  [667,375],[844,390],[915,412],[768,1024],[1024,768],[1366,768],[1440,900],
];
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
  const steps=[commands[1],commands[0],...commands.slice(2)].map((c,i)=>({id_demo_movimiento:i+1,id_demo:1,orden:i+1,
    id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,duracion_ms:600,pausa_ms:300}));
  const execution={id_demo:1,id_ejecucion:'00000000-0000-4000-8000-000000000001',id_vehiculo:1,total_movimientos:steps.length};
  const historyRow=(id,c)=>({id_historial:id,id_vehiculo:1,id_comando:c.id_comando,comando:c.nombre,codigo:c.codigo,fecha_hora:stamp(id).slice(0,-1),origen:'PRUEBA'});
  const f={page,ctx,commands,steps,execution,posts:[],routes:[],sockets:[],state:null,history:[],id:12,
    status:{health:200,rds:200},authorized:true,authHits:0,historyHits:0,stateHits:0,version:0,
    socketsOpened:0,heldMove:null,holdMove:false,holdState:false,heldState:null,
    holdHistory:false,heldHistory:null,holdStop:false,heldStop:null,
    keepSocketClosed:false,demoStepOnStart:true,
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
  f.demoStep=order=>{
    const step=steps[order-1],command=commands.find(c=>c.id_comando===step.id_comando);
    f.state=put(++f.id,command);
    f.send('demo_movimiento',{...execution,orden:order,duracion_ms:step.duracion_ms,pausa_ms:step.pausa_ms});
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
    if(f.keepSocketClosed){socket.close({code:1012,reason:'cierre simulado'});return;}
    // routeWebSocket simula un servidor y mantiene el tráfico en la prueba.
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
      const body=req.postDataJSON();
      f.posts.push({path,authorized:valid,id:body?.id_comando??null});
      if(!valid){await send(401,{detail:'sin acceso'});return;}
      if(path==='/vehiculos/1/movimientos'){
        const c=commands.find(c=>c.id_comando===body?.id_comando);
        if(!c){await send(422,{detail:'id inválido'});return;}
        if(f.holdMove){f.holdMove=false;await new Promise(ok=>{f.heldMove=ok;});await send(409,{}).catch(()=>{});return;}
        f.external(c);
        await send(200,{id_vehiculo:1,id_comando:c.id_comando,origen:body.origen,estado:f.state,historial:f.history[0]});return;
      }
      if(path.endsWith('/iniciar')){
        await send(202,{...execution,estado:'iniciada'});
        f.send('demo_inicio',{...execution,fecha_hora:stamp(++f.id)});
        if(f.demoStepOnStart)f.demoStep(1);
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

async function checkLayout(page,view,{allowVertical=false,direction='neutral'}={}){
  const layout=await page.evaluate(({view,allowVertical,direction,sectors})=>{
    const {documentElement:html,scrollingElement:doc}=document;
    const limits={width:html.clientWidth,height:html.clientHeight};
    const controlView=view==='control';
    const common=['#showControl','#showMonitor','#showDemos','#retryConnectionButton','#credentialsButton','#accessState',
      '#wsStatus','#apiStatus','#dbStatus','.feedback-panel','.site-footer'];
    const control=['#joystick','#joystickStick','#stopButton','#directionStatus','#directionAvailability',
      '#commandButtons button','#joystick .sector-mark'];
    const demo=['#demoSelect','#demoSteps','#startDemoButton','#cancelDemoButton','#stopDemoButton'];
    const monitor=['#monitorMovement','#monitorDate','#monitorTime','#monitorCode','#monitorRefresh',
      '.history-table thead th','#historyRows td','#historyPagination','#historyPrevious','#historyNext'];
    const selectors=[...common,...{control,demo,monitor}[view]];
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height};};
    const visible=e=>Boolean(e&&!e.closest('[hidden]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
    const elements=selectors.flatMap(s=>Array.from(document.querySelectorAll(s),e=>({selector:s,e}))).filter(({e})=>visible(e));
    const clipped=[];
    const textOverflow=[];
    for(const {selector,e} of elements){
      const b=rect(e);
      const outsideX=b.x<-.75||b.r>limits.width+.75;
      const outsideY=!allowVertical&&(b.y<-.75||b.b>limits.height+.75);
      if(outsideX||outsideY||b.w<=0||b.h<=0)clipped.push({selector,...b});
      if(e.matches('button,select,th,td,#directionStatus,#directionAvailability')&&
        e.clientWidth>0&&e.scrollWidth-e.clientWidth>1)textOverflow.push({selector,text:e.textContent?.trim()});
    }
    const touch=[];
    const covered=[];
    const overlaps=[];
    const targets=elements.filter(({e})=>e.matches('button,select,summary,#joystick'));
    for(const [index,{selector,e}] of targets.entries()){
      const b=rect(e);
      const minSize=e.matches('#stopButton,#stopDemoButton,#commandButtons button,#startDemoButton,#cancelDemoButton,#joystick')?44:24;
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
    const centerX=j.x+j.w/2,centerY=j.y+j.h/2;
    const centered=!controlView||direction!=='neutral'||Math.abs(centerX-k.x-k.w/2)<2&&Math.abs(centerY-k.y-k.h/2)<2;
    const marks=[...joystick.querySelectorAll('.sector-mark[data-axis]')].filter(visible);
    const invalidSectors=marks.flatMap(mark=>{
      const b=rect(mark);
      const sector=sectors.find(([axis])=>axis===mark.dataset.axis);
      const offsetX=b.x+b.w/2-centerX,offsetY=b.y+b.h/2-centerY;
      const [dx,dy]=sector?.slice(1,3)??[null,null];
      const inside=b.x>=j.x-1&&b.r<=j.r+1&&b.y>=j.y-1&&b.b<=j.b+1;
      const compassX=dx===0?Math.abs(offsetX)<j.w*.125:dx*offsetX>j.w*.125;
      const compassY=dy===0?Math.abs(offsetY)<j.h*.125:dy*offsetY>j.h*.125;
      const interactive=mark.matches('button, a[href], input, select, textarea, [role="button"], [tabindex]');
      return inside&&compassX&&compassY&&!interactive?[]:[{axis:mark.dataset.axis,inside,compassX,compassY,interactive}];
    });
    const integratedSectors=marks.length===8&&new Set(marks.map(mark=>mark.dataset.axis)).size===8&&
      invalidSectors.length===0&&!document.querySelector('[data-preview-direction], .diagonal-pad');
    const diagonalNoticeVisible=visible(document.querySelector('#directionAvailability'));
    const userLabels=[...document.querySelectorAll('#commandButtons button,#monitorMovement,#historyRows td:nth-child(2),#movementDisplay')]
      .filter(visible).map(e=>e.textContent+' '+(e.getAttribute('aria-label')??'')+' '+(e.title??''));
    const overflow=[doc.scrollWidth-limits.width,doc.scrollHeight-limits.height];
    const scrollable=[html,document.body].every(e=>['overflowX','overflowY'].every(axis=>!['hidden','clip'].includes(getComputedStyle(e)[axis])));
    const footerVisible=elements.some(({selector,e})=>selector==='.site-footer'&&e.textContent.includes('Desarrollado por José Héctor Rosales Cabrera · 2026'));
    const stopSelector={control:'#stopButton',demo:'#stopDemoButton'}[view];
    const stopVisible=!stopSelector||elements.some(({selector,e})=>selector===stopSelector&&/detener/i.test(e.textContent));
    const tabsVisible=['#showControl','#showMonitor','#showDemos'].every(id=>elements.some(({selector})=>selector===id));
    const commandCount=[...document.querySelectorAll('#commandButtons button')].filter(visible).length;
    const monitorVisible=!controlView&&view==='monitor'
      ?elements.some(({selector})=>selector==='#monitorMovement')&&elements.some(({selector})=>selector==='#historyRows td') :true;
    const demoVisible=view!=='demo'||['#demoSelect','#demoSteps','#startDemoButton','#cancelDemoButton']
      .every(id=>elements.some(({selector})=>selector===id));
    return {viewport:limits,overflow,clipped,touch,covered,overlaps,textOverflow,centered,scrollable,footerVisible,
      stopVisible,tabsVisible,integratedSectors,invalidSectors,diagonalNoticeVisible,commandCount,monitorVisible,demoVisible,
      labelsClean:userLabels.every(s=>!/_|\b(?:undefined|null)\b/i.test(s)),
      horizontalGrid:!controlView||limits.width<570||limits.width<=limits.height||rect(document.querySelector('.actions-panel')).x>j.x};
  },{view,allowVertical,direction,sectors});
  for(const [key,ok] of Object.entries({
    noOverflow:layout.overflow[0]===0&&(allowVertical||layout.overflow[1]===0),
    clipped:layout.clipped.length===0,touch:layout.touch.length===0,covered:layout.covered.length===0,
    overlaps:layout.overlaps.length===0,textOverflow:layout.textOverflow.length===0,centered:layout.centered,scrollable:layout.scrollable,
    footerVisible:layout.footerVisible,stopVisible:layout.stopVisible,labelsClean:layout.labelsClean,horizontalGrid:layout.horizontalGrid,
    tabsVisible:layout.tabsVisible,controlButtons:view!=='control'||layout.commandCount===8,
    integratedSectors:view!=='control'||layout.integratedSectors,
    diagonalNotice:view!=='control'||layout.diagonalNoticeVisible===direction.includes('-'),
    monitorVisible:layout.monitorVisible,demoVisible:layout.demoVisible,
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
    for(let i=0;i<20&&await page.evaluate(()=>document.activeElement.id)!=='stopButton';i++){
      await page.keyboard.press('Tab');
    }
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

const directionLabels={
  up:'Avanzar','up-right':'Avanzar a la derecha',right:'Girar a la derecha',
  'down-right':'Retroceder a la derecha',down:'Retroceder','down-left':'Retroceder a la izquierda',
  left:'Girar a la izquierda','up-left':'Avanzar a la izquierda',neutral:'Neutral',
};
const sectors=[['up',0,-1,1],['up-right',1,-1,null],['right',1,0,4],['down-right',1,1,null],
  ['down',0,1,2],['down-left',-1,1,null],['left',-1,0,3],['up-left',-1,-1,null]];
const joystickDirection=async(page,direction)=>{
  await wait(async()=>await page.locator('#joystick').getAttribute('data-direction')===direction,
    'Joystick visual no muestra '+direction);
  await label(page,'#directionStatus',directionLabels[direction]);
  const availability=page.locator('#directionAvailability');
  if(direction.includes('-')){
    assert(await availability.isVisible(),'la diagonal no explica su disponibilidad');
    assert.match(await availability.textContent(),/vista previa|no (?:disponible|habilitad[ao]|admit\w*)|sin (?:orden|soporte)/i);
  }else assert(!await availability.isVisible(),'se muestra el aviso diagonal fuera de una diagonal');
};
const motionPosts=f=>f.posts.filter(p=>p.path==='/vehiculos/1/movimientos');
const stopPosts=f=>f.posts.filter(p=>p.path==='/vehiculos/1/detener');
const joystickReady=page=>wait(()=>page.locator('#commandButtons button').first().isEnabled(),
  'los mandos siguen bloqueados');

async function checkDirectionalPointer(){
  const f=await scenario(844,390);
  try{
    const {page}=f;
    await joystickReady(page);
    const box=await page.locator('#joystick').boundingBox();
    assert(box,'joystick fuera del viewport');
    const x=box.x+box.width/2,y=box.y+box.height/2,r=Math.min(box.width,box.height)*.36;
    const vector=(a,b)=>page.mouse.move(x+a*r/Math.hypot(a,b), y+b*r/Math.hypot(a,b));
    for(const [direction,dx,dy,id] of sectors){
      await page.mouse.move(x,y);
      await page.mouse.down();
      const initialMoves=motionPosts(f).length,initialStops=stopPosts(f).length;
      await joystickDirection(page,'neutral');
      await vector(dx,dy);
      await joystickDirection(page,direction);
      if(id!==null){
        await wait(()=>motionPosts(f).length===initialMoves+1,'el sector cardinal no emitió un movimiento');
        assert.equal(motionPosts(f).at(-1).id,id);
        await vector(dx*.985-dy*.04,dy*.985+dx*.04);
        await joystickDirection(page,direction);
      }else if(direction==='up-right'){
        await checkLayout(page,'control',{direction});
        await image(page,'joystick-diagonal-844x390',2,'Vista previa angular en el navegador local. La diagonal no genera una orden, con REST y WSS simulados.');
      }
      await page.mouse.up();
      await joystickDirection(page,'neutral');
      if(id!==null)await wait(()=>stopPosts(f).length===initialStops+1,'se soltó un cardinal sin DETENER');
      await joystickReady(page);
      assert.equal(motionPosts(f).length,initialMoves+Number(id!==null),'se emitió un movimiento para una diagonal o un cambio menor');
      assert.equal(stopPosts(f).length,initialStops+Number(id!==null),'se duplicó DETENER o se emitió para una vista previa');
    }

    // Paso de una maniobra cardinal a una diagonal visual sin crear un segundo movimiento.
    await page.mouse.move(x,y);
    await page.mouse.down();
    const initialMoves=motionPosts(f).length,initialStops=stopPosts(f).length;
    await vector(0,-1);
    await wait(()=>motionPosts(f).length===initialMoves+1,'no arrancó el cardinal previo');
    await vector(.42,-.91);
    await joystickDirection(page,'up');
    assert.equal(motionPosts(f).length,initialMoves+1,'la frontera angular repitió la orden');
    await vector(1,-1);
    await joystickDirection(page,'up-right');
    await wait(()=>stopPosts(f).length===initialStops+1,'la entrada a una diagonal no detuvo la maniobra previa');
    await joystickReady(page);
    await joystickDirection(page,'up-right');
    await page.mouse.up();
    await joystickDirection(page,'neutral');
    assert.equal(motionPosts(f).length,initialMoves+1);
    assert.equal(stopPosts(f).length,initialStops+1);

    await page.mouse.move(x,y);
    await page.mouse.down();
    const beforeCenterMoves=motionPosts(f).length,beforeCenterStops=stopPosts(f).length;
    await vector(0,-1);
    await wait(()=>motionPosts(f).length===beforeCenterMoves+1,'el gesto no salió de neutral');
    await page.mouse.move(x,y);
    await joystickDirection(page,'neutral');
    await wait(()=>stopPosts(f).length===beforeCenterStops+1,'volver al centro no detuvo');
    await joystickReady(page);
    await vector(1,0);
    await joystickDirection(page,'right');
    await wait(()=>motionPosts(f).length===beforeCenterMoves+2,'tras DETENER el mismo puntero perdió la captura');
    assert.equal(motionPosts(f).at(-1).id,4);
    await page.mouse.up();
    await wait(()=>stopPosts(f).length===beforeCenterStops+2,'no se detuvo al soltar el puntero conservado');

    // Los mismos sectores sirven al pulsar directamente sobre el disco.
    await joystickReady(page);
    const beforeDirect=f.posts.length;
    await vector(-1,1);
    await page.mouse.down();
    await joystickDirection(page,'down-left');
    await page.mouse.up();
    await joystickDirection(page,'neutral');
    assert.equal(f.posts.length,beforeDirect,'la pulsación directa en una diagonal generó una orden');

    const stick=page.locator('#joystick');
    await stick.evaluate(element=>{
      element.addEventListener('gotpointercapture',event=>{
        element.dataset.capturedPointer=String(event.pointerId);
      },{once:true});
    });
    const beforeCaptureMoves=motionPosts(f).length,beforeCaptureStops=stopPosts(f).length;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await vector(0,-1);
    await wait(()=>motionPosts(f).length===beforeCaptureMoves+1,'no se movió antes de perder captura');
    await stick.evaluate(element=>{
      const pointerId=Number(element.dataset.capturedPointer);
      if(!element.hasPointerCapture(pointerId))throw Error('no se obtuvo captura real de puntero');
      element.releasePointerCapture(pointerId);
      delete element.dataset.capturedPointer;
    });
    await vector(1,0);
    await joystickDirection(page,'neutral');
    await wait(()=>stopPosts(f).length===beforeCaptureStops+1,'perder captura no solicitó DETENER');
    await page.mouse.up();
    assert.equal(motionPosts(f).length,beforeCaptureMoves+1);
    assert.equal(stopPosts(f).length,beforeCaptureStops+1);
    assert(f.posts.every(p=>p.authorized));
    report.scenarios.angularSectors={tested:sectors.map(([direction])=>direction),neutral:true,mouse:true,
      transitionToPreviewStops:true,centerRetainsPointer:true,directSectorPress:true,lostCapture:true,diagonalPosts:0};
  }finally{await f.ctx.close();}
}

async function checkDirectionalKeyboard(){
  const f=await scenario(390,844);
  try{
    const {page}=f;
    await joystickReady(page);
    const joystick=page.locator('#joystick');
    assert.match(await joystick.getAttribute('aria-label'),/joystick.*ocho/i);
    const descriptions=(await joystick.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean);
    const keyboardHelp=(await Promise.all(descriptions.map(id=>page.locator('#'+id).textContent()))).join(' ');
    assert.match(keyboardHelp,/flechas/i,'el joystick no describe el uso por teclado');
    await joystick.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'stopButton','DETENER no sigue al joystick en el orden de foco');
    assert(await page.locator('#stopButton').evaluate(e=>e.matches(':focus-visible')),'DETENER sin foco visible');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'joystick');
    for(const [direction,k1,k2,remainder] of [
      ['up-right','ArrowUp','ArrowRight','up'],['up-left','ArrowUp','ArrowLeft','up'],
      ['down-right','ArrowDown','ArrowRight','down'],['down-left','ArrowDown','ArrowLeft','down'],
    ]){
      await page.keyboard.down(k1);
      await page.keyboard.down(k2);
      await joystickDirection(page,direction);
      await page.keyboard.up(k2);
      await joystickDirection(page,remainder);
      await page.waitForTimeout(90);
      assert.equal(f.posts.length,0,'soltar parcialmente una combinación reanudó una maniobra');
      await page.keyboard.up(k1);
      await joystickDirection(page,'neutral');
      assert.equal(f.posts.length,0,'la combinación de teclado se convirtió en una orden');
    }
    for(const [first,opposite] of [['ArrowUp','ArrowDown'],['ArrowLeft','ArrowRight']]){
      await page.keyboard.down(first);
      await page.keyboard.down(opposite);
      await joystickDirection(page,'neutral');
      await page.keyboard.up(opposite);
      await page.waitForTimeout(90);
      await page.keyboard.up(first);
      await joystickDirection(page,'neutral');
      assert.equal(f.posts.length,0,'una combinación opuesta emitió una orden');
    }

    const cardinalKeys=[['up','ArrowUp',1],['right','ArrowRight',4],['down','ArrowDown',2],['left','ArrowLeft',3]];
    for(const [index,[direction,key,id]] of cardinalKeys.entries()){
      await joystickReady(page);
      await page.keyboard.down(key);
      await joystickDirection(page,direction);
      await wait(()=>motionPosts(f).length===index+1,'flecha individual no envió un movimiento');
      assert.equal(motionPosts(f).at(-1).id,id);
      if(direction==='down')await page.keyboard.press('Escape');
      if(direction==='left')await page.locator('#showControl').focus();
      await page.keyboard.up(key);
      await wait(()=>stopPosts(f).length===index+1,'el teclado no solicitó DETENER');
      await joystickDirection(page,'neutral');
    }
    assert.equal(motionPosts(f).length,4);
    assert.equal(stopPosts(f).length,4);
    report.scenarios.keyboardChords={tested:8,partialRelease:true,oppositeAxes:true,focusLoss:true,
      stopNextInFocusOrder:true,escape:true,diagonalPosts:0};
  }finally{await f.ctx.close();}
}

async function checkDirectionalTouch(){
  const f=await scenario(390,844);
  try{
    const {page,ctx}=f;
    await joystickReady(page);
    const stick=await page.locator('#joystick').boundingBox();
    assert(stick,'el disco táctil del joystick está fuera del viewport');
    const cdp=await ctx.newCDPSession(page);
    const touch=(type,touchPoints=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    const first={x:stick.x+stick.width/2,y:stick.y+stick.height/2,id:1};
    const firstDiagonal={...first,x:first.x+stick.width*.24,y:first.y+stick.height*.24};
    const second={x:first.x-stick.width*.3,y:first.y,id:2};
    const secondUp={...second,x:first.x,y:first.y-stick.height*.32};
    await touch('touchStart',[first]);
    await touch('touchMove',[firstDiagonal]);
    await joystickDirection(page,'down-right');
    await touch('touchStart',[firstDiagonal,second]);
    await touch('touchMove',[firstDiagonal,secondUp]);
    await joystickDirection(page,'down-right');
    await touch('touchEnd',[second]);
    await joystickDirection(page,'down-right');
    await touch('touchEnd');
    await joystickDirection(page,'neutral');
    assert.equal(f.posts.length,0,'un dedo secundario o una diagonal generaron una orden');

    await touch('touchStart',[first]);
    await touch('touchMove',[firstDiagonal]);
    await touch('touchStart',[firstDiagonal,second]);
    await joystickDirection(page,'down-right');
    await touch('touchEnd',[first]);
    await joystickDirection(page,'neutral');
    await touch('touchMove',[secondUp]);
    await joystickDirection(page,'neutral');
    await touch('touchEnd');
    assert.equal(f.posts.length,0,'liberar el dedo principal rearmó el joystick con el secundario');

    await touch('touchStart',[first]);
    await touch('touchMove',[{...first,y:first.y-stick.height*.32}]);
    await wait(()=>motionPosts(f).length===1,'el toque cardinal no envió movimiento');
    await touch('touchCancel');
    await joystickDirection(page,'neutral');
    await wait(()=>stopPosts(f).length===1,'pointercancel no envió DETENER');
    assert.equal(motionPosts(f).length,1);
    assert(f.posts.every(p=>p.authorized));
    report.scenarios.multitouch={integratedPreview:true,secondaryIgnored:true,releaseBothOrders:true,
      pointerCancel:true,diagonalPosts:0};
  }finally{await f.ctx.close();}
}

async function checkOrientationChange(){
  const f=await scenario(390,844);
  try{
    const {page,ctx}=f;
    await joystickReady(page);
    const box=await page.locator('#joystick').boundingBox();
    assert(box,'joystick fuera del viewport antes de rotar');
    const cdp=await ctx.newCDPSession(page);
    const origin={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...origin,y:origin.y-box.height*.34}]});
    await joystickDirection(page,'up');
    await wait(()=>motionPosts(f).length===1,'no se observó movimiento antes de rotar');

    await page.setViewportSize({width:844,height:390});
    await wait(()=>page.evaluate(()=>matchMedia('(orientation: landscape)').matches),'no se aplicó el cambio de orientación');
    await joystickDirection(page,'neutral');
    await wait(()=>stopPosts(f).length===1,'rotar con movimiento no solicitó DETENER');
    await joystickReady(page);
    const rotated=await page.locator('#joystick').boundingBox();
    assert(rotated,'joystick fuera del viewport tras rotar');
    const moved={id:origin.id,x:rotated.x+rotated.width*.8,y:rotated.y+rotated.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await joystickDirection(page,'neutral');
    assert.equal(motionPosts(f).length,1,'el puntero se rearmó tras rotar');
    assert.equal(stopPosts(f).length,1,'el giro produjo DETENER duplicado');
    await page.waitForFunction(()=>{
      const pad=document.querySelector('#joystick').getBoundingClientRect();
      const knob=document.querySelector('#joystickStick').getBoundingClientRect();
      return Math.hypot(pad.x+pad.width/2-knob.x-knob.width/2,pad.y+pad.height/2-knob.y-knob.height/2)<2;
    });
    await checkLayout(page,'control');
    report.scenarios.orientationChange={neutral:true,priorityStop:true,pointerNotRearmed:true};
  }finally{await f.ctx.close();}
}

async function checkMovementDisconnect(){
  const f=await scenario(390,844);
  try{
    const {page}=f;
    await joystickReady(page);
    const opened=f.socketsOpened;
    f.keepSocketClosed=true;
    f.holdMove=true;
    const stick=page.locator('#joystick');
    await stick.focus();
    await page.keyboard.down('ArrowUp');
    await wait(()=>Boolean(f.heldMove),'no se creó un movimiento pendiente');
    for(const socket of [...f.sockets])socket.close({code:1012,reason:'cierre simulado en movimiento'});
    await label(page,'#wsStatus','Desconectado');
    await joystickDirection(page,'neutral');
    await wait(()=>stopPosts(f).length===1,'perder WSS durante un movimiento no solicitó DETENER');
    f.heldMove();
    await page.keyboard.up('ArrowUp');
    assert.equal(stopPosts(f).length,1,'DETENER duplicado al liberar tras desconexión');
    assert.equal(motionPosts(f).length,1);
    f.keepSocketClosed=false;
    await wait(()=>f.socketsOpened>opened,'el socket no volvió a abrir');
    await label(page,'#wsStatus','En línea');
    await joystickReady(page);
    report.scenarios.disconnectInMotion={neutral:true,priorityStop:true,reconnected:true};
  }finally{await f.ctx.close();}
}

async function checkDemoObservation(){
  const f=await scenario(390,844);
  try{
    const {page}=f;
    const initial=m=>page.locator('#demoProgress').getAttribute(m);
    f.demoStepOnStart=false;
    await page.locator('#showDemos').click();
    await page.locator('#demoSelect').selectOption('1');
    await label(page,'#demoCount','8 pasos');
    assert.equal(await page.locator('#demoSteps [data-step]').count(),f.steps.length);
    await page.locator('#startDemoButton').click();
    await wait(()=>f.posts.some(post=>post.path.endsWith('/iniciar')),'DEMO no inició');
    await wait(()=>page.locator('#cancelDemoButton').isEnabled(),'la secuencia no se activó');
    await page.waitForTimeout(630);
    assert.equal(await initial('aria-valuenow'),'0','la DEMO avanzó por un temporizador local');
    f.demoStep(1);
    await wait(async()=>await initial('aria-valuenow')==='1','el paso real no se reflejó en el progreso');
    assert.equal(await initial('aria-valuemax'),String(f.steps.length));
    assert.equal(await page.locator('#demoSteps [data-step="1"]').getAttribute('aria-current'),'step');
    await image(page,'demo-paso-observado-390x844',6,'La secuencia local muestra el paso observado. El evento WSS pertenece al doble de prueba.');
    f.keepSocketClosed=true;
    for(const socket of [...f.sockets])socket.close({code:1012,reason:'cierre simulado durante Demo'});
    await label(page,'#wsStatus','Desconectado');
    await wait(async()=>/(?:incierta|sin confirmar|sin conexión)/i.test(await page.locator('#demoState').textContent()),
      'una Demo que perdió el WSS no indicó observación incierta');
    assert.equal(await initial('aria-valuenow'),'1');
    await page.locator('#stopDemoButton').click();
    await wait(()=>stopPosts(f).length===1,'DETENER no se pudo solicitar durante Demo');
    assert.equal(f.posts.filter(post=>post.path.endsWith('/iniciar')).length,1);
    assert.equal(motionPosts(f).length,0);
    report.scenarios.demoObservation={progressFromWss:true,uncertainty:true,priorityStop:true};
  }finally{await f.ctx.close();}
}

async function checkAccessPanel(){
  const tested=[];
  for(const [width,height] of [[320,568],[667,375]]){
    const f=await scenario(width,height);
    try{
      const {page}=f;
      f.authorized=false;
      await page.reload({waitUntil:'domcontentloaded'});
      await label(page,'#controlAvailability','Requiere acceso autorizado');
      assert.equal(await page.locator('#authDialog').evaluate(e=>e.open),false);
      assert(await page.locator('#commandButtons button').first().isDisabled());
      await page.locator('#credentialsButton').click();
      assert(await page.locator('#authDialog').evaluate(e=>e.open));
      const coverage=await page.locator('#stopButton').evaluate(stop=>{
        const box=stop.getBoundingClientRect(), dialog=document.querySelector('#authDialog').getBoundingClientRect();
        const overlapX=Math.min(box.right,dialog.right)-Math.max(box.left,dialog.left);
        const overlapY=Math.min(box.bottom,dialog.bottom)-Math.max(box.top,dialog.top);
        const centerFree=stop.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
        return {overlap:overlapX>1&&overlapY>1,centerFree,stop:box.toJSON(),dialog:dialog.toJSON()};
      });
      assert(!coverage.overlap&&coverage.centerFree,`el panel de acceso tapa DETENER en ${width}×${height}: ${JSON.stringify(coverage)}`);
      await page.keyboard.press('Escape');
      await wait(async()=>!await page.locator('#authDialog').evaluate(e=>e.open),'Escape no cerró el acceso');
      await page.locator('#stopButton').click();
      await label(page,'#notice','El control no está habilitado');
      assert.equal(f.posts.length,0,'la evaluación cerrada permitió un POST');
      await page.locator('#showMonitor').click();
      await label(page,'#monitorMovement','Avanzar');
      tested.push({width,height});
    }finally{await f.ctx.close();}
  }
  report.scenarios.accessPanel={tested,stopUncovered:true,closedModeReadOnly:true};
}

const reps=new Set(['390x844','844x390','768x1024','1440x900']);
try{
  const layoutErrors=[];
  for(const [width,height] of viewports){
    const tag=width+'x'+height;
    const f=await scenario(width,height);
    try{
      const {page}=f;
      const record={width,height,control:false,monitor:false};
      report.viewports.push(record);
      const verifyView=async(view,name,caption)=>{
        try{
          record[view+'Layout']=await checkLayout(page,view);
          assert.deepEqual(record[view+'Layout'].viewport,{width,height},'viewport CSS inesperado');
          record[view]=true;
          if(reps.has(tag))await image(page,name+'-'+tag,2,caption+' · navegador local con servicios simulados.');
        }catch(error){
          const message=`${tag} ${error.message}`;
          layoutErrors.push(message);
          console.error(message);
          await page.screenshot({path:resolve(output,'fallo-'+view+'-'+tag+'.png')}).catch(()=>{});
        }
      };
      await verifyView('control','control','Control '+tag);
      await page.locator('#showMonitor').click();
      await label(page,'#monitorMovement','Avanzar');
      await wait(async()=>await page.locator('#historyRows tr').count()>0,'historial no renderizado');
      await verifyView('monitor','monitoreo','Monitoreo '+tag);
      await page.locator('#showDemos').click();
      await page.locator('#demoSelect').selectOption('1');
      await wait(()=>page.locator('#startDemoButton').isEnabled(),'no se pudo preparar DEMO');
      await verifyView('demo','demo','Demo '+tag+' con Detener visible');
      assert.equal(f.socketsOpened,1,'duplicación de WSS al navegar');
      assert.equal(f.posts.length,0,'navegación emitió escrituras');
      if(record.control&&record.monitor&&record.demo)console.log(tag,'CONTROL, MONITOREO y DEMO OK');
    }catch(error){await f.page.screenshot({path:resolve(output,'fallo-'+tag+'.png')}).catch(()=>{});throw error;}
    finally{await f.ctx.close();}
  }
  assert.equal(layoutErrors.length,0,`fallaron ${layoutErrors.length} geometrías`);
  await checkZoom();
  await checkDirectionalPointer();
  await checkDirectionalKeyboard();
  await checkDirectionalTouch();
  await checkOrientationChange();
  await checkMovementDisconnect();
  await checkDemoObservation();
  await checkAccessPanel();
  const f=await scenario(390,844);
  try{
    const {page}=f;
    assert.equal(await page.locator('#authDialog').evaluate(e=>e.open),false);
    await page.locator('#showControl').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#showMonitor').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#showMonitor').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#showDemos').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');
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
    await page.locator('#showDemos').click();
    await page.locator('#demoSelect').selectOption('1');
    await page.locator('#startDemoButton').click();
    await wait(()=>f.posts.some(p=>p.path.endsWith('/iniciar')),'no inició DEMO');
    await page.locator('#showMonitor').click();
    await label(page,'#monitorMovement','Retroceder');
    assert.equal(f.history.length,beforeDemo);
    assert(!(await page.locator('#historyRows tr:first-child').textContent()).includes('Retroceder'));
    await page.locator('#showDemos').click();
    await page.locator('#cancelDemoButton').click();
    await wait(()=>f.posts.some(p=>p.path.endsWith('/cancelar')),'no canceló DEMO');
    report.scenarios.demo=true;
    await page.locator('#showControl').click();
    f.holdMove=true;
    await page.getByRole('button',{name:'Avanzar',exact:true}).click();
    await wait(()=>Boolean(f.heldMove),'POST retenido no observado');
    f.holdStop=true;
    await page.locator('#stopButton').click();
    await wait(()=>Boolean(f.heldStop),'DETENER bloqueado por movimiento pendiente');
    f.heldMove();
    f.heldStop();
    await joystickReady(page);
    await label(page,'#movementDisplay','Neutral');
    report.scenarios.stopPriority=true;
    await page.locator('#joystick').focus();
    const beforeKeyboardMotion=motionPosts(f).length,beforeKeyboardStop=stopPosts(f).length;
    await page.keyboard.down('ArrowUp');
    await wait(()=>motionPosts(f).length===beforeKeyboardMotion+1,'joystick de teclado no envía movimiento');
    f.send('demo_movimiento',{...f.execution,orden:1,duracion_ms:600,pausa_ms:300,fecha_hora:stamp(1)});
    await page.waitForTimeout(80);
    await joystickDirection(page,'up');
    await page.keyboard.up('ArrowUp');
    await wait(()=>stopPosts(f).length===beforeKeyboardStop+1,'soltar teclado no envía DETENER');
    report.scenarios.keyboard=true;
    report.scenarios.staleDemoDuringManual=true;
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
    f.status.health=503;
    f.status.rds=502;
    await page.locator('#retryConnectionButton').click();
    await label(page,'#apiStatus','No disponible');
    await label(page,'#dbStatus','Sin verificar');
    await label(page,'#wsStatus','En línea');
    await image(page,'monitoreo-error-aws-390x844',6,'Salud AWS 503 y error de gateway 502 al consultar RDS simulados; WSS sigue en línea.');
    f.status.rds=200;
    await page.locator('#retryConnectionButton').click();
    await label(page,'#dbStatus','Disponible');
    await label(page,'#apiStatus','No disponible');
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
    const stop=page.locator('#stopButton');
    if(await stop.isEnabled())await stop.click();
    else assert(await stop.isVisible(),'DETENER desaparece con la evaluación cerrada');
    await label(page,'#controlAvailability','Requiere acceso autorizado');
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
