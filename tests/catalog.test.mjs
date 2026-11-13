import test from 'node:test';
import assert from 'node:assert/strict';
import {directionForVector,validCommands,commandByName,computeDemoDuration,safeEventPayload} from '../js/catalog.js';
import {PATHS,VEHICLE_ID} from '../js/config.js';

test('mapeo direccional con neutral',()=>{
 assert.equal(directionForVector(1,1,20),null);
 assert.equal(directionForVector(100,3,20),'right');
 assert.equal(directionForVector(-80,3,20),'left');
 assert.equal(directionForVector(4,-80,20),'up');
 assert.equal(directionForVector(5,90,20),'down');
});
test('catalogo filtra inactivos y otros vehiculos',()=>{
 const a=[{nombre:'AVANZAR',id_vehiculo:1,id_comando:2,codigo:2,activo:true},{nombre:'DEMO',id_vehiculo:2,id_comando:6,codigo:6,activo:true},{nombre:'NADA',id_vehiculo:1,id_comando:4,codigo:4,activo:false}];
 const c=validCommands(a,1);assert.equal(c.length,1);assert.equal(commandByName(c,'AVANZAR').id_comando,2);
});
test('demo calcula duraciones y pausas desde RDS',()=>{
 assert.equal(computeDemoDuration([{duracion_ms:2000,pausa_ms:400},{duracion_ms:1000,pausa_ms:0}]),3400);
});
test('wss ignora otros vehiculos y tramas invalidas',()=>{
 const event={tipo:'movimiento_individual',id_vehiculo:1,id_comando:2,fecha_hora:'2026-11-13T14:00:00Z'};
 assert.equal(safeEventPayload(JSON.stringify({...event,id_vehiculo:2}),1),null);
 assert.equal(safeEventPayload('NOT_JSON',1),null);
 assert.equal(safeEventPayload(JSON.stringify({...event,id_comando:null}),1),null);
 assert.equal(safeEventPayload(JSON.stringify(event),1).tipo,'movimiento_individual');
});
test('rutas verificadas corresponden al backend',()=>{
 assert.equal(PATHS.movement(VEHICLE_ID),'/vehiculos/1/movimientos');
 assert.equal(PATHS.stop(VEHICLE_ID),'/vehiculos/1/detener');
 assert.equal(PATHS.startDemo(VEHICLE_ID,1),'/vehiculos/1/demos/1/iniciar');
 assert.equal(PATHS.cancelDemo(VEHICLE_ID,1),'/vehiculos/1/demos/1/cancelar');
});

test('alias del catálogo conserva nombre e identificador real, distinto del código',()=>{
 const catalog=[{nombre:'GI',id_vehiculo:1,id_comando:81,codigo:1,activo:true},{nombre:'VELOCIDAD',id_vehiculo:1,id_comando:92,codigo:3,activo:true}];
 const commands=validCommands(catalog,1);
 assert.equal(commandByName(commands,'GIRAR_IZQUIERDA'),catalog[0]);
 assert.equal(commandByName(commands,'GIRAR_IZQUIERDA').id_comando,81);
 assert.equal(commandByName(commands,'CAMBIAR_VELOCIDAD'),catalog[1]);
 assert.equal(commandByName(commands,'AVANZAR'),null);
});

test('nombre exacto tiene prioridad sobre un alias y vectores inválidos son neutral',()=>{
 const exact={nombre:'GIRAR_IZQUIERDA',id_comando:94};
 assert.equal(commandByName([{nombre:'GI',id_comando:81},exact],'GIRAR_IZQUIERDA'),exact);
 assert.equal(directionForVector(NaN,0,20),null);
 assert.equal(directionForVector(Infinity,0,20),null);
});
