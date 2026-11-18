# NODE/01 · Instalación y comprobación del control integrado

## Diagnóstico

El sketch recuperado confirma un pulso de avance de 900 ms. Su liberación
automática dependía de que `ActuadorSeguro::actualizar()` volviera a ejecutarse
en `loop()`. Una llamada de red podía retrasar esa ejecución. Abortar un POST
en el navegador también dejaba abierta la posibilidad de que FastAPI ya
hubiera recibido la orden y publicara su evento después de soltar el mando.
Los tiempos observados de 216, 8 y 51 ms miden la espera interrumpida del
navegador. Los 114 ms de salud miden otro intercambio HTTP. Identificar la
secuencia exacta de un caso pasado requeriría trazas correlacionadas.

El permiso sostenido empieza en neutral. El navegador renueva cada 200 ms
con una sola solicitud de vector en vuelo y revoca al soltar. El servidor
limita la vigencia a 750 ms. DETENER invalida la barrera del vehículo antes
de la operación de RDS. El dispositivo recibe una consigna por reto en un
WSS privado y descarta respuestas vencidas, repetidas o de una sesión
anterior. La orden en tránsito antes de DETENER puede llegar antes que la
consigna neutral válida. El corte eléctrico se verifica en el vehículo.

Control sostenido requiere la clave de operador en memoria. La evaluación
temporal conserva acceso a los mandos individuales permitidos, a las
secuencias DEMO y a DETENER. La página libera el gesto y bloquea uno nuevo
si se cae su WSS durante el modo integrado.

## 1. Preparar el equipo y los archivos

1. Desconecta físicamente la energía de tracción e inmoviliza el vehículo.
   Aísla también las cargas de la grúa. Alimenta únicamente el circuito de
   control durante las mediciones iniciales. Confirma que solo el firmware de
   esta revisión reciba órdenes de actuación. El sketch público anterior
   interpreta eventos del monitor y carece de la nueva barrera.
2. Conserva en privado el sketch original y la revisión de Git instalada. La
   copia de partida verificada fue `Montacargas_AWS_Final_Reconexion_V2.ino`.
   Conserva la configuración de red existente y el Caddyfile.
3. Extrae `NODE01_ESP8266_Firmware_Integrado.zip` en una carpeta nueva.
   Abre `firmware/Node01Privado/README.md` para preparar el compilador y
   elegir el modo. Usa primero el modo que simula las salidas. Configura
   el canal privado con una CA verificable y una credencial dedicada en el
   encabezado local excluido de Git. Compilar genera un binario local.
4. Para validar solo el frontend, desde `control-iot-jack` ejecuta
   `npm.cmd test` y `npm.cmd run serve`. El servidor escucha en
   `http://localhost:5500`. Las pruebas automatizadas usan dobles REST/WSS.
   Durante un ensayo real abre la página con el vehículo aislado y la
   ventana de prueba supervisada. Introduce la clave de operador en el
   diálogo de la aplicación.

```powershell
$arduinoCli = 'C:\Users\joseh\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'
$simBuild = Join-Path $env:TEMP 'node01-simulado'
& $arduinoCli version
& $arduinoCli core list
& $arduinoCli compile --fqbn esp8266:esp8266:nodemcuv2 --warnings all --output-dir $simBuild .\firmware\Node01Privado
if ($LASTEXITCODE) { throw 'Revisa la compilación de banco simulado.' }
```

Ejecuta ese bloque desde la carpeta que contiene `firmware`. Usa las
opciones del README del sketch para compilar WSS con salidas simuladas
antes de preparar una compilación que active GPIO.

## 2. Preparar FastAPI en EC2 de Windows

