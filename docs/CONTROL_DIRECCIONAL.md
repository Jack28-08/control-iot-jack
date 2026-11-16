# Control direccional de NODE/01

El joystick puede reconocer ocho sectores. La API actual admite únicamente
los cuatro movimientos cardinales del catálogo desde ese joystick. Cada
diagonal requiere una sola orden que represente las dos direcciones a la vez.
Hasta que exista ese contrato y se valide en banco, la selección diagonal
queda sin orden de movimiento. Si antes había una dirección activa, se libera
con la detención lógica existente. Las flechas compatibles pulsadas casi a
la vez forman una diagonal visual; al soltar una, la dirección restante se
previsualiza hasta que el usuario realiza un nuevo gesto. Los botones
diagonales dedicados permiten revisar los cuatro sectores en pantalla táctil.

## Firmware localizado

Se encontraron dos copias idénticas del sketch de banco,
`pruebazuwu/pruebazuwu.ino` y `pruebazuwu1/pruebazuwu1.ino`, en Descargas.
Ambas coinciden por SHA-256. `Registro595::escribir` desplaza un byte completo
y actualiza las salidas con un flanco del latch. `Montacargas` escribe un
solo bit por dirección; la siguiente orden reemplaza el byte. `detener()`
escribe cero. Las direcciones quedan activas hasta otro comando o una parada.
El `loop()` lee caracteres del puerto serie y no tiene cliente de red ni
temporizador de liberación. Cambiar velocidad, la demo original del mando y
la demo coreografiada utilizan esperas bloqueantes, durante las cuales el
sketch no procesa un STOP nuevo.

El sketch `Actividad_WiFi_Excavadora_NodeMCU.ino` configura Wi-Fi con
WiFiManager. Está en un proyecto separado y no controla las salidas del
74HCT595. Queda por confirmar qué binario lleva la placa del vehículo.

| Dirección | Salida del sketch | Byte hexadecimal |
| --- | --- | --- |
| Izquierda | Q0 | `01` |
| Avanzar | Q1 | `02` |
| Retroceder | Q4 | `10` |
| Derecha | Q7 | `80` |

