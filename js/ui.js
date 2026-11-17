import {formatDuration,formatEvent,formatMessage,formatMovement,formatName,formatTimestamp,movementGroup,movementIcon} from './format.js';

const $=s=>document.querySelector(s);
const node=(tag,text,className)=>{
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(className)element.className=className;
  return element;
};
let messageTimer=null,initialized=false,historyPage=0;
let historyRows=[];
let demoOrder=null;

export function initUi(){
  if(initialized)return;
  initialized=true;
  $('#historyPrevious').addEventListener('click',()=>{historyPage--;paintHistory();});
  $('#historyNext').addEventListener('click',()=>{historyPage++;paintHistory();});
  window.addEventListener('resize',paintHistory,{passive:true});
}

export function setIndicator(kind,label,state){
  const tile=$(`[data-kind="${kind}"]`);
  const id={ws:'#wsStatus',api:'#apiStatus',db:'#dbStatus'}[kind];
  if(!tile||!id)return;
  const text=formatMessage(label,'Sin verificar');
  if($(id).textContent!==text)$(id).textContent=text;
  tile.classList.remove('state-ok','state-wait','state-error');
  tile.classList.add(`state-${['ok','wait','error'].includes(state)?state:'wait'}`);
}
export function setOperation(title,detail){
  $('#operationState').textContent=formatMessage(title,'Sin confirmación');
  $('#operationDetail').textContent=formatMessage(detail,'Sin detalles adicionales.');
  const t=$('#operationTime');
  t.textContent=new Intl.DateTimeFormat('es-MX',{hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(new Date());
  t.title='Hora local de esta notificación';
}
export function notify(message){
  const n=$('#notice'),detail=$('#noticeDetail');
  const text=formatMessage(message,'No fue posible completar la acción.');
  n.textContent=text;n.hidden=false;detail.textContent=text;detail.hidden=false;
  clearTimeout(messageTimer);messageTimer=setTimeout(()=>n.hidden=true,6500);
}
export function setAccessLabel(enabled,evaluationStatus='idle'){
  const access=$('#accessState'),button=$('#credentialsButton');
  const active=evaluationStatus==='active';
  button.hidden=active;
  button.querySelector('span').textContent=enabled?'Clave activa':'Acceso';
  access.hidden=!active;
  const unavailable=!active&&!enabled;
  document.querySelector('.actions-panel').dataset.authorized=String(!unavailable);
  const message=evaluationStatus==='checking'?'Comprobando acceso':'Requiere acceso autorizado';
  $('#controlAvailability').textContent=unavailable?message:'';
  $('#controlAvailability').hidden=!unavailable;
  if(active){
    access.textContent='Evaluación activa';
    if($('#authDialog').open)$('#authDialog').close();
  }
}
export function renderCommands(catalog,onClick){
  const target=$('#commandButtons');
  const focusedId=document.activeElement?.dataset.commandId;
  target.replaceChildren();
  const sorted=[...catalog].sort((a,b)=>
    (movementGroup(a.nombre)==='drive'?0:1)-(movementGroup(b.nombre)==='drive'?0:1)||a.codigo-b.codigo);
  $('#commandsCount').textContent=`${sorted.length} ${sorted.length===1?'movimiento':'movimientos'}`;
  if(!sorted.length){target.append(node('p','No hay movimientos disponibles para este vehículo.','empty-state'));return;}
  const groups=new Map();
  for(const c of sorted){
    const group=movementGroup(c.nombre);
    if(!groups.has(group)){
      const title=group==='drive'?'Dirección':'Equipo';
      const bank=node('div',undefined,'command-bank');
      const grid=node('div',undefined,'command-grid');
      bank.dataset.group=group;
      bank.setAttribute('role','group');
      bank.setAttribute('aria-label',title);
      bank.append(node('h3',title,'command-group-title'),grid);
      target.append(bank);
      groups.set(group,grid);
    }
    const b=node('button',undefined,'command-button');b.type='button';
    if(group==='extra')b.classList.add('is-extra');
    b.dataset.commandId=String(c.id_comando);
    const label=formatMovement(c.nombre);
    const icon=node('span',movementIcon(c.nombre),'cmd-icon');icon.setAttribute('aria-hidden','true');
    const status=node('small',undefined,'cmd-status');status.hidden=true;
    const copy=node('span',undefined,'cmd-copy');copy.append(node('span',label),status);
    b.append(icon,copy);
    b.title=Number.isInteger(c.codigo)?`${label} · Código ${c.codigo}`:label;
    b.setAttribute('aria-label',label);
    b.addEventListener('click',()=>onClick(c));groups.get(group).append(b);
    if(focusedId===b.dataset.commandId)b.focus({preventScroll:true});
  }
}
export function lockCommands(locked){
  for(const b of document.querySelectorAll('[data-command-id]'))b.disabled=locked;
}
export function markCommandState(last,phase,pending){
  const labels={sending:'Enviando…',accepted:'Aceptado',received:'Evento recibido',error:'Sin confirmar'};
  for(const button of document.querySelectorAll('[data-command-id]')){
    const current=String(last?.id_comando)===button.dataset.commandId;
    const queued=String(pending?.id_comando)===button.dataset.commandId;
    const value=queued?'queued':current?phase:'idle';
    button.dataset.operationPhase=value;
    button.setAttribute('aria-busy',String(value==='sending'));
    button.classList.toggle('is-busy',value==='sending'||queued);
    const status=button.querySelector('.cmd-status');
    status.textContent=queued?'Pendiente':labels[value]||'';
    status.hidden=!status.textContent;
  }
}
export function renderDemos(demos,{verified=true}={}){
  const s=$('#demoSelect');s.replaceChildren();
  const def=node('option',demos.length?'Elige una secuencia':verified?'Sin secuencias disponibles':'No se pudieron verificar las secuencias');
  def.value='';s.append(def);
  for(const d of demos){
    const opt=node('option',formatName(d.nombre,'Secuencia sin nombre'));
    opt.value=String(d.id_demo);s.append(opt);
  }
}
export function renderDemoSteps(steps=[]){
  const target=$('#demoSteps');target.replaceChildren();demoOrder=null;
  $('#demoCount').textContent=steps.length?`${steps.length} ${steps.length===1?'paso':'pasos'}`:'Sin pasos';
  const ms=steps.reduce((sum,x)=>sum+Math.max(0,Number(x.duracion_ms)||0)+Math.max(0,Number(x.pausa_ms)||0),0);
  $('#demoDuration').textContent=steps.length?`${formatDuration(ms)} aprox.`:'Duración pendiente';
  const progress=$('#demoProgress');
  progress.hidden=!steps.length;
  progress.setAttribute('aria-valuemax',String(Math.max(1,steps.length)));
  updateDemoProgress(0);
  if(!steps.length){target.append(node('p','Elige una secuencia para consultar sus pasos.','empty-state'));return;}
  for(const step of [...steps].sort((a,b)=>a.orden-b.orden)){
    const line=node('div',undefined,'demo-step');line.dataset.step=String(step.orden);
    const left=node('span');
    left.append(node('b',String(step.orden).padStart(2,'0')),document.createTextNode(formatMovement(step.comando,'Movimiento')));
    const right=node('small',`${formatDuration(step.duracion_ms)} / +${formatDuration(step.pausa_ms)}`);
    right.title='Duración del paso / pausa siguiente';line.append(left,right);target.append(line);
  }
}
export function markDemoStep(n){
  if(demoOrder===n)return;
  demoOrder=n;
  const rows=[...document.querySelectorAll('.demo-step')];
  updateDemoProgress(rows.findIndex(row=>Number(row.dataset.step)===n)+1);
  for(const row of rows){
    const current=Number(row.dataset.step)===Number(n);row.classList.toggle('is-current',current);
    if(current){
      row.setAttribute('aria-current','step');
      const panel=$('#demoSteps');
      if(!$('#demoPanel').hidden&&row.offsetTop>=0){
        const overflow=row.getBoundingClientRect().bottom-panel.getBoundingClientRect().bottom;
        if(overflow>0)panel.scrollTop+=overflow;
      }
    }else row.removeAttribute('aria-current');
  }
}
function updateDemoProgress(value){
  const progress=$('#demoProgress');
  progress.setAttribute('aria-valuenow',String(value));
  progress.style.setProperty('--progress',String(value/Number(progress.getAttribute('aria-valuemax'))));
}
export function setDemoState(state){
  const badge=$('#demoState');
  if(badge.textContent!==state)badge.textContent=state;
}
export function setDemoButtons({canStart=false,canCancel=false,selectionDisabled=false}={}){
  $('#startDemoButton').disabled=!canStart;
  $('#cancelDemoButton').disabled=!canCancel;
  $('#demoSelect').disabled=selectionDisabled;
}
export function displayMovement(label){$('#movementDisplay').textContent=formatMessage(label,'Neutral');}
export function displayDirection(label,{unsupported=false,preview=false}={}){
  const direction=$('#directionStatus');
  const availability=$('#directionAvailability');
  const directionLabel=preview&&!unsupported&&label!=='Neutral'?`${label} · Sin envío`:label;
  if(direction.textContent!==directionLabel)direction.textContent=directionLabel;
  availability.hidden=!unsupported;
  $('.control-panel').dataset.preview=String(preview);
}
export function displayVehicle(name){
  const title=formatName(name,'Vehículo sin verificar');
  $('#unitName').textContent=title;$('#unitName').title=title;
}
export function showAuth(){const d=$('#authDialog');if(!d.open)d.show();$('#keyInput').focus();}

const historyLabels={
  idle:'Esperando consulta',
  loading:'Consultando historial…',
  ready:'Más recientes primero · Hora local',
  empty:'Sin movimientos registrados',
  error:'No fue posible consultar el historial',
  stale:'Historial sin actualizar · Última lectura disponible',
};
const stateLabels={
  idle:'Esperando consulta',
  loading:'Consultando estado…',
  empty:'Sin movimientos registrados',
  error:'Estado sin verificar',
  stale:'Estado sin actualizar',
};
function rowsPerPage(){
  const size=Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--history-page-size'),10);
  return Number.isInteger(size)&&size>0?Math.min(size,10):3;
}
function paintHistory(){
  const size=rowsPerPage(),pages=Math.max(1,Math.ceil(historyRows.length/size));
  historyPage=Math.max(0,Math.min(historyPage,pages-1));
  const start=historyPage*size,tbody=$('#historyRows');
  tbody.replaceChildren();
  for(const [i,row] of historyRows.slice(start,start+size).entries()){
    const tr=node('tr');
    tr.dataset.historyId=String(row.id_historial);
    const dates=formatTimestamp(row.fecha_hora);
    const movement=formatMovement(row.comando,'Movimiento sin nombre');
    const title=node('td',movement);
    if(Number.isInteger(row.codigo))title.title=`${movement} · Código ${row.codigo}`;
    tr.append(node('td',String(start+i+1)),title,node('td',dates.date),node('td',dates.time));tbody.append(tr);
  }
  $('#historyTableWrap').hidden=historyRows.length===0;
  $('#historyPagination').hidden=pages<2;
  $('#historyPrevious').disabled=historyPage===0;
  $('#historyNext').disabled=historyPage===pages-1;
  $('#historyPage').textContent=`Página ${historyPage+1} de ${pages}`;
}
export function renderMonitor({state,history,stateStatus='idle',historyStatus='idle',phase}={}){
  const local=formatTimestamp(state?.timestamp);
  const source=state?.source==='WSS'?'Evento recibido en tiempo real':state?.source==='REST'?'Lectura del servidor':'';
  const event=formatEvent(state?.phase??phase??state?.eventType);
  $('#monitorVehicle').textContent=formatName(state?.vehicleName,$('#unitName').textContent||'Vehículo');
  $('#monitorMovement').textContent=state?.commandName
    ?formatMovement(state.commandName):stateLabels[stateStatus]||'Sin movimiento reportado';
  $('#monitorIcon').textContent=movementIcon(state?.commandName);
  const details=[stateLabels[stateStatus],source,event].filter(Boolean).join(' · ');
  $('#monitorSource').textContent=details||'Último estado reportado';
  $('#monitorSource').title=typeof state?.connected==='boolean'
    ?`Conectividad informada por la API: ${state.connected?'conectado':'desconectado'}`:'';
  $('#monitorDate').textContent=local.date;
  $('#monitorTime').textContent=local.time;
  $('#monitorCode').textContent=Number.isInteger(state?.code)?String(state.code):'—';
  historyRows=Array.isArray(history)?history.slice(0,10):[];
  $('#historyCount').textContent=`${historyRows.length} de 10`;
  $('#historyStatus').textContent=historyLabels[historyStatus]??historyLabels.idle;
  paintHistory();
}
