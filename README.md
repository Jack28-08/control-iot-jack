# NODE/01 Control y Monitoreo IoT

NODE/01 reúne Control, Monitoreo y Demo en una consola adaptable. Usa HTML5, CSS3, Bootstrap 5, Fetch y WebSocket nativo. El vehículo es el **1** y las órdenes individuales usan los identificadores de su catálogo real. Las etiquetas `practica-4.2-entrega` y `node01-redisenio-anterior` conservan la entrega académica y la consola publicada antes de esta revisión.

- [NODE/01 en GitHub Pages](https://jack28-08.github.io/control-iot-jack/).
- [Repositorio del frontend](https://github.com/Jack28-08/control-iot-jack).
- [Swagger de la API existente](https://184-72-72-255.sslip.io/docs).
- [Enunciado 4.2 y sus siete evidencias](./docs/ENUNCIADO_PRACTICA_4_2.txt).
- [Protocolo para terminar las evidencias reales](./docs/VERIFICACION_4_2.md).
- [Auditoría de firmware y contrato para diagonales](./docs/CONTROL_DIRECCIONAL.md).
- [Matriz de cumplimiento de las prácticas 4.1 y 4.2](./docs/MATRIZ_CUMPLIMIENTO_4_1_4_2.md).

## Uso

**Control** conserva los ocho mandos del catálogo, agrupados en Dirección y Equipo, y DETENER. El disco integra los ocho sectores, la zona neutral y la histéresis. Usa el puntero o las flechas con el foco en el joystick. Dos flechas compatibles presionadas en los primeros 65 ms forman una diagonal. Al soltar una flecha del acorde, el joystick muestra la dirección restante sin convertirla en una orden nueva. Las flechas opuestas neutralizan el gesto.

Al seleccionar una diagonal, el sector se ilumina en ámbar y se informa que falta soporte físico. Las cuatro cardinales siguen usando el catálogo. Al entrar a una diagonal desde un movimiento solicitado, el navegador descarta las órdenes pendientes y solicita DETENER. También solicita detener cuando termina un gesto que envió una orden, se pierde foco o captura, cambia la orientación o se pierde WSS durante una dirección activa. DETENER tiene prioridad local y lógica en el servidor. Un POST ya procesado puede haber surtido efecto y toda confirmación física depende del actuador.

**Monitoreo** muestra el último estado reportado y los diez movimientos individuales persistidos más recientes. Las pantallas pequeñas paginan la presentación. Cambiar de pestaña no navega a otro documento ni abre otro WebSocket. El evento recibido informa del estado; solo REST alimenta la tabla. Ningún HTTP o WSS confirma movimiento físico.

**Demo** separa el selector, el estado y las acciones de la lista de pasos consultados por REST. El avance marca el último paso recibido por WSS. Si se pierde observación durante la ejecución, la vista conserva el paso conocido e informa incertidumbre. Iniciar, Cancelar y DETENER siguen sujetos al mismo contrato existente.

Durante una ventana abierta en EC2, el enlace público emite una sesión de evaluación y no pide una clave. Fuera de ese horario la lectura sigue pública; **Acceso** permite al operador autorizado usar su propia clave en memoria. No se abre automáticamente ningún diálogo.

## Arquitectura y contratos

| Módulo | Responsabilidad |
| --- | --- |
| `js/api.js`, `js/config.js` | Rutas reales, cancelación, timeout, errores y credenciales solo en memoria. |
| `js/control.js`, `js/joystick.js`, `js/directions.js` | Coordinación, prioridad de detención, ocho sectores, histéresis y arbitraje de puntero y teclado. |
| `js/catalog.js`, `js/protocol.js`, `js/format.js` | Validación de catálogo y eventos; etiquetas, iconos y horas de presentación. |
| `js/socket.js` | Único canal WSS por pestaña, validación y reconexión progresiva. |
| `js/monitor.js`, `js/navigation.js`, `js/main.js`, `js/ui.js` | Sincronización, vistas, paginación y diagnóstico independiente. |
| `tests/` | Pruebas aisladas y navegador con dobles de REST y WSS. |

| Ruta bajo `https://184-72-72-255.sslip.io` | Uso |
| --- | --- |
| GET `/vehiculos/1`, `/vehiculos/1/comandos` | Vehículo y catálogo. |
| GET `/vehiculos/1/estado`, `/vehiculos/1/historial` | Snapshot y hasta diez registros de RDS, orden fecha e identificador descendentes. |
| GET `/vehiculos/1/demos`, `/vehiculos/1/demos/{id}/movimientos` | Secuencias y pasos. |
| POST `/vehiculos/1/movimientos` | `{id_comando, origen}`; estado e historial en una transacción. |
| POST `/vehiculos/1/demos/{id}/iniciar`, `/cancelar` | Inicio (202), cancelación de secuencia. |
| POST `/vehiculos/1/detener` | Detención lógica. |
| GET `/health`, `/health/db` | Disponibilidad API y diagnóstico RDS separados. |
| GET `/evaluacion/vehiculos/1` | Sesión temporal; disponible únicamente con la actualización opcional de EC2 y una ventana vigente. |

El canal `wss://184-72-72-255.sslip.io/ws/vehiculos/1` distribuye estado inicial, movimiento individual, detención y el ciclo de DEMO. Se valida vehículo, tipo y campos, sin ejecutar acciones por recepción. Al abrir Monitoreo y tras recuperar WSS se consultan estado e historial. Los movimientos individuales disparan reconciliación REST; los pasos de DEMO solo reflejan el estado. Las respuestas antiguas no sobreescriben eventos nuevos y la tabla elimina IDs repetidos antes de limitar a diez. No hay polling de historial. Las fechas REST sin offset en los dos campos documentados provienen de sesiones MySQL configuradas en UTC; los eventos WSS incluyen zona. La UI presenta hora local del navegador.

Los indicadores son independientes: el navegador observa WSS, `/health` acredita solo el servicio consultado y únicamente `/health/db` diagnostica RDS. Sin respuesta de diagnóstico, RDS queda «Sin verificar». Un socket activo no acredita conexión del dispositivo físico.

## Ejecutar y validar

```powershell
npm.cmd test
npm.cmd run serve
```

Abrir [http://localhost:5500](http://localhost:5500). Se requiere Node.js y Python; el frontend no necesita compilación ni dependencia npm de producción. El servidor de desarrollo escucha solo en loopback. Para navegador automatizado, instalar Playwright en el entorno de pruebas o señalar un runtime ya instalado y un Chromium compatible:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\ruta\a\playwright\index.mjs'
$env:BROWSER_EXE = 'C:\ruta\a\chrome.exe'
npm.cmd run test:browser
```

El arnés navega la subruta de Pages y sustituye REST y WSS por dobles locales. Si existe `.local/bootstrap-5.3.3.min.css`, usa esa copia del CSS publicado. Escribe capturas y resultados bajo `evidencias/definitivo/simulacion`. Usa `NODE01_EVIDENCE_DIR` para elegir otro destino.

Las pruebas verifican las tres vistas en doce tamaños, zoom al 200 %, ocho sectores integrados, teclado, puntero, tacto, cambio de orientación durante un gesto, acceso cerrado, DETENER bajo pérdida de conexión, historial y avance de DEMO por eventos. Las operaciones reales y la comprobación en teléfono requieren una sesión supervisada.

## Publicación y acceso de evaluación

Pages conserva `main` / raíz, HTTPS y rutas relativas. No se publican documentos académicos, capturas, claves ni carpetas privadas. La [rama del backend](https://github.com/Jack28-08/api-vehiculo-iot/tree/codex/evaluacion-iot-4-2) agrega el acceso mínimo. Sigue cerrada por defecto y no modifica SP, RDS ni administración. La [guía EC2](https://github.com/Jack28-08/api-vehiculo-iot/blob/codex/evaluacion-iot-4-2/docs/evaluacion_4_2_ec2.md) explica cómo desplegar, abrir y revocar la ventana sin copiar claves.

El frontend solo guarda el token corto en RAM y solo lo envía al servidor. Los GET ordinarios no llevan credenciales. El origen de Pages es una condición adicional, no autenticación por sí sola. La ventana tiene límites y no identifica personalmente al visitante. Úsala de forma supervisada; no muestres encabezados de autorización ni guardes un HAR autenticado.

El 13 de noviembre de 2026, en la práctica 4.2, Swagger, `/health`, `/health/db`, estado, historial, catálogo y pasos de la DEMO respondieron HTTP 200. El historial devolvió diez filas del vehículo 1 en orden descendente, sin IDs repetidos. Monitoreo y un cliente WSS independiente recibieron el estado inicial. El 16 de noviembre los intentos a `/health` agotaron el tiempo de conexión desde esta PC.

El frontend conserva el contrato de sesión temporal y el acceso privado de operador. Para esta revisión se utilizaron dobles REST y WSS porque la prueba de integración queda pendiente de que el operador disponga de EC2. El [recorrido de verificación](./docs/VERIFICACION_4_2.md) cubre movimiento y DEMO supervisados, historial tras nuevas escrituras y teléfono físico.
