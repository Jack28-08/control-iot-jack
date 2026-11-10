import {API_BASE, REQUEST_TIMEOUT_MS, ORIGIN_TAG, VEHICLE_ID, PATHS} from './config.js';

export class ApiError extends Error {
  constructor(message, status=0, code='network'){super(message);this.name='ApiError';this.status=status;this.code=code;}
}
const HTTP_MESSAGES = Object.freeze({
  401:'La API rechazó el acceso. Revisa la clave de operador en Acceso.',
  403:'El acceso de operador no tiene permiso para esta acción.',
  404:'El vehículo o recurso solicitado no existe.',
  409:'El vehículo está ocupado o la operación entra en conflicto con su estado.',
  422:'La API rechazó los datos de la solicitud.',
  429:'La API recibió demasiadas solicitudes. Espera antes de repetir.',
  500:'La API informó un error interno.',
  503:'El servicio solicitado no está disponible.',
});
export class ApiClient {
  #key='';
  get hasKey(){return this.#key.length>0;}
  setKey(value){this.#key=String(value||'').trim();}
  clearKey(){this.#key='';}
  async request(path,{method='GET',body=null,authorized=false,signal=null,expectedStatus=null}={}){
    if(authorized&&!this.#key)throw new ApiError('Agrega una API key de operador en Acceso.',0,'auth_missing');
    const headers={Accept:'application/json'};
    if(body!==null)headers['Content-Type']='application/json';
    if(authorized)headers['X-API-Key']=this.#key;
    const controller=new AbortController();
    const propagate=()=>controller.abort(signal?.reason||'cancelled');
    if(signal?.aborted)propagate(); else signal?.addEventListener('abort',propagate,{once:true});
    const timeout=setTimeout(()=>controller.abort('timeout'),REQUEST_TIMEOUT_MS);
    try {
      const response=await fetch(API_BASE+path,{method,headers,body:body===null?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
      const txt=await response.text();
      let data=null;
      if(txt){try{data=JSON.parse(txt);}catch{throw new ApiError('El servidor respondió con JSON inválido.',response.status,'invalid_json');}}
      if(!response.ok){
        // Nunca reflejar texto arbitrario del servidor: podría contener información sensible.
        const message=HTTP_MESSAGES[response.status]||'La API rechazó la solicitud.';
        throw new ApiError(`${message} (HTTP ${response.status})`,response.status,'http');
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
  demos(){return this.request(PATHS.demos(VEHICLE_ID));}
  demoSteps(id){return this.request(PATHS.demoSteps(VEHICLE_ID,id));}
  move(id,signal){return this.request(PATHS.movement(VEHICLE_ID),{method:'POST',authorized:true,body:{id_comando:id,origen:ORIGIN_TAG},signal});}
  startDemo(id){return this.request(PATHS.startDemo(VEHICLE_ID,id),{method:'POST',authorized:true,expectedStatus:202});}
  cancelDemo(id){return this.request(PATHS.cancelDemo(VEHICLE_ID,id),{method:'POST',authorized:true});}
  stop(){return this.request(PATHS.stop(VEHICLE_ID),{method:'POST',authorized:true});}
}
