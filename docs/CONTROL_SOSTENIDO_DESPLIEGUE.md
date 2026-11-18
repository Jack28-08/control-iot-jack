# Control sostenido y diagnóstico de NODE/01

Este documento conserva el diagnóstico y los pasos de la primera candidata
simulada. Tras recuperar el firmware, la revisión integrada usa su propia
[guía de instalación y comprobación](CONTROL_INTEGRADO_INSTALACION.md).

## Qué muestran los datos

| Lectura reportada | Alcance |
| --- | --- |
| `/health` en 114 ms | Tiempo del GET de salud. No incluye cola de control, transacción, publicación WSS ni actuación. |
| POST cancelados a 216, 8 y 51 ms | El navegador dejó de esperar. El código anterior abortaba el movimiento al soltar el gesto. Si la solicitud ya llegó a FastAPI, su transacción y publicación pueden continuar. Estos tres tiempos no identifican qué órdenes llegaron. |
| DETENER HTTP 200 | Confirmación lógica de la API. El WSS de monitoreo no informa cuándo el registro o el mando pasan a neutral. |
| Actuación individual de 900 ms y liberación automática | Evidencia del temporizador que indica el registro del firmware instalado. Sin ese fuente ni una traza correlacionada no se puede determinar si la espera es bloqueante o si una orden tardía reinició los 900 ms. |

Se buscaron `[ACTUACION]`, `[FISICO]`, `[STOP] Liberacion automatica` y
`CONECTADO A AWS` en fuentes, respaldos y cachés de Arduino accesibles. Se
encontró el sketch de banco del 74HCT595 y un sketch independiente de Wi-Fi.
El fuente del binario instalado sigue pendiente. La candidata completa
`firmware/Node01Privado` trabaja con máscaras simuladas. Reemplazar el
firmware instalado con esta candidata dejaría sin actuación la grúa,
velocidad y las DEMO físicas del sketch previo. Esas operaciones conservan
su manejo REST, WSS e historial en el backend existente.

## Contrato y garantías

1. La interfaz consulta `GET /vehiculos/1/control/capacidad`. El modo se
   activa con dispositivo autenticado y latido reciente. Los tres POST
   nuevos usan la clave del operador en memoria. Los alcances del acceso
   temporal de evaluación se conservan para sus rutas anteriores.
2. `POST /control/permiso` concede el permiso inicial en **neutral**. El
   navegador espera la confirmación antes de mandar `/control/vector`.
   Envía un solo vector a la vez y descarta los cambios intermedios. Renueva
   cada 200 ms mientras siga activo el gesto. La API limita el permiso a
   750 ms desde el último vector aceptado.
3. Al terminar el gesto, perder captura o foco, girar la pantalla,
   abandonar la página o detectar pérdida de conexión, se descarta el
   envío local pendiente y `/control/liberar` revoca la barrera. Si llega
   primero que el permiso inicial, la barrera antigua también queda
   revocada. DETENER invalida la barrera de todo el vehículo antes de
   esperar la operación de RDS. Una pérdida total de red puede retrasar
   la confirmación. El equipo debe volver a neutral por vencimiento.
4. El equipo abre `/ws/dispositivos/1` con credencial propia y TLS. Cada
   latido solicita una sola consigna con un reto local válido durante
   300 ms. Las respuestas caducan desde la emisión del reto. El orden y
   la conexión impiden reutilizar una respuesta después de neutralizar.
   Al vencer el temporizador local o fallar una trama vigente se invalida
   la conexión y se rechaza cualquier respuesta de esa generación.
   El broker revoca el permiso al reconectar. Una consigna que salió del
   servidor antes de STOP puede seguir en tránsito. El HTTP 200 no
   acredita que el dispositivo ya haya aplicado neutral.
5. Los dos ejes forman una sola máscara. Las diagonales requieren
   habilitación explícita en el backend. El canal continuo no agrega
   entradas de historial. Las operaciones individuales previas conservan
   su transacción, historial y contrato. Los 21 procedimientos almacenados
   se conservan.

La barrera protege el protocolo nuevo. El firmware heredado que actúa con
el WSS público no puede recibir esa garantía. Durante el cambio, se debe
mantener físicamente inhabilitada la tracción. No mezclar un actuador que
interpreta eventos de monitoreo con un actuador que ya usa el canal
privado. Confirmar el corte eléctrico en banco con el equipo aislado.

## Preparar EC2 de Windows

Ejecutar solo en la ventana supervisada del operador. Conservar una copia
del sketch realmente instalado y de la revisión del backend. Desacoplar la
tracción y verificar que no quede una DEMO activa. Los cambios de prueba
no requieren reinstalar Caddy, modificar RDS ni tocar reglas de red.

1. Transferir `NODE01_Backend_Control_Sostenido.bundle` a
   `C:\IoT\transferencia\` por el método privado habitual. En PowerShell
   elevado, revisar y aplicar únicamente un avance de Git.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\IoT\api-vehiculo-iot'
if (@(git status --porcelain).Count) { throw 'Conserva primero el trabajo local de EC2.' }
$previous = git rev-parse HEAD
git bundle verify 'C:\IoT\transferencia\NODE01_Backend_Control_Sostenido.bundle'
if ($LASTEXITCODE) { throw 'El bundle no se pudo verificar.' }
git fetch 'C:\IoT\transferencia\NODE01_Backend_Control_Sostenido.bundle' refs/heads/codex/control-continuo-iot
if ($LASTEXITCODE) { throw 'No se pudo leer la rama del bundle.' }
git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE) { throw 'La rama diverge. Revisa la diferencia antes de continuar.' }
git rev-parse HEAD
```

