import {VEHICLE_ID, API_CHECK_MS, RDS_CHECK_MS} from './config.js';
import {ApiClient} from './api.js';
import {VehicleSocket} from './socket.js';
import {ControlSession} from './control.js';
import {DIRECTIONS,validCommands,commandByName} from './catalog.js';
import {initJoystick} from './joystick.js';
import * as ui from './ui.js';

const $=s=>document.querySelector(s);
const api=new ApiClient();
let joystick, demos=[], steps=[], catalogBusy=false, catalogLoaded=false, selectionVersion=0;
let apiAvailable=null, rdsVersion=0, healthBusy=false, rdsBusy=false;
const control=new ControlSession(api,{
  change:refreshControls,operation:ui.setOperation,movement:ui.displayMovement,
  step:ui.markDemoStep,neutral:()=>joystick?.neutral(),
});
const state=control.state;
function refreshControls(){
  ui.lockCommands(!control.canMove());
  ui.markCommandState(state.lastRequested,state.movementPhase,state.pending);
  $('#joystick').setAttribute('aria-disabled',String(!control.canMove()));
  ui.setDemoButtons({canStart:control.canStart(),
    canCancel:(state.demoActive||state.uncertain)&&!state.demoBusy&&!state.stopBusy&&Boolean(state.activeDemoId),
    selectionDisabled:state.demoBusy||state.demoActive||state.uncertain||state.stopBusy});
}
function authorized(){
  if(api.hasKey)return true;
  ui.notify('Introduce tu clave de operador en Acceso. Sólo se conserva en memoria.');
  ui.showAuth();return false;
}
function opError(prefix,error){ui.setOperation(`${prefix} · sin confirmación`,error.message);ui.notify(error.message);}
async function selectDemo(){
  if(state.demoActive||state.demoBusy||state.stopBusy||state.uncertain)return;
  const demo=demos.find(d=>String(d.id_demo)===$('#demoSelect').value);
  await loadDemoPlan(demo?.id_demo??null);
}
async function loadDemoPlan(id){
  const version=++selectionVersion;
  state.selectedDemo=id;state.stepsReady=false;steps=[];
  ui.renderDemoSteps([]);refreshControls();
  if(!id)return;
  try{
    const result=await api.demoSteps(id);
    if(version!==selectionVersion)return;
    if(!Array.isArray(result))throw Error('El servidor no devolvió una lista de pasos.');
    steps=result;
    state.stepsReady=steps.length>0;
    ui.renderDemoSteps(steps);
    if(state.demoActive&&state.activeDemoId===id)ui.markDemoStep(state.lastOrder);
    refreshControls();
  }catch(error){if(version===selectionVersion)opError('Secuencia',error);}
}
const socket=new VehicleSocket(value=>{
  ui.setIndicator('ws',value,value==='En línea'?'ok':value==='Desconectado'?'error':'wait');
  if(value==='En línea')control.connected();
  else if(value==='Desconectado')control.disconnected();
},event=>{
  control.event(event);
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
    apiAvailable=true;ui.setIndicator('api','Disponible','ok');
    if(!catalogLoaded)void loadCatalog();
  }catch(error){
    apiAvailable=false;rdsVersion++;ui.setIndicator('api',error.status?'No disponible':'Sin verificar',error.status?'error':'wait');
    ui.setIndicator('db','Sin verificar','wait');
    $('#apiStatus').title=error.message;
    if(!catalogLoaded){ui.displayVehicle('Catálogo sin verificar');ui.renderCommands([]);ui.renderDemos([],{verified:false});refreshControls();}
  }finally{healthBusy=false;}
}
async function checkRds(){
  if(rdsBusy)return;
  if(apiAvailable!==true){ui.setIndicator('db','Sin verificar','wait');return;}
  rdsBusy=true;
  const version=++rdsVersion;
  ui.setIndicator('db','Comprobando','wait');
  try{
    const result=await api.rdsHealth();
    if(version!==rdsVersion||apiAvailable!==true)return;
    ui.setIndicator('db',result?.status==='ok'?'Disponible':'Sin verificar',result?.status==='ok'?'ok':'wait');
  }catch(error){
    if(version===rdsVersion&&apiAvailable===true)
      ui.setIndicator('db',error.status===503?'No disponible':'Sin verificar',error.status===503?'error':'wait');
  }finally{rdsBusy=false;}
}
async function loadCatalog(){
  if(catalogBusy)return;
  catalogBusy=true;
  try{
    const [v,c,d]=await Promise.allSettled([api.vehicle(),api.commands(),api.demos()]);
    if(v.status==='fulfilled'&&v.value?.nombre)ui.displayVehicle(v.value.nombre);
    else ui.displayVehicle('Catálogo sin verificar');
    if(c.status==='fulfilled'){
      state.commands=validCommands(c.value,VEHICLE_ID);
      catalogLoaded=true;
    }else{
      state.commands=[];
      ui.notify('Catálogo sin verificar. Revisa conexión, AWS y CORS; Reintentar sólo consulta datos.');
    }
    ui.renderCommands(state.commands,cmd=>{if(control.canMove()&&authorized())void control.move(cmd);});
    if(d.status==='fulfilled'){
      demos=Array.isArray(d.value)?d.value.filter(x=>x?.activo===true&&x.id_vehiculo===VEHICLE_ID&&Number.isInteger(x.id_demo)):[];
    }else{demos=[];catalogLoaded=false;}
    if(!state.demoActive&&!state.demoBusy&&!state.uncertain){
      ++selectionVersion;state.selectedDemo=null;state.stepsReady=false;steps=[];
      ui.renderDemos(demos,{verified:d.status==='fulfilled'});ui.renderDemoSteps([]);
    }
  }finally{catalogBusy=false;refreshControls();}
}
async function retry(){await checkHealth();await checkRds();if(apiAvailable===true)await loadCatalog();}

