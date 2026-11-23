import {VEHICLE_ID, API_CHECK_MS, RDS_CHECK_MS} from './config.js';
import {ApiClient} from './api.js?v=7';
import {VehicleSocket} from './socket.js?v=7';
import {ControlSession} from './control.js?v=7';
import {DIAGONAL_COMMANDS,DIRECTIONS,validCommands,commandByName} from './catalog.js?v=6';
import {isDiagonal} from './directions.js';
import {SustainedControl} from './sustained.js?v=6';
import {initJoystick} from './joystick.js?v=4';
import {initNavigation} from './navigation.js?v=3';
import {MonitorSession} from './monitor.js?v=6';
import * as ui from './ui.js?v=7';
import {Platform43} from './platform43.js?v=1';

const $=s=>document.querySelector(s);
const api=new ApiClient(accessChanged);
let monitor=new MonitorSession(api,ui.renderMonitor),portal=null;
let scope=0,switching=false,platformChecked=false,protectedObserved=false;
let renewalTimer=null;
let joystick, demos=[], catalogBusy=false, catalogLoaded=false, selectionVersion=0;
let apiAvailable=null, healthBusy=false, rdsBusy=false;
let gestureRequested=false, manualActive=false, awaitingConnection=false, inputPreviewOnly=false, wsOnline=false;
let preserveCapture=false;
const directionLabels={up:'Avanzar',right:'Girar a la derecha',down:'Retroceder',left:'Girar a la izquierda',
  'up-right':'Avanzar a la derecha','up-left':'Avanzar a la izquierda',
  'down-right':'Retroceder a la derecha','down-left':'Retroceder a la izquierda'};
function buildSustained(){
const generation=scope;
return new SustainedControl(api,{
  change:refreshControls,
  accepted(direction,sample){
    if(generation!==scope)return;
    ui.displayMovement(directionLabels[direction]);
    const persistence=sample.persistenceMs==null?'':` Persistencia y publicación en ${sample.persistenceMs} ms.`;
    ui.setOperation(`${directionLabels[direction]} · permiso aceptado`,
      `REST en ${sample.milliseconds} ms.${persistence} La respuesta no confirma las salidas del dispositivo.`);
  },
  released(sample){
    if(generation!==scope)return;
    ui.displayMovement('Neutral');
    ui.setOperation('Permiso liberado',`El servidor confirmó la revocación en ${sample.milliseconds} ms. El dispositivo conserva su plazo automático.`);
  },
  failed(sample){
    if(generation!==scope)return;
    manualActive=false;gestureRequested=false;preserveCapture=false;joystick?.neutral();
    ui.displayMovement('Sin confirmar');
    ui.setOperation('Control sostenido interrumpido',
      `Sin confirmación de ${sample.action} (${sample.milliseconds} ms). Revisa el enlace y usa DETENER si corresponde.`);
  },
});
}
let sustained=buildSustained();
function buildControl(){
return new ControlSession(api,{
  change:refreshControls,operation:ui.setOperation,movement:ui.displayMovement,
  canDispatch:canDrive,barrier:()=>sustained.barrier,
  refreshBarrier,
  step:ui.markDemoStep,neutral:({preservePreview=false}={})=>{
    manualActive=false;gestureRequested=false;
    if(preservePreview&&(inputPreviewOnly||preserveCapture))return;
    preserveCapture=false;joystick?.neutral();
  },
  confirmed:result=>monitor.confirmIndividual(result),
});
}
let control=buildControl(),state=control.state;
ui.initUi();
const navigation=initNavigation(view=>{
  joystick?.neutral({notify:true});
  if(view==='demo'&&manualActive)stopManual();
  if(view==='monitor'&&api.vehicleId)void monitor.enter();
  else monitor.leave();
});
$('#monitorRefresh')?.addEventListener('click',()=>void monitor.refresh());

