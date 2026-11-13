import {VEHICLE_ID} from './config.js';
import {positiveId,record,timestamp,validEvent} from './protocol.js';

const LIMIT=10;
const HISTORY_SETTLE_MS=120;
const FINAL_DEMO=new Set(['demo_fin','demo_cancelada','demo_error']);
const PHASES={movimiento_individual:'Movimiento individual confirmado',detencion_logica:'Detención lógica recibida',
  demo_inicio:'Demo en curso',demo_movimiento:'Paso de la demo confirmado',demo_fin:'Demo finalizada',
  demo_cancelada:'Demo cancelada',demo_error:'La demo no pudo terminar'};
const finiteCode=value=>Number.isSafeInteger(value)?value:null;
const name=value=>typeof value==='string'&&value.trim()?value:null;
const newerRow=(a,b)=>((b.fecha_hora||'').localeCompare(a.fecha_hora||'')||b.id_historial-a.id_historial);

export function normalizeHistory(value,vehicleId=VEHICLE_ID){
  if(!Array.isArray(value))throw new TypeError('El historial no es una lista.');
  const byId=new Map();
  for(const row of value){
    if(!record(row)||row.id_vehiculo!==vehicleId||!positiveId(row.id_historial))continue;
    const clean={id_historial:row.id_historial,id_vehiculo:vehicleId,comando:name(row.comando),codigo:finiteCode(row.codigo),
      fecha_hora:timestamp(row.fecha_hora,{mysqlUtc:true})};
    const previous=byId.get(clean.id_historial);
    if(!previous||newerRow(clean,previous)<0)byId.set(clean.id_historial,clean);
  }
  return [...byId.values()].sort(newerRow).slice(0,LIMIT);
}

function restState(row,vehicleId){
  if(row===null)return null;
  if(!record(row)||row.id_vehiculo!==vehicleId||typeof row.conectado!=='boolean')throw new TypeError('El estado no corresponde al vehículo.');
  return {vehicleId,vehicleName:name(row.vehiculo),commandId:positiveId(row.id_comando)?row.id_comando:null,
    commandName:name(row.comando),code:finiteCode(row.codigo),timestamp:timestamp(row.fecha_actualizacion,{mysqlUtc:true}),
    connected:row.conectado,source:'REST',eventType:null};
}

