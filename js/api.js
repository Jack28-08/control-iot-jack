import {API_BASE, REQUEST_TIMEOUT_MS, ORIGIN_TAG, VEHICLE_ID, PATHS} from './config.js?v=4';
import {timestamp} from './protocol.js';

export class ApiError extends Error {
  constructor(message, status=0, code='network'){super(message);this.name='ApiError';this.status=status;this.code=code;}
}
const HTTP_MESSAGES = Object.freeze({
  401:'El acceso ya no es válido. Comprueba la conexión y el acceso antes de intentarlo de nuevo.',
  403:'El acceso no permite esta acción.',
  404:'El vehículo o recurso solicitado no existe.',
  409:'El vehículo está ocupado o la operación entra en conflicto con su estado.',
  422:'La API rechazó los datos de la solicitud.',
  429:'La API recibió demasiadas solicitudes. Espera antes de repetir.',
  500:'La API informó un error interno.',
  503:'El servicio solicitado no está disponible.',
});
export class ApiClient {
  #key='';
  #session=null;
  #sessionRequest=null;
  #sessionRevision=0;
  #vehicleId=VEHICLE_ID;
  #unitId=null;
  #physical=false;
  #platform=false;
  #platformSession=null;
  #evaluationStatus='idle';
  #change;
  constructor(onAccessChange=()=>{}){this.#change=onAccessChange;}
  get vehicleId(){return this.#vehicleId;}
  get physicalUnit(){return this.#physical;}
  get platformEnabled(){return this.#platform;}
  get signedIn(){return Boolean(this.#platformSession && Date.now()<this.#platformSession.expires);}
  setPlatformEnabled(enabled){
    this.#platform=enabled;
    if(enabled){this.#key='';this.clearEvaluation();}
  }
  setVehicleId(id,unitId=null,physical=false){
    if(id!==null&&(!Number.isSafeInteger(id)||id<1))throw new TypeError('Unidad inválida.');
    if(unitId!==null&&(!Number.isSafeInteger(unitId)||unitId<1))throw new TypeError('Unidad comercial inválida.');
    this.#vehicleId=id;
    this.#unitId=unitId;
    this.#physical=physical===true;
  }
  setPlatformSession(token,expires,canDrive=false){
    this.#platformSession=token?{token,expires,canDrive}:null;
    this.#change();
  }
  get hasKey(){return !this.#platform&&this.#key.length>0;}
  get hasEvaluation(){return this.evaluationRemaining>0;}
  get hasDirect(){return this.hasEvaluation&&this.#session.direct;}
  get canSustain(){return this.#platform?this.hasAccess:this.hasKey||this.hasDirect;}
  get evaluationRemaining(){return this.#session?Math.max(0,this.#session.expires-Date.now()):0;}
  get hasAccess(){return this.#platform?this.signedIn&&this.#platformSession.canDrive:this.hasKey||this.hasEvaluation;}
  get evaluationStatus(){return this.hasEvaluation?'active':this.#evaluationStatus==='active'?'closed':this.#evaluationStatus;}
  setKey(value){this.#key=String(value||'').trim();this.#change();}
  clearKey(){this.#key='';this.#change();}
  clearEvaluation(){
    this.#sessionRevision++;
    this.#sessionRequest=null;this.#session=null;this.#evaluationStatus='idle';this.#change();
  }
  evaluation({force=false}={}){
    if(this.#platform)return Promise.resolve(false);
    if(this.#sessionRequest)return this.#sessionRequest;
    if(!force&&this.hasEvaluation)return Promise.resolve(true);
    const revision=++this.#sessionRevision;
    this.#evaluationStatus='checking';this.#change();
    const load=async()=>{
      try{
        const data=await this.request(PATHS.evaluation(VEHICLE_ID),{expectedStatus:200});
        const expires=Date.parse(timestamp(data?.expires_at)??'');
        if(typeof data?.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.token)||!Number.isFinite(expires)||expires<=Date.now())
          throw new ApiError('La sesión temporal no está disponible.',0,'invalid_session');
        if(revision===this.#sessionRevision){
          this.#session={token:data.token,expires,direct:data.modo==='directo'};this.#evaluationStatus='active';
        }
      }catch(error){
        if(revision===this.#sessionRevision){
          if([401,403,404].includes(error.status)||!this.hasEvaluation)this.#session=null;
          this.#evaluationStatus=[401,403,404].includes(error.status)?'closed':'error';
        }
      }finally{
        if(revision===this.#sessionRevision){this.#sessionRequest=null;this.#change();}
      }
      return revision===this.#sessionRevision&&this.hasEvaluation;
    };
    this.#sessionRequest=load();
    return this.#sessionRequest;
  }
  async request(path,{method='GET',body=null,authorized=false,signal=null,expectedStatus=null,
    timeoutMs=REQUEST_TIMEOUT_MS,keepalive=false,barrier=null}={}){
    const platformAuth=this.#platform&&(authorized||path.startsWith('/vehiculos/'));
    const platformSession=this.signedIn?this.#platformSession:null;
    const session=authorized&&!this.#platform&&!this.hasKey&&this.hasEvaluation?this.#session:null;
    if((platformAuth&&!platformSession)||(!this.#platform&&authorized&&!this.hasKey&&!session))
      throw new ApiError('Control no disponible. Comprueba el acceso y la conexión.',0,'auth_missing');
    const headers={Accept:'application/json'};
    if(body!==null)headers['Content-Type']='application/json';
    if(barrier)headers['X-IoT-Barrier']=barrier;
    if(platformAuth)headers.Authorization=`Bearer ${platformSession.token}`;
    else if(session)headers.Authorization=`Bearer ${session.token}`;
    else if(authorized)headers['X-API-Key']=this.#key;
    const controller=new AbortController();
    const propagate=()=>controller.abort(signal?.reason||'cancelled');
    if(signal?.aborted)propagate(); else signal?.addEventListener('abort',propagate,{once:true});
    const timeout=setTimeout(()=>controller.abort('timeout'),timeoutMs);
    try {
      const response=await fetch(API_BASE+path,{method,headers,body:body===null?undefined:JSON.stringify(body),
        signal:controller.signal,cache:'no-store',redirect:'error',credentials:'omit',keepalive});
      if(platformAuth&&this.#platformSession===platformSession&&response.status===401)this.setPlatformSession(null,0);
      if(session&&this.#session===session&&[401,403].includes(response.status)){
        this.#sessionRevision++;this.#sessionRequest=null;
        this.#session=null;this.#evaluationStatus='closed';this.#change();
      }
      const txt=await response.text();
      let data=null;
      if(txt){try{data=JSON.parse(txt);}catch{throw new ApiError('El servidor respondió con JSON inválido.',response.status,'invalid_json');}}
      if(!response.ok){
        // Nunca reflejar texto arbitrario del servidor: podría contener información sensible.
        const message=HTTP_MESSAGES[response.status]||'La API rechazó la solicitud.';
        const error=new ApiError(`${message} (HTTP ${response.status})`,response.status,'http');
        if(path==='/health/db'&&data?.status==='unavailable')error.responseStatus='unavailable';
        throw error;
      }
      if(expectedStatus!==null&&response.status!==expectedStatus)throw new ApiError(`Respuesta HTTP ${response.status}; se esperaba HTTP ${expectedStatus}. Confirma el estado antes de repetir.`,response.status,'unexpected_status');
      return data;
    }catch(error){
      if(error instanceof ApiError)throw error;
      if(controller.signal.aborted)throw new ApiError('La solicitud fue cancelada o agotó el tiempo. Confirma el estado antes de repetir.',0,'aborted');
      throw new ApiError('Error de red o CORS. Comprueba HTTPS, conexión y permisos de origen en AWS.',0,'network');
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',propagate);}
  }
  health(signal){return this.request('/health',{signal,expectedStatus:200});}
  rdsHealth(signal){return this.request('/health/db',{signal,expectedStatus:200});}
  vehicle(){return this.request(PATHS.vehicle(this.vehicleId));}
  commands(){return this.request(PATHS.commands(this.vehicleId));}
  state(signal){return this.request(PATHS.state(this.vehicleId),{signal,expectedStatus:200});}
  history(signal){return this.request(PATHS.history(this.vehicleId),{signal,expectedStatus:200});}
  demos(){return this.request(PATHS.demos(this.vehicleId));}
  commercialDemos(){
    if(!this.#platform||!this.#unitId)return Promise.resolve([]);
    return this.request(`/plataforma/demos?id_unidad=${this.#unitId}`,{authorized:true});
  }
  demoSteps(id){return this.request(PATHS.demoSteps(this.vehicleId,id));}
  move(id,signal,barrier){return this.request(PATHS.movement(this.vehicleId),{
    method:'POST',authorized:true,
    body:{id_comando:id,origen:ORIGIN_TAG,...(barrier?{id_solicitud:crypto.randomUUID()}:{})},signal,barrier,
  });}
  startDemo(id,signal,barrier,commercial=false){
    if(commercial&&!this.#unitId)return Promise.reject(new ApiError('Selecciona una unidad autorizada.',0,'auth_missing'));
    const path=commercial?`/plataforma/demos/${id}/ejecutar`:PATHS.startDemo(this.vehicleId,id);
    return this.request(path,{
      method:'POST',authorized:true,expectedStatus:202,signal,barrier,
      body:commercial?{id_unidad:this.#unitId}:null,
    });
  }
  cancelDemo(id){return this.request(PATHS.cancelDemo(this.vehicleId,id),{method:'POST',authorized:true});}
  stop(){return this.request(PATHS.stop(this.vehicleId),{method:'POST',authorized:true,keepalive:true});}
  sustainedCapability(){return this.request(PATHS.sustained(this.vehicleId,'capacidad'),{expectedStatus:200,timeoutMs:2500});}
  sustainedRequest(action,body,signal){
    if(!this.canSustain)return Promise.reject(new ApiError('El control sostenido requiere acceso habilitado.',0,'operator_required'));
    return this.request(PATHS.sustained(this.vehicleId,action),{method:'POST',authorized:true,body,signal,
      expectedStatus:200,timeoutMs:1250,keepalive:action==='liberar'});
  }
}
