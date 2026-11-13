import {API_BASE, REQUEST_TIMEOUT_MS, ORIGIN_TAG, VEHICLE_ID, PATHS} from './config.js';
import {timestamp} from './protocol.js';

export class ApiError extends Error {
  constructor(message, status=0, code='network'){super(message);this.name='ApiError';this.status=status;this.code=code;}
}
const HTTP_MESSAGES = Object.freeze({
  401:'El acceso ya no es válido. Comprueba la conexión y el acceso antes de intentarlo de nuevo.',
  403:'El acceso no permite esta acción o la evaluación está cerrada.',
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
  #evaluationStatus='idle';
  #change;
  constructor(onAccessChange=()=>{}){this.#change=onAccessChange;}
  get hasKey(){return this.#key.length>0;}
  get hasEvaluation(){return this.evaluationRemaining>0;}
  get evaluationRemaining(){return this.#session?Math.max(0,this.#session.expires-Date.now()):0;}
  get hasAccess(){return this.hasKey||this.hasEvaluation;}
  get evaluationStatus(){return this.hasEvaluation?'active':this.#evaluationStatus==='active'?'closed':this.#evaluationStatus;}
  setKey(value){this.#key=String(value||'').trim();this.#change();}
  clearKey(){this.#key='';this.#change();}
  clearEvaluation(){
    this.#sessionRevision++;
    this.#sessionRequest=null;this.#session=null;this.#evaluationStatus='idle';this.#change();
  }
  evaluation({force=false}={}){
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
          this.#session={token:data.token,expires};this.#evaluationStatus='active';
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
  async request(path,{method='GET',body=null,authorized=false,signal=null,expectedStatus=null}={}){
    const session=authorized&&!this.hasKey&&this.hasEvaluation?this.#session:null;
    if(authorized&&!this.hasKey&&!session)throw new ApiError('Control no disponible. Comprueba si la evaluación está habilitada.',0,'auth_missing');
    const headers={Accept:'application/json'};
    if(body!==null)headers['Content-Type']='application/json';
    if(session)headers.Authorization=`Bearer ${session.token}`;
    else if(authorized)headers['X-API-Key']=this.#key;
    const controller=new AbortController();
    const propagate=()=>controller.abort(signal?.reason||'cancelled');
    if(signal?.aborted)propagate(); else signal?.addEventListener('abort',propagate,{once:true});
    const timeout=setTimeout(()=>controller.abort('timeout'),REQUEST_TIMEOUT_MS);
    try {
      const response=await fetch(API_BASE+path,{method,headers,body:body===null?undefined:JSON.stringify(body),
        signal:controller.signal,cache:'no-store',redirect:'error',credentials:'omit'});
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
  vehicle(){return this.request(PATHS.vehicle(VEHICLE_ID));}
  commands(){return this.request(PATHS.commands(VEHICLE_ID));}
  state(signal){return this.request(PATHS.state(VEHICLE_ID),{signal,expectedStatus:200});}
  history(signal){return this.request(PATHS.history(VEHICLE_ID),{signal,expectedStatus:200});}
  demos(){return this.request(PATHS.demos(VEHICLE_ID));}
  demoSteps(id){return this.request(PATHS.demoSteps(VEHICLE_ID,id));}
  move(id,signal){return this.request(PATHS.movement(VEHICLE_ID),{method:'POST',authorized:true,body:{id_comando:id,origen:ORIGIN_TAG},signal});}
  startDemo(id){return this.request(PATHS.startDemo(VEHICLE_ID,id),{method:'POST',authorized:true,expectedStatus:202});}
  cancelDemo(id){return this.request(PATHS.cancelDemo(VEHICLE_ID,id),{method:'POST',authorized:true});}
  stop(){return this.request(PATHS.stop(VEHICLE_ID),{method:'POST',authorized:true});}
}
