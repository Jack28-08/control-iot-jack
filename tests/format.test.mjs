import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,formatEvent,formatMessage,formatMovement,formatName,formatTimestamp,movementGroup,movementIcon} from '../js/format.js';

test('etiquetas naturales para movimientos, variantes y alias sin alterar el contrato',()=>{
  const cases={
    AVANZAR:'Avanzar',RETROCEDER:'Retroceder',GI:'Girar a la izquierda',
    GIRAR_IZQUIERDA:'Girar a la izquierda',GIRAR_DERECHA:'Girar a la derecha',
    SUBIR_GRUA:'Subir grúa',BAJAR_GRUA:'Bajar grúa',
    CAMBIAR_VELOCIDAD:'Cambiar velocidad',VELOCIDAD:'Cambiar velocidad',
    DEMO:'Demo del control',DETENER:'Detener',
  };
  for(const [source,label] of Object.entries(cases)){
    const original=Object.freeze({nombre:source,id_comando:17,codigo:8});
    assert.equal(formatMovement(original.nombre),label);
    assert.equal(formatMovement(original.nombre.toLowerCase()),label);
    assert.deepEqual(original,{nombre:source,id_comando:17,codigo:8});
  }
  assert.equal(formatMovement(' subir grúa '),'Subir grúa');
  assert.equal(movementGroup('GI'),'drive');
  assert.equal(movementIcon('GI'),'←');
  assert.equal(movementGroup('SUBIR_GRUA'),'extra');
  assert.equal(movementIcon('NO_REGISTRADO'),'◇');
});
test('mensajes de operación, eventos y nombres no filtran campos internos',()=>{
  assert.equal(formatMessage('GIRAR_IZQUIERDA · solicitado'),'Girar a la izquierda · solicitado');
  assert.equal(formatMessage('Evento WSS · detencion_logica'),'Evento WSS · Detención lógica');
  assert.equal(formatMessage('Evento WSS · demo_fin'),'Evento WSS · Demo finalizada');
  assert.equal(formatMessage('GI · aceptado por API'),'Girar a la izquierda · aceptado por API');
  assert.equal(formatMessage('DEMO EN CURSO'),'Demo en curso');
  assert.equal(formatName('DEMO_DE_PRUEBA'),'Demo de prueba');
  assert.equal(formatName('Vehículo_1 IoT'),'Vehículo 1 IoT');
  assert.equal(formatMovement('ORDEN_DEL_CATALOGO'),'Orden del catalogo');
  assert.equal(formatMovement(null),'Sin movimiento');
  assert.equal(formatMovement('undefined'),'Sin movimiento');
  assert.equal(formatEvent('demo_cancelada'),'Demo cancelada');
  assert.equal(formatEvent('toString'),'toString');
});
test('fecha y hora sólo con timestamps explícitos y calendarización válida',()=>{
  const local={timeZone:'America/Mexico_City'};
  assert.deepEqual(formatTimestamp('2026-11-13T17:42:25Z',local),{date:'13/11/2026',time:'11:42:25'});
  assert.deepEqual(formatTimestamp('2026-11-13T00:03:01+00:00',local),{date:'12/11/2026',time:'18:03:01'});
  assert.deepEqual(formatTimestamp('2026-11-13T17:42:25.123456+00:00',local),{date:'13/11/2026',time:'11:42:25'});
  for(const value of ['2026-11-13T17:42:25','2026-02-30T12:00:00Z','inválida',undefined,null]){
    assert.deepEqual(formatTimestamp(value,local),{date:'—',time:'—'});
  }
});
test('duraciones respetan el valor de origen y no inventan unidades',()=>{
  assert.equal(formatDuration(1750),'1.75 s');
  assert.equal(formatDuration(0),'0 s');
  assert.equal(formatDuration(-2),'—');
  assert.equal(formatDuration(null),'—');
});
