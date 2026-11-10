# CORS propuesto: pendiente de autorización

Este documento es una propuesta para revisar. No modifica archivos del backend ni despliega cambios en AWS.

Se revisó [app/main.py del backend existente](https://github.com/Jack28-08/api-vehiculo-iot/blob/master/app/main.py), cuyo código no registra `CORSMiddleware`. Eso no determina los headers del despliegue: un proxy podría agregarlos. Un timeout de conexión a HTTPS tampoco prueba un fallo CORS. Es necesario obtener una respuesta real antes de concluirlo.

## Ajuste mínimo para el backend existente

Sólo después de autorización explícita, agregar la importación y el registro al `app/main.py` existente, después de crear `app = FastAPI(...)` y antes de registrar las rutas. Conservar el resto del archivo y la lógica de autenticación.

```python
from fastapi.middleware.cors import CORSMiddleware

# Después de la creación existente de app; no crear otra instancia FastAPI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://jack28-08.github.io",
        "http://localhost:5500",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["X-API-Key", "Content-Type", "Accept"],
)
```

La lista usa orígenes exactos: esquema, dominio y puerto; no incluye `/control-iot-jack/`. No habilita comodines, cookies ni métodos de administración adicionales. `X-API-Key` se permite como header solicitado por el frontend; nunca se escribe su valor aquí. Los POST conservan la validación de operador. CORS no sustituye la autenticación. La configuración corresponde a los parámetros documentados por [FastAPI](https://fastapi.tiangolo.com/tutorial/cors/) y su middleware de [Starlette](https://www.starlette.io/middleware/#corsmiddleware).

Cuando termine el desarrollo local se puede proponer retirar `http://localhost:5500`, mediante otro ajuste autorizado. `http://127.0.0.1:5500` y otros puertos no pertenecen a la lista.

## Verificación sin ejecutar acciones

Primero comprobar AWS desde esta computadora. No usar `-k` ni saltarse una advertencia de certificado:

```powershell
curl.exe --connect-timeout 8 --max-time 15 --include https://184-72-72-255.sslip.io/health
```

Si hay timeout, error DNS o TLS, detener la comprobación funcional y conservar el resultado real. No atribuirlo a RDS o CORS. Si la API responde, comprobar `/health/db` por GET y registrar 200 o 503 reales por separado.

Las siguientes solicitudes usan GET y OPTIONS; el preflight sólo declara el nombre de los headers y no manda una clave ni ejecuta el POST indicado:

```powershell
$originsToCheck = @('http://localhost:5500', 'https://jack28-08.github.io')
foreach ($frontendOrigin in $originsToCheck) {
    Write-Output "Origen evaluado: $frontendOrigin"
    curl.exe --connect-timeout 8 --max-time 15 --include `
      --header "Origin: $frontendOrigin" `
      https://184-72-72-255.sslip.io/health
    curl.exe --connect-timeout 8 --max-time 15 --include --request OPTIONS `
      --header "Origin: $frontendOrigin" `
      --header 'Access-Control-Request-Method: POST' `
      --header 'Access-Control-Request-Headers: x-api-key,content-type,accept' `
      https://184-72-72-255.sslip.io/vehiculos/1/movimientos
}
```

En las respuestas de cada origen permitido revisar `Access-Control-Allow-Origin` igual al origen solicitado. En OPTIONS revisar que los métodos incluyen POST y los headers admiten los tres nombres indicados. Después del parche propuesto, un preflight válido debe responder 200; uno de origen no permitido debe rechazarse. No aceptar `*` como sustituto de la lista. La documentación de [FastAPI explica el preflight](https://fastapi.tiangolo.com/tutorial/cors/#cors-preflight-requests).

`curl.exe` permite inspeccionar headers pero no aplica la política CORS del navegador. La comprobación final requiere abrir `http://localhost:5500` y, después de publicar, GitHub Pages, inspeccionando Console y Network. Swagger comparte el origen de la API y por sí solo no prueba CORS. WSS es una conexión distinta; una falla HTTP no demuestra que WSS o RDS hayan fallado.

No realizar POST de movimiento, DEMO, cancelación ni STOP durante esta verificación. Esas pruebas requieren autorización explícita y operador presente.
