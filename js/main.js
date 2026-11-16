import {VEHICLE_ID, API_CHECK_MS, RDS_CHECK_MS} from './config.js';
import {ApiClient} from './api.js';
import {VehicleSocket} from './socket.js';
import {ControlSession} from './control.js?v=2';
import {DIRECTIONS,validCommands,commandByName} from './catalog.js';
import {isDiagonal} from './directions.js';
import {initJoystick} from './joystick.js?v=2';
import {initNavigation} from './navigation.js?v=2';
import {MonitorSession} from './monitor.js';
import * as ui from './ui.js?v=2';

const $=s=>document.querySelector(s);
const api=new ApiClient(accessChanged);
const monitor=new MonitorSession(api,ui.renderMonitor);
let renewalTimer=null;
let joystick, demos=[], catalogBusy=false, catalogLoaded=false, selectionVersion=0;
let apiAvailable=null, healthBusy=false, rdsBusy=false;
let gestureRequested=false, manualActive=false, awaitingConnection=false, inputPreviewOnly=false;
let preserveCapture=false;
const directionLabels={up:'Avanzar',right:'Girar a la derecha',down:'Retroceder',left:'Girar a la izquierda',
  'up-right':'Avanzar a la derecha','up-left':'Avanzar a la izquierda',
  'down-right':'Retroceder a la derecha','down-left':'Retroceder a la izquierda'};
const control=new ControlSession(api,{
  change:refreshControls,operation:ui.setOperation,movement:ui.displayMovement,
  canDispatch:canDrive,
  step:ui.markDemoStep,neutral:({preservePreview=false}={})=>{
    manualActive=false;gestureRequested=false;
    if(preservePreview&&(inputPreviewOnly||preserveCapture))return;
    preserveCapture=false;joystick?.neutral();
  },
  confirmed:result=>monitor.confirmIndividual(result),
});
const state=control.state;
ui.initUi();
const navigation=initNavigation(view=>{
  joystick?.neutral({notify:true});
  if(view==='demo'&&manualActive)stopManual();
  if(view==='monitor')void monitor.enter();
  else monitor.leave();
});
$('#monitorRefresh')?.addEventListener('click',()=>void monitor.refresh());

function accessChanged(){
  ui.setAccessLabel(api.hasKey,api.evaluationStatus);
  if(!api.hasAccess&&manualActive){
    manualActive=false;gestureRequested=false;control.interruptManual();
  }
  refreshControls();
  clearTimeout(renewalTimer);renewalTimer=null;
  const remaining=api.evaluationRemaining;
  if(remaining>0){
    // Renovar antes de expirar, sin retrasar DETENER ni repetir un POST.
    const delay=Math.min(remaining,Math.max(1000,remaining-Math.min(15000,remaining/3)));
    renewalTimer=setTimeout(()=>{
      if(api.hasEvaluation)void api.evaluation({force:true});
      else{api.clearEvaluation();ui.setAccessLabel(api.hasKey,'closed');}
    },delay);
  }
}
function canDrive(){
  return api.hasAccess&&navigator.onLine&&!awaitingConnection&&!$('#authDialog').open&&control.canMove();
}
function refreshControls(){
  ui.lockCommands(!canDrive());
  ui.markCommandState(state.lastRequested,state.movementPhase,state.pending);
  ui.setDemoButtons({canStart:canDrive()&&control.canStart(),
    canCancel:api.hasAccess&&(state.demoActive||state.uncertain)&&!state.demoBusy&&!state.stopBusy&&Boolean(state.activeDemoId),
    selectionDisabled:state.demoBusy||state.demoActive||state.uncertain||state.stopBusy});
  ui.setDemoState(state.uncertain&&(state.demoActive||state.demoBusy)?'Observación incierta':state.demoStatus);
}
function authorized(){
  if(api.hasAccess)return true;
  const message=api.evaluationStatus==='checking'?'Comprobando el acceso de evaluación.':
    'El control no está habilitado para esta sesión. Puedes seguir usando Monitoreo.';
  ui.notify(message);return false;
}
function opError(prefix,error){ui.setOperation(`${prefix} · sin confirmación`,error.message);ui.notify(error.message);}
function stopManual({preserveInput=false}={}){
  manualActive=false;gestureRequested=false;
  preserveCapture=preserveInput;
  if(!preserveInput)joystick?.neutral();
  if(api.hasAccess)void control.stop({preserveInput});
  else control.interruptManual();
}
function requestStop(){
  joystick?.neutral();
  if(authorized())stopManual();
}
function onConnectionLost(){
  if(!manualActive)return;
  awaitingConnection=true;
  joystick?.neutral();
  stopManual();
}
async function selectDemo(){
  if(state.demoActive||state.demoBusy||state.stopBusy||state.uncertain)return;
  const demo=demos.find(d=>String(d.id_demo)===$('#demoSelect').value);
  await loadDemoPlan(demo?.id_demo??null);
}
async function loadDemoPlan(id){
  const version=++selectionVersion;
  state.selectedDemo=id;state.stepsReady=false;
  ui.renderDemoSteps([]);refreshControls();
  if(!id)return;
  try{
    const result=await api.demoSteps(id);
    if(version!==selectionVersion)return;
    if(!Array.isArray(result))throw Error('El servidor no devolvió una lista de pasos.');
    state.stepsReady=result.length>0;
    ui.renderDemoSteps(result);
    if(state.demoActive&&state.activeDemoId===id)ui.markDemoStep(state.lastOrder);
    refreshControls();
  }catch(error){if(version===selectionVersion)opError('Secuencia',error);}
}
const socket=new VehicleSocket(value=>{
  ui.setIndicator('ws',value,value==='En línea'?'ok':value==='Desconectado'?'error':'wait');
  monitor.connection(value);
  if(value==='En línea'){
    awaitingConnection=false;
    control.connected();refreshControls();
  }else if(value==='Desconectado'){
    control.disconnected();onConnectionLost();refreshControls();
  }
},event=>{
  control.event(event);
  monitor.event(event);
  if(['demo_inicio','demo_movimiento'].includes(event.tipo)&&state.demoActive&&state.activeDemoId!==state.selectedDemo){
    // Una DEMO de otro cliente también debe mostrar su propio plan consultado por GET.
    $('#demoSelect').value=String(state.activeDemoId);
    void loadDemoPlan(state.activeDemoId);
  }
});

