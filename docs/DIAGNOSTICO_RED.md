# Diagnóstico de red desde la computadora del usuario

Prueba real iniciada el **9 de noviembre de 2026 a las 22:30, America/Mexico_City (UTC−06:00)**. Se utilizaron Python y `curl.exe` en esta computadora. No se utilizó ninguna API key, no se ejecutó ningún POST y no se modificaron AWS ni el backend. Los datos medidos están en [diagnostico-red.json](./diagnostico-red.json).

## Resultado observado

El GET inicial a `https://184-72-72-255.sslip.io/health` agotó el tiempo de conexión sin respuesta HTTP. Después, DNS resolvió correctamente el dominio a `184.72.72.255` en 0.014 segundos, pero la conexión TCP a `184.72.72.255:443` agotó 6.013 segundos.

Esto permite afirmar que la API no fue accesible desde esta computadora durante la prueba. **No permite afirmar que EC2 estuviera apagado**, ni distinguir entre firewall, ruta de red, servicio u otra causa. Como no se estableció TCP, el certificado TLS quedó **Sin verificar**. El campo `SSL_VERIFY=0` que imprime curl sin conexión no acredita la validez de un certificado.

RDS quedó **Sin verificar**: no se recibió un HTTP 200 ni 503 de `/health/db`. Tampoco se obtuvieron catálogos, secuencias, pasos, Swagger ni mensajes WSS reales. No se sustituyeron con datos inventados.

## CORS de ambos orígenes

| Origin enviado | Petición | Resultado real |
| --- | --- | --- |
| `http://localhost:5500` | GET `/health` | Timeout TCP; sin respuesta HTTP |
| `http://localhost:5500` | OPTIONS `/vehiculos/1/movimientos` | Timeout TCP; sin respuesta HTTP |
| `https://jack28-08.github.io` | GET `/health` | Timeout TCP; sin respuesta HTTP |
| `https://jack28-08.github.io` | OPTIONS `/vehiculos/1/movimientos` | Timeout TCP; sin respuesta HTTP |

Los OPTIONS enviaron `Access-Control-Request-Method: POST` y `Access-Control-Request-Headers: content-type,x-api-key`. Son consultas de preflight; **no ejecutan el POST ni un movimiento**. Curl terminó con código 28. Su salida local `HTTP_CODE=000` significa que no obtuvo respuesta, no que el servidor haya devuelto un supuesto HTTP 000.

**CORS en ejecución sigue pendiente**. Se verificó en el repositorio que [`app/main.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/main.py) no contiene `CORSMiddleware`; un reverse proxy podría tener una configuración distinta que no se pudo comprobar. No se aplicó ningún parche.

Una vez accesible AWS, deberán repetirse GET y preflight y comprobarse en el navegador `Access-Control-Allow-Origin` con el origen exacto, métodos GET/POST y headers Content-Type/X-API-Key. Swagger puede funcionar por compartir origen con la API aunque el frontend siga bloqueado por CORS.

## Contrato verificado en código y pruebas pendientes

La lectura mediante GitHub es una verificación de código, **no una ejecución de la API desplegada**:

- [`app/routes/demos.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/routes/demos.py) declara HTTP **202** para iniciar DEMO. No se hizo ese POST; su respuesta real sigue pendiente de autorización y de conectividad.
- [`app/services/demo_data.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/services/demo_data.py) prepara el plan con N movimientos consultados al repositorio en una transacción de lectura. [`app/repositories/vehiculos.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/repositories/vehiculos.py) usa `sp_obtener_demos` y `sp_obtener_movimientos_demo`.
- [`app/services/demos.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/services/demos.py) publica inicio, pasos después del commit y el evento terminal bajo coordinación por vehículo; usa `duracion_ms` y `pausa_ms` del plan. Falta observar el orden real con un cliente WSS externo y una ejecución autorizada.
- [`app/services/movimientos.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/services/movimientos.py) define `MovimientoDeDemo._registrar_historial` con retorno `None`. La ausencia de nuevas filas en una prueba real sigue pendiente; no se desarrolló un módulo de monitoreo histórico para comprobarla.
- [`app/models/events.py`](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/models/events.py) define los campos reales, incluidos `id_ejecucion`, `id_demo`, `orden`, `fecha_hora`, `duracion_ms` y `pausa_ms`. Ningún evento ni HTTP 200/202 certifica actividad física.

## Reanudación de las evidencias

Primero se debe recuperar la respuesta de `/health`; después consultar `/health/db`, vehículo, comandos, DEMO y los movimientos de cada `id_demo` recibido. A continuación se verifican CORS y el WSS del navegador por separado. Las evidencias de movimiento, cambio de dirección, STOP, inicio y cancelación DEMO requieren autorización explícita antes de cualquier POST, operador presente y capturas que oculten los encabezados de autenticación. El monitor del navegador no sustituye al cliente WSS independiente solicitado en la práctica.
