import {WS_URL, VEHICLE_ID, REQUEST_TIMEOUT_MS} from './config.js';
import {safeEventPayload} from './catalog.js?v=6';
export class VehicleSocket {
  #socket=null;#timer=null;#handshakeTimer=null;#attempt=0;#closed=true;
  #seen=new Set();
  #scope=0;
  #vehicle=VEHICLE_ID;
  #ticket=null;
  constructor(onStatus,onEvent){this.onStatus=onStatus;this.onEvent=onEvent;}
  configure(vehicle,ticket=null){
    this.close();
    this.#vehicle=vehicle;this.#ticket=ticket;this.#seen.clear();
  }
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
    if(this.#ticket){
      const scope=this.#scope,vehicle=this.#vehicle,ticket=this.#ticket;
      Promise.resolve().then(()=>this.#closed||scope!==this.#scope?null:ticket(vehicle)).then(value=>{
        if(this.#closed||scope!==this.#scope)return;
        if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{20,128}$/.test(value))throw Error('Ticket inválido.');
        const url=new URL(WS_URL);
        url.pathname=`/ws/vehiculos/${vehicle}`;
        this.#open(url.href,vehicle,['node01',`ticket.${value}`]);
      }).catch(()=>{
        if(this.#closed||scope!==this.#scope)return;
        this.onStatus('Desconectado');this.#schedule();
      });
      return;
    }
    this.#open(WS_URL,this.#vehicle);
  }
  #open(url,vehicle,protocols){
    let socket;
    try{socket=protocols?new WebSocket(url,protocols):new WebSocket(url);}
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
      const payload=safeEventPayload(evt.data,vehicle);
      if(!payload)return;
      if(payload.id_evento){
        if(this.#seen.has(payload.id_evento))return;
        this.#seen.add(payload.id_evento);
        if(this.#seen.size>128)this.#seen.delete(this.#seen.values().next().value);
      }
      this.onEvent(payload);
    });
    socket.addEventListener('error',()=>{if(this.#socket===socket)this.onStatus('Desconectado');});
    socket.addEventListener('close',()=>this.#disconnect(socket));
  }
  close(){
    this.#scope++;this.#closed=true;clearTimeout(this.#timer);this.#timer=null;this.#clearHandshake();
    const socket=this.#socket;this.#socket=null;
    socket?.close();this.onStatus('Desconectado');
  }
}