function accessChanged(){
  if(api.platformEnabled&&!api.signedIn)portal?.sessionEnded();
  if(sustained.active&&!api.canSustain)void sustained.release();
  if(!api.hasAccess&&manualActive){
    if(sustained.active)void sustained.release();
    manualActive=false;gestureRequested=false;control.interruptManual();
  }
  refreshControls();
  clearTimeout(renewalTimer);renewalTimer=null;
  const remaining=api.evaluationRemaining;
  if(remaining>0){
    // Renovar antes de expirar, sin retrasar DETENER ni repetir un POST.
    const delay=Math.min(remaining,Math.max(1000,remaining-Math.min(15000,remaining/3)));
    renewalTimer=setTimeout(()=>{
      void api.evaluation({force:true});
    },delay);
  }
}
function canDrive(){
  if(!platformChecked||switching||!api.vehicleId)return false;
  if(api.platformEnabled&&api.physicalUnit&&!sustained.ready)return false;
  const available=(sustained.mode==='legacy'&&!api.hasDirect)||(wsOnline&&sustained.ready);
  return available&&(!api.platformEnabled||wsOnline)&&api.hasAccess&&navigator.onLine&&!awaitingConnection&&!$('#authDialog').open&&control.canMove();
}
function canJoystick(){return canDrive()&&(sustained.mode==='legacy'||(api.canSustain&&sustained.ready&&!state.movementBusy));}
function refreshBarrier(){
  if(sustained.mode!=='managed')return;
  if(sustained.active){stopManual();return;}
  if(sustained.releasing)return;
  sustained.invalidate();
  void sustained.refresh();
}
function refreshControls(){
  ui.setAccessLabel(api.hasKey,api.evaluationStatus,{direct:api.hasDirect,operatorForJoystick:sustained.mode==='managed'});
  if(api.platformEnabled){
    $('#credentialsButton').hidden=true;
    $('#accessState').hidden=true;
    $('#controlAvailability').hidden=api.hasAccess;
    $('#controlAvailability').textContent=api.hasAccess?'':'Mando sin permiso';
  }
  const remoteDemo=commandByName(state.commands,'DEMO');
  const lockedDemo=sustained.mode==='managed'&&!sustained.remoteDemo?remoteDemo?.id_comando:null;
  ui.lockCommands(!canDrive()||sustained.active,lockedDemo);
  ui.markCommandState(state.lastRequested,state.movementPhase,state.pending);
  ui.setDemoButtons({canStart:canDrive()&&!sustained.active&&control.canStart(),
    canCancel:api.hasAccess&&(state.demoActive||state.uncertain)&&!state.demoBusy&&!state.stopBusy&&Boolean(state.activeDemoId),
    selectionDisabled:state.demoBusy||state.demoActive||state.uncertain||state.stopBusy});
  ui.setDemoState(state.uncertain&&(state.demoActive||state.demoBusy)?'Observación incierta':state.demoStatus);
}
function authorized(){
  if(api.hasAccess)return true;
  const message=api.evaluationStatus==='checking'?'Comprobando el acceso de control.':
    'El control no está habilitado para esta sesión. Puedes seguir usando Monitoreo.';
  ui.notify(message);return false;
}
function opError(prefix,error){ui.setOperation(`${prefix} · sin confirmación`,error.message);ui.notify(error.message);}
function stopManual({preserveInput=false,global=false}={}){
  manualActive=false;gestureRequested=false;
  preserveCapture=preserveInput;
  if(!preserveInput)joystick?.neutral();
  if(!global&&sustained.active){void sustained.release();return;}
  sustained.invalidate();
  if(api.hasAccess)void control.stop({preserveInput}).finally(()=>sustained.refresh());
  else control.interruptManual();
}
function requestStop(){
  joystick?.neutral();
  if(authorized())stopManual({global:true});
}
function onConnectionLost(){
  if(!manualActive)return;
  awaitingConnection=true;
  joystick?.neutral();
  stopManual();
}
async function selectDemo(){
  if(state.demoActive||state.demoBusy||state.stopBusy||state.uncertain)return;
  const demo=demos.find(d=>(d.key??String(d.id_demo))===$('#demoSelect').value);
  await loadDemoPlan(demo??null);
}
async function loadDemoPlan(demo){
  const version=++selectionVersion;
  const id=demo?.id_demo;
  state.selectedDemo=id??null;state.commercialDemo=demo?.commercial===true;state.stepsReady=false;
  ui.renderDemoSteps([]);refreshControls();
  if(!id)return;
  try{
    const result=demo.commercial?demo.pasos.map((step,index)=>({...step,orden:step.orden??index+1,
      comando:state.commands.find(command=>command.codigo===step.codigo)?.nombre??`Código ${step.codigo}`})):
      await api.demoSteps(id);
    if(version!==selectionVersion)return;
    if(!Array.isArray(result))throw Error('El servidor no devolvió una lista de pasos.');
    state.stepsReady=result.length>0;
    ui.renderDemoSteps(result);
    if(state.demoActive&&state.activeDemoId===id)ui.markDemoStep(state.lastOrder);
    refreshControls();
  }catch(error){if(version===selectionVersion)opError('Secuencia',error);}
}
const socket=new VehicleSocket(value=>{
  wsOnline=value==='En línea';
  ui.setIndicator('ws',value,value==='En línea'?'ok':value==='Desconectado'?'error':'wait');
  monitor.connection(value);
  if(value==='En línea'){
    awaitingConnection=false;
    control.connected();refreshControls();void sustained.refresh();
    if(api.platformEnabled&&navigation.view==='monitor')void monitor.enter();
  }else if(value==='Desconectado'){
    control.disconnected();onConnectionLost();refreshControls();
    if(api.platformEnabled&&!switching){
      monitor.close();
      monitor=new MonitorSession(api,ui.renderMonitor,{vehicleId:api.vehicleId});
      ui.renderMonitor();
    }
  }
},event=>{
  if(event.tipo==='salida_dispositivo'){monitor.event(event);return;}
  const activeLease=sustained.active;
  if(['detencion_logica','demo_fin','demo_cancelada','demo_error'].includes(event.tipo))refreshBarrier();
  control.event(event);
  if(activeLease&&sustained.active&&state.demoActive&&state.execution===event.id_ejecucion){
    void sustained.release();
  }
  monitor.event(event);
  if(['demo_inicio','demo_movimiento'].includes(event.tipo)&&state.demoActive
    &&(state.activeDemoId!==state.selectedDemo||(event.origen_demo==='comercial'&&!state.commercialDemo))){
    // Una DEMO de otro cliente también debe mostrar su propio plan consultado por GET.
    const key=event.origen_demo==='comercial'?`43:${state.activeDemoId}`:String(state.activeDemoId);
    const observed=demos.find(item=>(item.key??String(item.id_demo))===key);
    if(observed){
      $('#demoSelect').value=key;
      void loadDemoPlan(observed);
    }
  }
});

