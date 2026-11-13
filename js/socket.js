import {WS_URL, VEHICLE_ID, REQUEST_TIMEOUT_MS} from './config.js';
import {safeEventPayload} from './catalog.js';
export class VehicleSocket {
  #socket=null;#timer=null;#handshakeTimer=null;#attempt=0;#closed=true;
  constructor(onStatus,onEvent){this.onStatus=onStatus;this.onEvent=onEvent;}
  start(){
    if(!this.#closed)return;
    this.#closed=false;this.#attempt=0;this.#connect();
  }
  #schedule(){
    if(this.#closed||this.#timer!==null)return;
    this.#attempt++;
    const jitter=Math.floor(Math.random()*350);
    const delay=Math.min(18000,1000*Math.pow(1.6,this.#attempt))+jitter;
    this.#timer=setTimeout(()=>{this.#timer=null;this.#connect();},delay);
  }
  #clearHandshake(){
    clearTimeout(this.#handshakeTimer);this.#handshakeTimer=null;
  }
  #disconnect(socket){
    if(this.#socket!==socket)return;
    this.#clearHandshake();
    this.#socket=null;
    this.onStatus('Desconectado');
    this.#schedule();
  }
  #connect(){
    if(this.#closed)return;
    this.onStatus(this.#attempt===0?'Conectando':'Reconectando');
    let socket;
    try{socket=new WebSocket(WS_URL);}
    catch{this.onStatus('Desconectado');this.#schedule();return;}
    this.#socket=socket;
    this.#handshakeTimer=setTimeout(()=>{
      if(this.#socket!==socket)return;
      this.#disconnect(socket);
      socket.close();
    },REQUEST_TIMEOUT_MS);
    socket.addEventListener('open',()=>{
      if(this.#closed||this.#socket!==socket)return;
      this.#clearHandshake();this.#attempt=0;this.onStatus('En línea');
    });
    socket.addEventListener('message',evt=>{
      if(this.#closed||this.#socket!==socket)return;
      const payload=safeEventPayload(evt.data,VEHICLE_ID);
      if(payload)this.onEvent(payload);
    });
    socket.addEventListener('error',()=>{if(this.#socket===socket)this.onStatus('Desconectado');});
    socket.addEventListener('close',()=>this.#disconnect(socket));
  }
  close(){
    this.#closed=true;clearTimeout(this.#timer);this.#timer=null;this.#clearHandshake();
    const socket=this.#socket;this.#socket=null;
    socket?.close();this.onStatus('Desconectado');
  }
}