$('#credentialsButton').addEventListener('click',ui.showAuth);
$('#saveKeyButton').addEventListener('click',()=>{
  api.setKey($('#keyInput').value);$('#keyInput').value='';ui.setAccessLabel(api.hasKey);$('#authDialog').close();
  ui.setOperation('Acceso actualizado',api.hasKey?'Clave sólo en memoria de esta página.':'No se ingresó ninguna clave.');
});
$('#clearKeyButton').addEventListener('click',()=>{
  api.clearKey();$('#keyInput').value='';ui.setAccessLabel(false);$('#authDialog').close();
  ui.setOperation('Acceso borrado','La clave se eliminó de la memoria de esta página.');
});
$('#authDialog').addEventListener('close',()=>{$('#keyInput').value='';});
$('#keyInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#saveKeyButton').click();}});
$('#stopButton').addEventListener('click',()=>{if(authorized())void control.stop();});
$('#demoSelect').addEventListener('change',()=>void selectDemo());
$('#startDemoButton').addEventListener('click',()=>{if(control.canStart()&&authorized())void control.start();});
$('#cancelDemoButton').addEventListener('click',()=>{if(authorized())void control.cancel();});
$('#retryConnectionButton').addEventListener('click',()=>void retry());
joystick=initJoystick(direction=>{
  const command=commandByName(state.commands,DIRECTIONS[direction]);
  if(!command){ui.notify('Esta dirección no está disponible en el catálogo del vehículo.');return false;}
  if(!authorized())return false;
  void control.move(command);
},()=>{if(api.hasKey)void control.stop();},{isEnabled:()=>control.canMove()});

refreshControls();socket.start();
void checkHealth().then(checkRds);
setInterval(()=>void checkHealth().then(checkRds),API_CHECK_MS);
setInterval(()=>void checkRds(),RDS_CHECK_MS);
window.addEventListener('pagehide',()=>{api.clearKey();$('#keyInput').value='';ui.setAccessLabel(false);socket.close();});
window.addEventListener('pageshow',event=>{if(event.persisted){socket.start();void retry();}});