async function checkHealth(){
  if(healthBusy)return;
  healthBusy=true;ui.setIndicator('api','Comprobando','wait');
  const start=performance.now();
  try{
    const result=await api.health();
    if(result?.status!=='ok')throw Error('Salud sin estado concluyente.');
    $('#apiStatus').title=`Salud HTTPS en ${Math.round(performance.now()-start)} ms`;
    apiAvailable=true;ui.setIndicator('api','Disponible','ok');
    if(platformChecked&&!api.platformEnabled&&!api.hasAccess)void api.evaluation();
    if(platformChecked&&api.vehicleId&&!switching){
      if(!state.stopBusy)void sustained.refresh();
      if(!catalogLoaded)void loadCatalog();
    }
  }catch(error){
    apiAvailable=false;ui.setIndicator('api','No disponible','error');
    $('#apiStatus').title='No se pudo verificar la disponibilidad del servidor.';
    if(!catalogLoaded){ui.displayVehicle('Catálogo sin verificar');ui.renderCommands([]);ui.renderDemos([],{verified:false});refreshControls();}
  }finally{healthBusy=false;}
}
async function checkRds(){
  if(rdsBusy)return;
  rdsBusy=true;
  try{
    const result=await api.rdsHealth();
    const available=result?.status==='ok'&&navigator.onLine;
    ui.setIndicator('db',available?'Disponible':'Sin verificar',available?'ok':'wait');
  }catch(error){
    const unavailable=navigator.onLine&&error.status===503&&error.code==='http'&&error.responseStatus==='unavailable';
    ui.setIndicator('db',unavailable?'No disponible':'Sin verificar',unavailable?'error':'wait');
  }finally{rdsBusy=false;}
}
async function loadCatalog(){
  if(catalogBusy||!api.vehicleId||switching)return;
  const generation=scope,vehicle=api.vehicleId;
  catalogBusy=true;
  try{
    const [v,c,d,commercial]=await Promise.allSettled([api.vehicle(),api.commands(),api.demos(),api.commercialDemos()]);
    if(generation!==scope)return;
    if(v.status==='fulfilled'&&v.value?.id_vehiculo===vehicle&&typeof v.value?.nombre==='string'){
      ui.displayVehicle(v.value.nombre);monitor.setVehicleName(v.value.nombre);
    }
    else ui.displayVehicle('Catálogo sin verificar');
    if(c.status==='fulfilled'){
      state.commands=validCommands(c.value,vehicle);
      catalogLoaded=true;
    }else{
      state.commands=[];
      ui.notify('No pudimos verificar los movimientos. Puedes intentar actualizar la conexión.');
    }
    ui.renderCommands(state.commands.filter(cmd=>!DIAGONAL_COMMANDS.has(cmd.nombre)),cmd=>{
      if(!canDrive()||sustained.active)return;
      if(cmd===commandByName(state.commands,'DEMO')&&!sustained.remoteDemo)return;
      if(sustained.mode==='managed'||Object.values(DIRECTIONS).some(direction=>commandByName(state.commands,direction)===cmd)){
        manualActive=true;preserveCapture=false;
      }
      void control.move(cmd);
    });
    if(d.status==='fulfilled'){
      demos=Array.isArray(d.value)?d.value.filter(x=>x?.activo===true&&x.id_vehiculo===vehicle&&Number.isInteger(x.id_demo)):[];
    }else{demos=[];catalogLoaded=false;}
    if(commercial.status==='fulfilled'&&Array.isArray(commercial.value)){
      demos.push(...commercial.value.filter(row=>row?.activo===true&&Number.isInteger(row.id)&&Array.isArray(row.pasos)).map(row=>({
        id_demo:row.id,id_vehiculo:vehicle,nombre:row.nombre,pasos:row.pasos,key:`43:${row.id}`,commercial:true,
      })));
    }
    if(!state.demoActive&&!state.demoBusy&&!state.uncertain){
      const selected=state.commercialDemo?`43:${state.selectedDemo}`:String(state.selectedDemo);
      ui.renderDemos(demos,{verified:d.status==='fulfilled'});
      if(demos.some(demo=>(demo.key??String(demo.id_demo))===selected))$('#demoSelect').value=selected;
      else{
        ++selectionVersion;state.selectedDemo=null;state.commercialDemo=false;state.stepsReady=false;
        ui.renderDemoSteps([]);
      }
    }
  }finally{if(generation===scope){catalogBusy=false;refreshControls();}}
}
async function retry(){
  if(!platformChecked)await bootstrap();
  void api.evaluation({force:true});
  if(navigation.view==='monitor'&&api.vehicleId)void monitor.refresh();
  await Promise.all([checkHealth(),checkRds()]);if(apiAvailable===true)await loadCatalog();
}