2. Conservar el `.env` protegido existente. En un editor local de EC2,
   agregar estos tres nombres. Dejar inicialmente ambos indicadores en
   `0`. Proporcionar el token en privado. Solo el dispositivo debe conocer
   el mismo valor. No reutilizar la clave del operador o de evaluación.

```dotenv
IOT_CONTINUOUS_ENABLED=0
IOT_CONTINUOUS_DIAGONALS=0
IOT_CONTINUOUS_DEVICE_TOKEN=<valor privado de 32 a 256 caracteres ASCII sin espacios>
```

3. Reiniciar FastAPI con un solo worker. Si Windows muestra a
   `CaddyVehiculoIoT` activo como dependiente, detenerlo durante el
   reinicio y volver a levantarlo después de verificar FastAPI. El
   bloque no cambia el Caddyfile ni reinicia la base de datos.

```powershell
$deploymentApi = Get-Service -Name ApiVehiculoIoT
$dependents = @($deploymentApi.DependentServices | Where-Object Status -ne 'Stopped')
if ($dependents | Where-Object Name -ne 'CaddyVehiculoIoT') {
    throw 'Revisar dependencias activas adicionales antes de reiniciar.'
}
$needsCaddyRestart = $dependents.Name -contains 'CaddyVehiculoIoT'
if ($needsCaddyRestart) { Stop-Service -Name CaddyVehiculoIoT -ErrorAction Stop }
Restart-Service -Name ApiVehiculoIoT -ErrorAction Stop
$ready = $false
for ($i = 0; $i -lt 20 -and -not $ready; $i++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $ready = $health.status -eq 'ok'
    } catch {}
    if (-not $ready) { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'La API todavía no responde. Revisar antes de reactivar Caddy.' }
if ($needsCaddyRestart) { Start-Service -Name CaddyVehiculoIoT -ErrorAction Stop }
Invoke-RestMethod 'http://127.0.0.1:8000/vehiculos/1/control/capacidad' -TimeoutSec 5 |
    Select-Object habilitado, disponible, diagonales, ttl_ms, renovar_ms
```

## Banco y comprobación física supervisada

1. Abrir el [sketch y guía de compilación](../../node01-firmware-integrado/firmware/Node01Privado/README.md)
   en la copia local del firmware. Compilar primero con la red deshabilitada.
   Usar Arduino CLI 1.5.1, core ESP8266 3.1.2 y placa NodeMCU 1.0.

```powershell
Set-Location 'C:\Users\joseh\Downloads\node01-firmware-integrado'
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --warnings all firmware/Node01Privado
```

2. Para prueba de transporte con salidas simuladas, seguir la variante
   WSS del README del sketch, configurar el encabezado local privado y su
   CA válida. Mantener las trazas de handshake deshabilitadas. Cuando el
   operador autorice la prueba, habilitar `IOT_CONTINUOUS_ENABLED=1`,
   reiniciar por el bloque anterior y verificar que `disponible` cambie
   solo con un latido autenticado. La compilación y esta guía no cargan
   un firmware en la placa.
3. Para preservar las acciones físicas originales, recuperar el fuente
   abierto antes de la última carga. Confirmar pines, OE y polaridad.
   Integrar un único escritor del latch para dirección, pulsos y DEMO.
   Sustituir esperas bloqueantes por estados con plazos. Antes de habilitar
   pines, medir un corte neutral independiente de una espera de TLS.
   Un temporizador cooperativo de `loop()` depende de que el bucle siga
   ejecutándose. Verificar el corte con la red interrumpida y el bucle detenido.
4. Con la tracción aislada, observar OE/latch y correlacionar cuatro
   ventanas de tiempo. Medir en DevTools permiso, primer vector y liberar.
   Registrar el tiempo del servicio HTTP por separado del GET de salud.
   Medir en el equipo latido, consigna y devolución a neutral. Medir en el
   banco el cambio eléctrico y la parada. Registrar varios intentos y los
   percentiles, con y sin pérdida de Wi-Fi. No exportar encabezados
   autenticados ni tokens. Mantener separadas confirmación lógica y
   observación física.
5. Con un operador presente, comprobar neutral al soltar, al perder foco
   y al interrumpir red. Pulsar DETENER con un movimiento en curso y
   asegurar que una orden anterior no reactive la salida tras neutral.
   Reconectar y verificar que solo un gesto nuevo puede mover. Ensayar
   por separado grúa, velocidad y DEMO después de portar sus salidas.
   Habilitar las diagonales solo después de verificar ambos contactos y
   el significado de cada combinación en el mando/receptor.

Para dar marcha atrás, dejar las salidas aisladas, desactivar
`IOT_CONTINUOUS_ENABLED`, reiniciar la API y confirmar
`habilitado=false`. Si también hay que revertir código, comprobar la
revisión guardada en `$previous`, cambiar a esa revisión con
`git switch --detach $previous` con el árbol limpio y repetir el bloque de
reinicio. Usar únicamente un firmware anterior recuperado y comprobado.

## Aplicar el frontend después de validar el cambio

Cuando el backend y el firmware ya hayan pasado las comprobaciones
supervisadas, importar la rama preparada al repositorio original del
frontend. El bundle no publica ninguna rama por sí mismo.

```powershell
Set-Location 'C:\Users\joseh\Downloads\control-iot-jack'
if (@(git status --porcelain).Count) { throw 'Conserva primero el trabajo local.' }
git fetch .\entregables\NODE01_Frontend_Control_Sostenido.bundle refs/heads/codex/control-sostenido-node01
if ($LASTEXITCODE) { throw 'No se pudo leer la rama preparada.' }
git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE) { throw 'La rama diverge. Revisa la diferencia antes de publicar.' }
npm.cmd test
if ($LASTEXITCODE) { throw 'Revisar las pruebas antes de publicar.' }
git push origin HEAD:refs/heads/main
```