async function checkHealth(){
  if(healthBusy)return;
  healthBusy=true;ui.setIndicator('api','Comprobando','wait');
  try{
    const result=await api.health();
    if(result?.status!=='ok')throw Error('Salud sin estado concluyente.');
    $('#apiStatus').removeAttribute('title');
    apiAvailable=true;ui.setIndicator('api','Disponible','ok');
    if(!catalogLoaded)void loadCatalog();
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
  if(catalogBusy)return;
  catalogBusy=true;
  try{
    const [v,c,d]=await Promise.allSettled([api.vehicle(),api.commands(),api.demos()]);
    if(v.status==='fulfilled'&&v.value?.id_vehiculo===VEHICLE_ID&&typeof v.value?.nombre==='string'){
      ui.displayVehicle(v.value.nombre);monitor.setVehicleName(v.value.nombre);
    }
    else ui.displayVehicle('Catálogo sin verificar');
    if(c.status==='fulfilled'){
      state.commands=validCommands(c.value,VEHICLE_ID);
      catalogLoaded=true;
    }else{
      state.commands=[];
      ui.notify('No pudimos verificar los movimientos. Puedes intentar actualizar la conexión.');
    }
    ui.renderCommands(state.commands,cmd=>{
      if(!canDrive())return;
      if(Object.values(DIRECTIONS).some(direction=>commandByName(state.commands,direction)===cmd)){
        manualActive=true;preserveCapture=false;
      }
      void control.move(cmd);
    });
    if(d.status==='fulfilled'){
      demos=Array.isArray(d.value)?d.value.filter(x=>x?.activo===true&&x.id_vehiculo===VEHICLE_ID&&Number.isInteger(x.id_demo)):[];
    }else{demos=[];catalogLoaded=false;}
    if(!state.demoActive&&!state.demoBusy&&!state.uncertain){
      const selected=state.selectedDemo;
      ui.renderDemos(demos,{verified:d.status==='fulfilled'});
      if(demos.some(demo=>demo.id_demo===selected))$('#demoSelect').value=String(selected);
      else{
        ++selectionVersion;state.selectedDemo=null;state.stepsReady=false;
        ui.renderDemoSteps([]);
      }
    }
  }finally{catalogBusy=false;refreshControls();}
}
async function retry(){
  void api.evaluation({force:true});
  if(navigation.view==='monitor')void monitor.refresh();
  await Promise.all([checkHealth(),checkRds()]);if(apiAvailable===true)await loadCatalog();
}

$('#credentialsButton').addEventListener('click',()=>{
  joystick?.neutral({notify:true});
  if(manualActive)stopManual();
  ui.showAuth();refreshControls();
});
$('#saveKeyButton').addEventListener('click',()=>{
  api.setKey($('#keyInput').value);$('#keyInput').value='';$('#authDialog').close();
  ui.setOperation('Acceso actualizado',api.hasKey?'Clave sólo en memoria de esta página.':'No se ingresó ninguna clave.');
});
$('#clearKeyButton').addEventListener('click',()=>{
  api.clearKey();$('#keyInput').value='';$('#authDialog').close();
  ui.setOperation('Acceso borrado','La clave se eliminó de la memoria de esta página.');
});
$('#authDialog').addEventListener('close',()=>{$('#keyInput').value='';refreshControls();});
$('#keyInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#saveKeyButton').click();}});
for(const button of ['#stopButton','#stopDemoButton']){
  $(button).addEventListener('click',requestStop);
}
$('#demoSelect').addEventListener('change',()=>void selectDemo());
$('#startDemoButton').addEventListener('click',()=>{if(canDrive()&&control.canStart())void control.start();});
$('#cancelDemoButton').addEventListener('click',()=>{if(authorized())void control.cancel();});
$('#retryConnectionButton').addEventListener('click',()=>void retry());
joystick=initJoystick(direction=>{
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
  isEnabled:canDrive,
  isPreviewEnabled:()=>navigation.view==='control'&&!$('#authDialog').open,
  diagonalButtons:document.querySelectorAll('[data-preview-direction]'),
  onPreview(direction,{previewOnly}){
    inputPreviewOnly=Boolean(direction)&&previewOnly;
    if(direction&&!previewOnly)preserveCapture=false;
    const label=directionLabels[direction]||'Neutral';
    $('#directionStatus').textContent=inputPreviewOnly?`${label} · Vista previa`:label;
    $('.control-panel').dataset.preview=String(inputPreviewOnly);
    for(const button of document.querySelectorAll('[data-preview-direction]')){
      button.dataset.current=String(button.dataset.previewDirection===direction);
    }
  },
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.defaultPrevented&&!event.repeat){
    if($('#authDialog').open)$('#authDialog').close();
    else if(manualActive||api.hasAccess||joystick.direction){event.preventDefault();requestStop();}
  }
});

ui.setAccessLabel(api.hasKey,api.evaluationStatus);
refreshControls();socket.start();void api.evaluation();
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
});
window.addEventListener('pageshow',event=>{if(event.persisted){
  if(navigation.view==='monitor')void monitor.enter();
  socket.start();void retry();
}});