$('#credentialsButton').addEventListener('click',()=>{
  if(!platformChecked||api.platformEnabled)return;
  joystick?.neutral({notify:true});
  if(manualActive)stopManual();
  ui.showAuth();refreshControls();
});
$('#saveKeyButton').addEventListener('click',()=>{
  api.setKey($('#keyInput').value);$('#keyInput').value='';$('#authDialog').close();
  ui.setOperation('Acceso actualizado',api.hasKey?'Clave sólo en memoria de esta página.':'No se ingresó ninguna clave.');
});
$('#clearKeyButton').addEventListener('click',()=>{
  if(sustained.active)stopManual();
  api.clearKey();$('#keyInput').value='';$('#authDialog').close();
  ui.setOperation('Acceso borrado','La clave se eliminó de la memoria de esta página.');
});
$('#authDialog').addEventListener('close',()=>{$('#keyInput').value='';refreshControls();});
$('#keyInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#saveKeyButton').click();}});
for(const button of ['#stopButton','#stopDemoButton']){
  $(button).addEventListener('click',requestStop);
}
$('#demoSelect').addEventListener('change',()=>void selectDemo());
$('#startDemoButton').addEventListener('click',()=>{if(canDrive()&&!sustained.active&&control.canStart())void control.start();});
$('#cancelDemoButton').addEventListener('click',()=>{if(authorized())void control.cancel().finally(refreshBarrier);});
$('#retryConnectionButton').addEventListener('click',()=>void retry());
joystick=initJoystick(direction=>{
  if(sustained.mode!=='legacy'){
    if(isDiagonal(direction)&&!sustained.diagonals){
      if(sustained.active)stopManual({preserveInput:true});
      return;
    }
    if(canJoystick()&&sustained.direction(direction)){
      gestureRequested=true;manualActive=true;preserveCapture=false;
    }else if(!sustained.ready&&api.hasAccess){
      ui.notify('No hay permiso direccional disponible. Comprueba el enlace del dispositivo.');
    }
    return;
  }
  if(isDiagonal(direction)){
    if(gestureRequested||manualActive)stopManual({preserveInput:true});
    return;
  }
  const command=commandByName(state.commands,DIRECTIONS[direction]);
  if(!command){
    if(manualActive)stopManual();
    ui.notify('Esta dirección no está disponible en el catálogo del vehículo.');
    return false;
  }
  gestureRequested=true;manualActive=true;preserveCapture=false;
  void control.move(command);
},({held})=>{
  if(gestureRequested)stopManual({preserveInput:held});
  else if(!held)preserveCapture=false;
},{
  isEnabled:canJoystick,
  canContinueChord:()=>sustained.active&&sustained.diagonals&&canJoystick(),
  isPreviewEnabled:()=>navigation.view==='control'&&!$('#authDialog').open,
  onPreview(direction,{previewOnly}){
    const supportedDiagonal=isDiagonal(direction)&&sustained.diagonals&&canJoystick();
    inputPreviewOnly=Boolean(direction)&&previewOnly&&!supportedDiagonal;
    if(direction&&!previewOnly)preserveCapture=false;
    ui.displayDirection(directionLabels[direction]||'Neutral',{
      unsupported:isDiagonal(direction)&&!sustained.diagonals,
      preview:inputPreviewOnly,
    });
  },
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.defaultPrevented&&!event.repeat){
    if($('#authDialog').open)$('#authDialog').close();
    else if(manualActive||api.hasAccess||joystick.direction){event.preventDefault();requestStop();}
  }
});