Ejecuta este apartado durante tu ventana de mantenimiento. Transfiere
`NODE01_Backend_Integrado.bundle` a `C:\IoT\transferencia` por el canal
privado usual. Guarda la revisión impresa como punto de reversión.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\IoT\api-vehiculo-iot'
if (@(git status --porcelain).Count) { throw 'Conserva primero el trabajo local de EC2.' }
$previous = git rev-parse HEAD
if ($LASTEXITCODE) { throw 'No se pudo identificar la revisión instalada.' }
$previous
$backendBundle = 'C:\IoT\transferencia\NODE01_Backend_Integrado.bundle'
git bundle verify $backendBundle
if ($LASTEXITCODE) { throw 'No se pudo verificar el bundle.' }
git fetch $backendBundle refs/heads/codex/control-continuo-iot
if ($LASTEXITCODE) { throw 'No se pudo importar la rama.' }
git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE) { throw 'La revisión de EC2 diverge del bundle. Revisa el historial.' }
git rev-parse HEAD
```

Agrega los ajustes en el `.env` protegido mediante un editor local. Genera
el token dedicado en privado y copia el mismo valor al encabezado local del
dispositivo. Mantén los indicadores en `0` para el arranque de comprobación.

```dotenv
IOT_CONTINUOUS_ENABLED=0
IOT_CONTINUOUS_DIAGONALS=0
IOT_CONTINUOUS_REMOTE_DEMO=0
IOT_CONTINUOUS_DEVICE_TOKEN=<token privado de 32 a 256 caracteres ASCII sin espacios>
```

Usa la configuración WinSW existente de FastAPI con un único worker. Este
bloque reinicia `ApiVehiculoIoT` y espera salud. Si Windows registra
`CaddyVehiculoIoT` como dependiente activo, el bloque se detiene antes de
hacer cambios. En esa instalación, programa la breve pausa del proxy
expresamente. Puedes detener Caddy, ejecutar el bloque y arrancarlo después
de que confirme salud. Conserva sus archivos de configuración y RDS.

```powershell
$apiService = Get-Service -Name ApiVehiculoIoT -ErrorAction Stop
$activeDependencies = @($apiService.DependentServices | Where-Object Status -ne 'Stopped')
if ($activeDependencies.Count) {
    $activeDependencies | Select-Object Name,Status
    throw 'Hay servicios dependientes activos. Coordina primero una ventana de mantenimiento.'
}
Restart-Service -Name ApiVehiculoIoT -ErrorAction Stop
$apiReady = $false
for ($i = 0; $i -lt 20 -and -not $apiReady; $i++) {
    try {
        $apiReady = (Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2).status -eq 'ok'
    } catch {}
    if (-not $apiReady) { Start-Sleep -Seconds 1 }
}
if (-not $apiReady) { throw 'FastAPI sigue sin responder en 127.0.0.1:8000.' }
Invoke-RestMethod 'http://127.0.0.1:8000/vehiculos/1/control/capacidad' -TimeoutSec 5 |
    Select-Object habilitado,disponible,diagonales,ttl_ms,renovar_ms
```

Si era necesario parar el proxy, ejecuta `Stop-Service CaddyVehiculoIoT`
antes del bloque y `Start-Service CaddyVehiculoIoT` una vez confirmada
la salud. Comprueba `https://184-72-72-255.sslip.io/health` y
`/health/db` por separado. Con la tracción y grúa todavía aisladas,
cambia `IOT_CONTINUOUS_ENABLED` a `1` y reinicia FastAPI otra vez.
Comprueba que `disponible` solo pase a `true` cuando el firmware abra
`/ws/dispositivos/1` y el backend valide un latido del equipo.

## 3. Verificar el circuito con la tracción desconectada