export class MonitorSession {
  constructor(api,render,{vehicleId=VEHICLE_ID,historySettleMs=HISTORY_SETTLE_MS}={}){
    this.api=api;this.render=render;this.vehicleId=vehicleId;this.historySettleMs=historySettleMs;
    this.model={state:null,history:[],stateStatus:'idle',historyStatus:'idle',phase:null,connection:'Conectando'};
    this.active=false;this.vehicleName=null;this.everConnected=false;this.stateRevision=0;
    this.requests={state:null,history:null};this.historyTimer=null;this.historyDirty=false;
    this.demo=null;this.finalized=new Set();this.lastPhaseTimestamp=null;this.lastDemoLifecycleAt=null;this.lastConfirmedId=0;
  }
  #emit(){if(this.active)this.render(this.model);}
  #set(values){this.model={...this.model,...values};this.#emit();}
  #abort(key){const previous=this.requests[key];this.requests[key]=null;previous?.abort();}
  #stopTimer(){clearTimeout(this.historyTimer);this.historyTimer=null;}
  #statusFor(key){return key==='state'?'stateStatus':'historyStatus';}
  #hasData(key){return key==='state'?Boolean(this.model.state):this.model.history.length>0;}
  #errorFor(key){return this.#hasData(key)?'stale':'error';}
  #loaded(){return this.model.stateStatus!=='idle'||this.model.historyStatus!=='idle';}
  #setState(state){
    const current=this.model.state;
    // Una respuesta antigua, incluso de reconexión, no desplaza un evento más nuevo.
    if(current?.timestamp&&(!state?.timestamp||current.timestamp>state.timestamp))return false;
    if(current?.timestamp&&current.timestamp===state?.timestamp&&current.source==='WSS'&&state.source==='REST'){
      if(current.commandId!==state.commandId)return false;
      state={...current,vehicleName:state.vehicleName||current.vehicleName};
    }
    if(state&&!state.vehicleName)state={...state,vehicleName:this.vehicleName||current?.vehicleName||null};
    this.#set({state,stateStatus:state?'ready':'empty'});
    return true;
  }
  setVehicleName(value){
    this.vehicleName=name(value);
    if(this.vehicleName&&this.model.state?.vehicleName!==this.vehicleName&&this.model.state)
      this.#set({state:{...this.model.state,vehicleName:this.vehicleName}});
  }
  enter(){this.active=true;this.#emit();return this.refresh();}
  leave(){this.active=false;}
  close(){
    this.active=false;this.#stopTimer();this.historyDirty=false;this.#abort('state');this.#abort('history');
  }
  async #read(key){
    this.#abort(key);
    const controller=new AbortController(),revision=this.stateRevision,status=this.#statusFor(key);
    this.requests[key]=controller;
    if(key==='history')this.historyDirty=false;
    this.#set({[status]:this.#hasData(key)?'stale':'loading'});
    try{
      const data=await this.api[key](controller.signal);
      if(this.requests[key]!==controller)return;
      if(key==='history'){
        const history=normalizeHistory(data,this.vehicleId);
        this.#set({history,historyStatus:this.historyDirty?(history.length?'stale':'loading'):history.length?'ready':'empty'});
      }else if(revision===this.stateRevision){
        const state=restState(data,this.vehicleId);
        if(!this.#setState(state))this.#set({stateStatus:this.#hasData('state')?'ready':'empty'});
      }else if(this.model.stateStatus==='loading'||this.model.stateStatus==='stale'){
        this.#set({stateStatus:this.#hasData('state')?'ready':'empty'});
      }
    }catch{
      if(this.requests[key]===controller&&(key==='history'||revision===this.stateRevision))
        this.#set({[status]:this.#errorFor(key)});
    }finally{
      if(this.requests[key]===controller){
        this.requests[key]=null;
        if(key==='history'&&this.historyDirty)this.#scheduleHistory();
      }
    }
  }
  refresh(){this.#stopTimer();return Promise.all([this.#read('state'),this.#read('history')]);}
  connection(status){
    const previous=this.model.connection;
    this.#set({connection:status});
    if(status==='En línea'){
      const recovering=this.everConnected&&previous!=='En línea';
      this.everConnected=true;
      if(recovering&&(this.active||this.#loaded()))void this.refresh();
    }else if(status==='Desconectado'&&previous==='En línea'){
      this.#set({stateStatus:this.#hasData('state')?'stale':this.model.stateStatus,
        historyStatus:this.#hasData('history')?'stale':this.model.historyStatus});
    }
  }
  #queueHistory(){
    // Sin ID de historial en WSS, dos eventos idénticos pueden corresponder a
    // filas distintas del mismo segundo. Agrupar y volver a leer después del GET en vuelo.
    this.historyDirty=true;
    this.#set({historyStatus:this.#hasData('history')?'stale':'loading'});
    this.#scheduleHistory();
  }
  #scheduleHistory(){
    if(this.historyTimer===null&&!this.requests.history)this.historyTimer=setTimeout(()=>{
      this.historyTimer=null;void this.#read('history');
    },this.historySettleMs);
  }
  confirmIndividual(result){
    // MovimientoConfirmado viene tras el commit. No injertar su fila en la tabla:
    // otro cliente pudo escribir y el orden/límite se reconcilia con GET.
    if(result?.id_vehiculo!==this.vehicleId||result.historial?.id_vehiculo!==this.vehicleId||
       !positiveId(result.historial?.id_historial))return;
    if(this.active||this.#loaded())this.#queueHistory();
    if(result.historial.id_historial<=this.lastConfirmedId)return;
    this.lastConfirmedId=result.historial.id_historial;
    try{
      const state=restState(result.estado,this.vehicleId);
      if(state&&state.commandId===result.id_comando&&this.#setState(state))this.stateRevision++;
    }catch{/* El historial se reconcilia sin interpretar un cuerpo de estado inválido. */}
  }
  #acceptDemo(event,at){
    const id=event.id_ejecucion;
    if(this.finalized.has(id))return false;
    const existing=this.demo?.id===id?this.demo:null;
    // Inicio/fin se fechan al emitir; un paso puede llevar el segundo de MySQL.
    if(!existing&&event.tipo!=='demo_movimiento'&&this.lastDemoLifecycleAt&&at<this.lastDemoLifecycleAt)return false;
    if(this.demo&&this.demo.id!==id){
      // Un inicio más nuevo sustituye una sesión de la que no se observó el fin.
      if(event.tipo!=='demo_inicio')return false;
      this.#finishDemo(this.demo.id);
    }
    if(event.tipo==='demo_inicio'&&existing)return false;
    if(event.tipo==='demo_movimiento'&&existing&&event.orden<=existing.order)return false;
    if(FINAL_DEMO.has(event.tipo)&&existing?.startedAt&&at<existing.startedAt)return false;
    if(event.tipo!=='demo_movimiento')this.lastDemoLifecycleAt=at;
    if(FINAL_DEMO.has(event.tipo)){this.#finishDemo(id);return true;}
    this.demo={id,startedAt:existing?.startedAt??(event.tipo==='demo_inicio'?at:null),
      order:event.tipo==='demo_movimiento'?event.orden:0};
    return true;
  }
  #finishDemo(id){
    if(id){this.finalized.add(id);if(this.finalized.size>64)this.finalized.delete(this.finalized.values().next().value);}
    if(this.demo?.id===id)this.demo=null;
  }
  event(event){
    if(!validEvent(event,this.vehicleId))return false;
    const type=event.tipo,at=timestamp(event.fecha_hora);
    if(type==='movimiento_individual'&&(this.active||this.#loaded()))this.#queueHistory();
    if(type.startsWith('demo_')&&!this.#acceptDemo(event,at))return false;
    if(type==='detencion_logica'&&event.id_ejecucion)this.#finishDemo(event.id_ejecucion);
    if(PHASES[type]&&(type==='demo_movimiento'||type==='detencion_logica'||!this.lastPhaseTimestamp||at>=this.lastPhaseTimestamp)){
      if(!this.lastPhaseTimestamp||at>this.lastPhaseTimestamp)this.lastPhaseTimestamp=at;
      this.#set({phase:PHASES[type]});
    }
    // Los desenlaces/inicios llevan hora del evento, no del último movimiento.
    if(!['estado_inicial','movimiento_individual','demo_movimiento'].includes(type))return true;
    if(type==='estado_inicial'&&event.conectado==null&&event.id_comando==null&&event.comando==null&&event.codigo==null){
      if(!this.model.state){this.stateRevision++;this.#set({stateStatus:'empty'});}
      return true;
    }
    const hasMovement=event.id_comando!=null||name(event.comando)!==null||event.codigo!=null;
    if(type==='estado_inicial'&&!hasMovement){
      const current=this.model.state;
      if(current){
        if(current.connected!==event.conectado)this.#set({state:{...current,connected:event.conectado}});
        return true;
      }
      return this.#setState({vehicleId:this.vehicleId,vehicleName:this.vehicleName,commandId:null,commandName:null,
        code:null,timestamp:null,connected:event.conectado,source:'WSS',eventType:type});
    }
    if(this.model.state?.timestamp&&at<this.model.state.timestamp)return false;
    const state={vehicleId:this.vehicleId,vehicleName:this.vehicleName,commandId:event.id_comando??null,commandName:name(event.comando),
      code:finiteCode(event.codigo),timestamp:at,connected:event.conectado??null,source:'WSS',eventType:type};
    this.stateRevision++;
    this.#setState(state);
    return true;
  }
}