async function selectVehicle(id,unitId=null,physical=false){
  const generation=++scope;
  switching=true;
  navigation.show('platform');
  joystick?.neutral();
  if(api.vehicleId&&api.hasAccess&&(manualActive||state.demoActive||state.demoBusy||state.movementBusy)){
    if(sustained.active)void sustained.release();
    await control.stop();
  }
  if(generation!==scope)return;
  manualActive=false;gestureRequested=false;preserveCapture=false;awaitingConnection=false;
  socket.close();
  control.epoch++;control.invalidateMovement('vehicle_changed');control.demoStartController?.abort();
  sustained.invalidate();monitor.close();
  api.setVehicleId(id,unitId,physical);selectionVersion++;catalogBusy=false;catalogLoaded=false;
  demos=[];control=buildControl();state=control.state;sustained=buildSustained();
  monitor=new MonitorSession(api,ui.renderMonitor,{vehicleId:id});
  ui.renderMonitor();ui.renderCommands([]);ui.renderDemos([]);ui.renderDemoSteps([]);
  ui.displayVehicle(id?'Cargando unidad':'Selecciona una unidad');
  ui.displayMovement('Neutral');
  switching=false;
  if(id){
    socket.configure(id,async vehicle=>(await api.request('/plataforma/tickets',{
      method:'POST',authorized:true,body:{id_vehiculo:vehicle},
    })).ticket);
    socket.start();await loadCatalog();
  }else ui.setIndicator('ws','Sin unidad','wait');
  refreshControls();
}
async function bootstrap(){
  try{
    const status=await api.request('/plataforma/status',{timeoutMs:4500,expectedStatus:200});
    if(typeof status?.habilitada!=='boolean')throw Error('Estado de plataforma incompleto.');
    if(status.habilitada){
      protectedObserved=true;
      api.setVehicleId(null);api.setPlatformEnabled(true);
      ui.setIndicator('ws','Sin unidad','wait');
      ui.displayVehicle('Sin unidad');
      portal??=new Platform43(api,navigation,selectVehicle,loadCatalog);
      portal.start();platformChecked=true;refreshControls();return;
    }
  }catch(error){
    if(error.status!==404){
      api.setVehicleId(null);api.setPlatformEnabled(true);
      ui.setIndicator('ws','Sin verificar','wait');
      ui.displayVehicle('Sin verificar');
      portal??=new Platform43(api,navigation,selectVehicle,loadCatalog);
      portal.unavailable();refreshControls();return;
    }
  }
  if(protectedObserved)return; // Una sesión protegida no se degrada a acceso anterior.
  api.setPlatformEnabled(false);api.setVehicleId(VEHICLE_ID);
  navigation.available(['control','monitor','demo']);
  platformChecked=true;socket.start();void api.evaluation();void loadCatalog();refreshControls();
}
refreshControls();void bootstrap();
void checkHealth();void checkRds();
setInterval(()=>void checkHealth(),API_CHECK_MS);
setInterval(()=>void checkRds(),RDS_CHECK_MS);
window.addEventListener('offline',()=>{
  ui.setIndicator('db','Sin verificar','wait');
  onConnectionLost();refreshControls();
});
window.addEventListener('online',()=>void retry());
window.addEventListener('pagehide',()=>{
  if(manualActive)onConnectionLost();
  monitor.close();api.clearKey();api.clearEvaluation();$('#keyInput').value='';socket.close();
  if(api.platformEnabled)api.setPlatformSession(null,0);
});
window.addEventListener('pageshow',event=>{if(event.persisted){
  if(navigation.view==='monitor'&&api.vehicleId)void monitor.enter();
  if(!api.platformEnabled||(api.signedIn&&api.vehicleId))socket.start();
  void retry();
}});