Confirma con un multímetro el pin OE del 74HCT595 y la polaridad de cada
optoacoplador. El sketch recuperado usa D7 para datos, D5 para reloj y D6
para latch. OE del registro es activo en bajo. Cuando OE está alto, Q0–Q7
quedan en alta impedancia. Mide que el circuito siguiente quede realmente
inactivo durante ese estado, incluso durante el arranque y el reset.
[Ficha técnica del 74HCT595 de Nexperia](https://assets.nexperia.com/documents/data-sheet/74HC_HCT595.pdf)

Si el registro trabaja a 5 V, verifica la interfaz de OE con el ESP8266
encendido, en reset y sin alimentación. Una elevación de OE del lado
del registro debe aislarse del GPIO de 3,3 V. Prueba el estado inactivo
en el lado del mando antes de conectar actuadores.

Timer1 eleva OE al vencer el permiso incluso si la espera de red ocupa
`loop()` mientras las interrupciones sigan atendidas. La compilación
física exige además un supervisor externo que corte al perder flancos
del GPIO de latido durante una solicitud de habilitación. En neutral se
inhiben las salidas. Tras un fallo, el supervisor debe exigir neutral
verificado y rearme explícito. Mide el circuito para elegir los pines y
el plazo `NODE01_EXTERNAL_WATCHDOG_MS`.
Valida el corte independiente y el rearme en neutral antes de activar
`NODE01_PHYSICAL_OUTPUTS` y `NODE01_EXTERNAL_FAILSAFE_VERIFIED`.

Cuando autorices la carga de banco, compila la variante elegida con
`--output-dir` en una carpeta de uso privado. Empieza por la variante
WSS simulada y comprueba enlace y neutral. Después repite con GPIO
solo tras validar el supervisor externo y con las cargas aún aisladas.
Si abres el puerto serie en Arduino IDE, ciérralo antes de cargar.

```powershell
& $arduinoCli board list
$espPort = Read-Host 'Puerto COM del NodeMCU que acabas de conectar'
$benchBuild = Read-Host 'Ruta de salida de la compilación privada para esta etapa'
if (-not (Test-Path -LiteralPath (Join-Path $benchBuild 'Node01Privado.ino.bin'))) {
    throw 'Selecciona la carpeta que contiene el binario compilado para esta etapa.'
}
& $arduinoCli upload --fqbn esp8266:esp8266:nodemcuv2 --port $espPort --input-dir $benchBuild
if ($LASTEXITCODE) { throw 'Revisa la carga antes de continuar.' }
& $arduinoCli monitor --port $espPort --config baudrate=115200
```

| Orden | Salidas esperadas |
| --- | --- |
| Avanzar y girar a la izquierda | Q1 + Q0, `0x03` |
| Avanzar y girar a la derecha | Q1 + Q7, `0x82` |
| Retroceder y girar a la izquierda | Q4 + Q0, `0x11` |
| Retroceder y girar a la derecha | Q4 + Q7, `0x90` |
| Velocidad, subir grúa y bajar grúa | Q2, Q3 y Q6 respectivamente |
| Demo del control | Q5. Déjalo deshabilitado hasta medir si el mando inicia una rutina autónoma y cómo se detiene. |

1. Conecta el analizador a latch, OE, el latido externo y las salidas
   indicadas. Verifica que arranque, reset y desconexión permanezcan en
   neutral. Comprueba también el estado aguas abajo de OE y que retomar
   los flancos tras un corte no rearme una orden anterior.
2. Mantén cada eje durante varios ciclos. Cambia de eje, suelta, pierde la
   captura del puntero, cambia de pestaña y pulsa DETENER durante una orden.
   Registra el instante del último latido, la consigna neutral y el cambio
   eléctrico. Repite con un POST demorado y con el Wi-Fi interrumpido.
3. Retén el procesamiento de la red y comprueba que el permiso eléctrico
   caduque durante el bloqueo. La simulación del protocolo no mide el corte
   de OE. Verifica el comportamiento durante reset y ante pérdida de
   alimentación. Usa un corte de tracción independiente para ensayar
   condiciones en que el microcontrolador deje de atender interrupciones.
4. Verifica que reconectar no reanude una orden anterior. Tras la parada
   exige un gesto nuevo. Comprueba también que una respuesta fuera de plazo
   y un paso de DEMO cancelado no vuelvan a habilitar salidas.
5. Verifica cada par diagonal en el registro y después en las entradas del
   mando, incluidos consumo y polaridad con dos optoacopladores activos.
   Con la tracción aislada puedes habilitar `IOT_CONTINUOUS_DIAGONALS=1`
   temporalmente para la medición. Deja el indicador en `0` si el receptor
   interpreta un par de forma inesperada.
6. Comprueba los controles auxiliares y cada DEMO seleccionada desde la
   API. Verifica duraciones, pausas, cancelación y DETENER entre pasos.
   Comprueba que el historial conserva los comandos individuales y que
   las renovaciones y los pasos DEMO no crean filas individuales nuevas.
7. Resume por separado la latencia HTTP mostrada por la interfaz, la
   latencia reto/respuesta que registra el dispositivo y el tiempo eléctrico
   que mide el analizador. Evita exportar encabezados, tokens o la red
   guardada. Un HTTP 200 registra la confirmación lógica de DETENER.

## 4. Promover o revertir

Mantén la tracción aislada hasta completar los ensayos de corte y validar
qué hace el receptor con los dos ejes. Conserva `IOT_CONTINUOUS_REMOTE_DEMO=0`
si el mando sigue una secuencia autónoma que el canal privado no puede
interrumpir. Puedes ejecutar las DEMO de pasos controladas por el servidor
con las salidas habilitadas y supervisión de banco.

Cuando el backend y el dispositivo hayan pasado la comprobación, incorpora
el frontend con un avance de Git. La actualización sigue usando la raíz
de `main` en GitHub Pages.

```powershell
Set-Location 'C:\Users\joseh\Downloads\control-iot-jack'
if (@(git status --porcelain).Count) { throw 'Conserva primero el trabajo local.' }
git fetch .\entregables\NODE01_Frontend_Integrado.bundle refs/heads/codex/control-sostenido-node01
if ($LASTEXITCODE) { throw 'No se pudo importar la rama del frontend.' }
git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE) { throw 'La rama diverge del bundle. Revisa el historial.' }
npm.cmd test
if ($LASTEXITCODE) { throw 'Revisa las pruebas del frontend.' }
git push origin HEAD:refs/heads/main
```

Para revertir el ensayo, desconecta primero la tracción y las cargas,
cambia `IOT_CONTINUOUS_ENABLED` a `0` y reinicia FastAPI. Comprueba
`habilitado=false`. Si necesitas revertir el backend, recupera la revisión
guardada en `$previous` con el árbol limpio usando
`git switch --detach $previous` y vuelve a comprobar salud. Conserva el
respaldo del firmware anterior en privado.

## Pruebas realizadas

| Componente | Resultado local |
| --- | --- |
| Frontend | 102 pruebas de Node.js. Chromium pasó 24 escenarios con dobles REST/WSS y las tres vistas en 12 tamaños. Cero POST reales. |
| FastAPI | 196 pruebas. Incluyen CORS, barrera anterior a STOP, transacción demorada, cancelación durante la carga de un plan y reconexión durante la pausa de DEMO. RDS se sustituyó con dobles en las pruebas. |
| Firmware | 12 escenarios C++ de retos, caducidad, pulsos y actuación simulada. Compilación NodeMCU v2 en modo simulado, WSS simulado y GPIO con parámetros ficticios. ISR de Timer1 comprobada en IRAM con `objdump`. |
| Vehículo | Quedan por medir el corte eléctrico, la respuesta del receptor a los pares diagonales y los tiempos de actuación. |
