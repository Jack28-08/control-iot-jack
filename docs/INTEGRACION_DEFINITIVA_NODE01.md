# Integración de NODE/01

## Qué se verificó

La [auditoría comparativa](AUDITORIA_COMPARATIVA_NODE01.md) identifica los
commits de referencia y separa las pruebas físicas reportadas de sus ramas
virtuales. NODE/01 conserva su propio protocolo, mapa eléctrico y catálogo.
El firmware parte de `Montacargas_AWS_Final_Reconexion_V2.ino`. Se verificó
su SHA-256 `BC65C723BBB9378A46B2D88C86E27FEC197715CC6D4820871810AA7D800B4F92`.

En esta revisión, GitHub Pages respondió HTTP 200 y sirvió la versión
publicada anterior. `/health` en AWS agotó el tiempo de espera en esta PC.
La disponibilidad de códigos 9–12, la conexión con RDS y la actuación
eléctrica y mecánica quedan por comprobar en la instalación.

## Acceso del catedrático

Cuando la instalación tenga habilitado el acceso directo, abrir
[NODE/01 en GitHub Pages](https://jack28-08.github.io/control-iot-jack/)
basta para consultar y controlar el vehículo 1. La página obtiene y renueva
el acceso en segundo plano. El Bearer dura diez minutos y puede autorizar
los mandos, DEMO, DETENER y el permiso sostenido. El operador no ve un
formulario de autenticación. El servidor conserva la configuración al
reiniciar y el navegador sustituye la sesión en memoria.

Cualquier persona que conozca la URL puede solicitar movimientos mientras
la infraestructura esté disponible. Alimenta el vehículo únicamente
durante su uso supervisado. El alcance excluye administración y acceso al
WebSocket privado del dispositivo. El origen web acota el uso del navegador.
El acceso directo sigue siendo público.

## Catálogo y transiciones

| Código propuesto | Nombre | Salidas |
| --- | --- | --- |
| 9 | `AVANZAR_IZQUIERDA` | Q1 + Q0 · `0x03` |
| 10 | `AVANZAR_DERECHA` | Q1 + Q7 · `0x82` |
| 11 | `RETROCEDER_IZQUIERDA` | Q4 + Q0 · `0x11` |
| 12 | `RETROCEDER_DERECHA` | Q4 + Q7 · `0x90` |

Desde el backend instalado y cuando `/health` responda, ejecuta la
consulta sin clave. El script muestra las colisiones y los IDs que
realmente devolvió el GET. Las dos variantes con escritura requieren
autorización y la clave administrativa solicitada sin eco.

```powershell
$apiNode01 = 'https://184-72-72-255.sslip.io'
.\.venv\Scripts\python.exe -m scripts.catalogo_diagonales --base-url $apiNode01
```

```powershell
$journalNode01 = '.\tmp\diagonales-node01.json'
.\.venv\Scripts\python.exe -m scripts.catalogo_diagonales --base-url $apiNode01 --apply --journal $journalNode01
```

Para revertir un alta, deshabilita primero las diagonales en FastAPI.
La restauración usa el diario de la misma operación y desactiva solo
los registros cuya identidad y marca de alta coinciden. Conserva las
relaciones históricas. Ejecuta la restauración sin ediciones concurrentes
del mismo catálogo.

```powershell
.\.venv\Scripts\python.exe -m scripts.catalogo_diagonales --base-url $apiNode01 --restore --journal $journalNode01
```

El joystick consulta el código y nombre de cada dirección y resuelve
el `id_comando` en el servidor. Cada transición confirmada actualiza
estado y registra historial en la misma transacción usando los SP
existentes. La renovación del mismo vector no consulta RDS. Se omite la
consulta completa de historial en la transición. Monitoreo reconcilia
sus diez filas por REST. DETENER puede revocar durante una transacción.
Si el commit ya estaba en curso, su fila lógica puede quedar registrada
y el dispositivo permanece sin esa orden.

## Instalación por etapas

1. Sigue la [guía de banco y actualización Windows](CONTROL_INTEGRADO_INSTALACION.md)
   con los archivos `NODE01_Backend_Integracion_Definitiva.bundle`,
   `NODE01_Frontend_Integracion_Definitiva.bundle` y
   `NODE01_ESP8266_Integracion_Definitiva.zip`. Los nombres de las ramas,
   el procedimiento para FastAPI y el aislamiento físico son los de esa guía.
   Conserva los paquetes anteriores como puntos de reversión.
2. Compila primero el sketch para `esp8266:esp8266:nodemcuv2`, NodeMCU 1.0
   ESP-12E. El ZIP incluye el README con el canal privado, WiFiManager,
   CA, token de dispositivo, salida GPIO y supervisor externo enclavado.
   Con la tracción y la grúa aisladas, valida OE durante arranque, reset,
   expiración y bloqueo de red. Ajusta la pausa al invertir después de
   medir el circuito. El valor compilado de partida es 40 ms.
3. Conecta el firmware y verifica salud, RDS y la capacidad del dispositivo
   por separado. En el `.env` privado de FastAPI, configura una sola vez
   el conjunto siguiente. Conserva la credencial privada del dispositivo
   ya instalada. Reinicia únicamente FastAPI según sus dependencias Windows.

```dotenv
IOT_CONTINUOUS_ENABLED=true
IOT_CONTINUOUS_PERSIST_TRANSITIONS=true
IOT_CONTINUOUS_DIAGONALS=false
IOT_CONTINUOUS_REMOTE_DEMO=false
IOT_DIRECT_ENABLED=false
```

4. Tras comprobar catálogo y corte de banco, habilita
   `IOT_CONTINUOUS_DIAGONALS=true` y ensaya cada pareja de contactos.
   Comprueba STOP mientras cambia una dirección y después de desconectar
   y reconectar. Q5 conserva su mapeo. La DEMO autónoma del mando exige un
   corte maestro verificado antes de habilitarla en firmware y API.
5. Después de las pruebas de banco, cambia `IOT_DIRECT_ENABLED` a `true`
   para Pages y reinicia FastAPI. Publica el frontend en la misma raíz
   de `main`. Verifica desde incógnito y desde un segundo dispositivo,
   después de recargar y después de otro reinicio de FastAPI durante la
   ventana supervisada. Comprueba también que una sesión web no pueda
   editar el catálogo. Para revocar acceso público basta guardar
   `IOT_DIRECT_ENABLED=false` y reiniciar.

## Medición de latencia e interpretación

| Tramo | Punto de medida |
| --- | --- |
| Gesto y REST | Marca el gesto en DevTools. La interfaz muestra el tiempo del vector. Usa Network para identificar el OPTIONS y el POST. Compara el primer gesto y una repetición con preflight en caché. |
| FastAPI y RDS | Lee `ms_persistencia` y `tiempos_ms` de la transición. Se registran conexión, transacción y encolado WSS. Los vectores de renovación carecen de esos tiempos porque no escriben. |
| Consigna y acuse | Usa `id_operacion` en el resultado y en WSS. `ms_ida_vuelta` comprende la consigna y el siguiente latido con el acuse. La etiqueta de Monitoreo distingue una máscara simulada. |
| Latch, OE y tracción | Usa un analizador para medir flanco de latch, corte de OE y estado de los contactos con la tracción aislada. Verifica por separado el tiempo hasta la parada mecánica en un ensayo supervisado. |

Registra muestras para inicio, cambio, liberación y STOP bajo carga.
Reporta mediana y percentil 95 para cada recorrido. La meta de 250 ms
de mediana desde el gesto hasta la actuación sigue pendiente de medición.
La interrupción de Timer1 solicita el corte de OE aun con el bucle
ocupado mientras se atiendan interrupciones. El supervisor externo
enclavado protege frente a fallos que impidan atenderlas. Un acuse
registra la decisión del dispositivo y su máscara. El analizador y la
observación física verifican las salidas y la parada.

## Resultados locales

| Prueba | Resultado |
| --- | --- |
| Node.js | 102 pruebas superadas. |
| Chromium | 25 escenarios con REST/WSS simulados y CONTROL, MONITOREO y DEMO en 12 tamaños. Acceso directo, recarga, diagonal y liberación superados. Cero POST reales. |
| FastAPI | 219 pruebas superadas. Incluyen doble de RDS, alcance del acceso público, escritura única por transición, reenvíos, STOP entre validación y commit, acuses, chequeos CORS y los 11 escenarios del script de catálogo. |
| NodeMCU ESP8266 | 16 escenarios C++ y tres compilaciones completas, incluidas WSS simulado y GPIO con parámetros ficticios. La ISR de Timer1 figura en IRAM. |