El 74HCT595 puede trasladar dos bits al registro de salidas con un solo
flanco de latch. Con el mapa del sketch, los valores candidatos son
`03` para avanzar a la izquierda, `82` para avanzar a la derecha,
`11` para retroceder a la izquierda y `90` para retroceder a la derecha.
Son máscaras de banco, no IDs ni códigos de AWS. Hace falta verificar la
polaridad y el cableado de los optoacopladores, la corriente con dos canales
activos, el estado seguro de las salidas durante el arranque y si el mando
y el receptor interpretan los dos contactos como la trayectoria solicitada.
[Hoja de datos del 74HCT595](https://assets.nexperia.com/documents/data-sheet/74HC_HCT595.pdf).

## Contrato actual de AWS

`GET /vehiculos/1/comandos` publica los comandos del vehículo.
`POST /vehiculos/1/movimientos` recibe un único `id_comando` y `origen`,
valida el comando y registra estado e historial en RDS. Dos POST registran
dos movimientos independientes. `POST /vehiculos/1/detener` cancela la DEMO
de la API, si existe, y publica una detención lógica. El WSS público
`/ws/vehiculos/1` transmite estados y eventos del servidor para monitoreo.
No ejecuta mensajes entrantes ni ofrece acuse autenticado de actuador.
[Modelo de movimiento](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/models/vehiculos.py) ·
[Controlador WSS](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/routes/websocket.py) ·
[Contrato WSS y DEMO](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/docs/websocket.md).

El 13 de noviembre de 2026, la verificación de solo lectura obtuvo HTTP 200
para catálogo, estado e historial, con ocho comandos en Control y un
`estado_inicial` real por WSS. El 16 de noviembre, las comprobaciones de
`/health` desde esta PC resolvieron el host a `184.72.72.255` y agotaron
el plazo de conexión sin respuesta HTTP. Por ello, no se volvió a leer el
catálogo ese día. Estas observaciones no verifican la disponibilidad actual
de RDS, el despliegue del acceso de evaluación ni la conexión del
microcontrolador. [Acta de verificación 4.2](VERIFICACION_4_2.md).

## Contrato propuesto para implementar por separado

1. **Firmware.** En el sketch que se confirme como base del vehículo,
   centralizar el control de salidas en una función que reciba dos ejes
   discretos. Cada eje vale `-1`, `0` o `1`. El longitudinal representa
   retroceder, neutral y avanzar. El lateral representa izquierda, neutral
   y derecha. Validar ambos valores y convertir la pareja a un byte completo
   en una sola operación de latch. `(0,0)` escribe cero. Una pareja no puede
   contener dos direcciones opuestas del mismo eje. Los otros cuatro
   comandos del catálogo conservan sus pulsos o salidas individuales y no
   se mezclan con la pareja direccional.
2. **Transporte.** Agregar al backend existente un canal de escritura
   autenticado para el dispositivo y un contrato de control direccional
   autenticado y limitado al vehículo. El canal público de monitoreo
   conserva su contrato de lectura. El servidor mantiene una sola concesión
   de control por vehículo; sus mensajes identifican el vehículo, la
   concesión y una secuencia creciente, e indican `longitudinal`, `lateral`
   y la duración máxima del permiso. El ESP8266 valida el origen
   autenticado, el identificador, la concesión y la secuencia antes de
   actuar. El servidor descarta mensajes vencidos antes de enviarlos y
   nunca reproduce órdenes pendientes después de reconectar. El acuse
   incluye concesión y secuencia y distingue «salidas
   aplicadas» de «movimiento físico observado». Las credenciales del
   dispositivo se provisionan por separado. Las pruebas de banco fijan
   el plazo máximo en función de la latencia observada y del tiempo de
   detención admisible.
3. **Inicio, mantenimiento y liberación.** Enviar una pareja al comenzar y
   cuando cambie el sector o las teclas/dedos activos. Si se libera un eje y
   queda el otro pulsado, enviar la pareja con el eje liberado en cero.
   Mantener la concesión con una renovación acotada y separada de la orden
   de movimiento, sin emitir órdenes por cada píxel. El firmware mide el
   vencimiento con un reloj monotónico y vuelve a cero si vence el permiso,
   se pierde el canal o se reinicia el equipo. Al soltar todo, perder el
   foco, cancelar un puntero o pulsar DETENER, invalidar la concesión y
   mandar neutral con prioridad. Una concesión invalidada no se reabre con
   un mensaje tardío. Tras recuperar el enlace, partir de neutral y exigir
   una nueva interacción. Los pulsos y la DEMO del firmware requieren una
   máquina de estados sin esperas bloqueantes para que la liberación
   interrumpa cualquier fase.
4. **Activación y persistencia.** Exponer la capacidad diagonal al frontend
   solo cuando el backend y el dispositivo validado la anuncien para ese
   vehículo. Aplicar el mismo arbitraje de DETENER y exclusión durante DEMO
   a ambos canales. El modo de evaluación mantiene sus permisos actuales
   mientras no se autorice expresamente el nuevo contrato. Conservar el
   historial individual de RDS y sus 21 procedimientos. Si se necesita
   mostrar la nueva operación, transmitirla como telemetría separada de
   maniobra, con su acuse y origen, sin insertar una fila ficticia ni
   sustituir la vista de movimientos individuales.

## Validación pendiente

- Revisar el esquema físico y confirmar placa, firmware cargado, conexiones
  Q0/Q1/Q4/Q7, configuración de `OE` y estado de cada optoacoplador con
  el equipo apagado, durante reset y al perder alimentación. Medir las
  cuatro parejas en banco con la tracción desacoplada o las ruedas al aire.
  Verificar un solo latch por pareja y ninguna activación de opuestos o
  salidas auxiliares.
- Probar en el firmware una pareja válida, valores fuera de rango, cambio
  diagonal a cardinal, neutral, mensajes repetidos/fuera de secuencia,
  tiempo vencido, caída y reinicio, y STOP durante un pulso o una DEMO.
  Usar salidas simuladas para las pruebas automáticas.
- Probar con FastAPI y actuador simulados la denegación de otros vehículos,
  el conflicto de operadores, el rechazo durante DEMO y la revocación de
  concesión aun con una orden pendiente. Confirmar que ninguna secuencia
  modifica los contratos o el historial actual.
- Con el hardware validado y con autorización de despliegue, comprobar las
  cuatro trayectorias con un operador presente, los tiempos de liberación
  y el comportamiento al cortar el enlace. Registrar por separado orden
  aceptada, salidas aplicadas y trayectoria observada.
