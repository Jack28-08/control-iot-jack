# Despliegue coordinado de la práctica 4.3

La revisión de laboratorio usa la rama `codex/practica-4-3` en cada repositorio. Producción se valida con el respaldo propio de RDS y el servicio Windows. El inventario, DDL y resultados adjuntos sobre MySQL Community corresponden a una instancia local aislada. [Inventario inicial](INVENTARIO_4_3.md) · [Verificación MySQL](VERIFICACION_MYSQL_4_3.md)

## 1 Preparar y verificar respaldo

1. Verifica que [GitHub Pages](https://jack28-08.github.io/control-iot-jack/), [Swagger](https://184-72-72-255.sslip.io/docs), `/health` y `/health/db` respondan. Consulta la carga de trabajo y confirma una ventana de mantenimiento y la autorización para RDS.
2. Confirma el destino y registra la revisión de código. Copia el artefacto del backend al servidor por el canal de despliegue aprobado.

```powershell
Set-Location -LiteralPath 'C:\IoT\api-vehiculo-iot'
git status --short --branch
if (git status --porcelain) { throw 'Resolver los cambios locales antes de desplegar' }
$prev43 = (git rev-parse HEAD).Trim()
$oldBranch43 = (git branch --show-current).Trim()
git branch ('codex/respaldo-produccion-43-' + (Get-Date -Format 'yyyyMMdd-HHmm')) $prev43
Get-Service ApiVehiculoIoT,CaddyVehiculoIoT | Format-Table Name,Status
```

3. Prepara un snapshot en la consola RDS o con AWS CLI en el contexto autorizado. Verifica el estado `available` y registra el identificador, versión y punto de recuperación. El snapshot cubre la instancia. Haz también un volcado lógico privado del esquema. La restauración de prueba usa un esquema aislado o una instancia nueva con acceso restringido. [Snapshot de Amazon RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateSnapshot.html)

```powershell
$region43 = Read-Host 'Región AWS de RDS'
$db43 = Read-Host 'Identificador de la instancia RDS'
$snapshot43 = 'node01-pre43-' + (Get-Date -Format 'yyyyMMdd-HHmm')
aws rds create-db-snapshot --region $region43 --db-instance-identifier $db43 --db-snapshot-identifier $snapshot43 --query 'DBSnapshot.Status' --output text
if ($LASTEXITCODE -ne 0) { throw 'No se inició el respaldo' }
aws rds wait db-snapshot-completed --region $region43 --db-snapshot-identifier $snapshot43
if ($LASTEXITCODE -ne 0) { throw 'El snapshot sigue sin confirmar' }
aws rds describe-db-snapshots --region $region43 --db-snapshot-identifier $snapshot43 --query 'DBSnapshots[0].[DBSnapshotIdentifier,EngineVersion,Status]' --output table
```

4. Configura un perfil local de MySQL con permisos revisados. `--password` solicita la contraseña sin mostrarla. Ajusta el archivo CA al certificado vigente de RDS. Guarda huellas y salidas en una carpeta privada fuera de Git. El volcado debe contener estructura, registros y rutinas autorizadas. El esquema original se verifica en restauración, conservando los IDs.

```powershell
$rds43 = Read-Host 'Host autorizado de RDS'
$user43 = Read-Host 'Usuario de mantenimiento RDS'
$schema43 = Read-Host 'Nombre exacto del esquema autorizado'
$ca43 = Read-Host 'Ruta local del certificado CA de RDS'
$backup43 = Join-Path 'C:\IoT\respaldos-privados' $snapshot43
New-Item -Path $backup43 -ItemType Directory -ErrorAction Stop | Out-Null
mysql_config_editor set --login-path=node01-rds-43 --host=$rds43 --user=$user43 --password
if ($LASTEXITCODE -ne 0) { throw 'Perfil de MySQL no disponible' }
$tls43 = @('--login-path=node01-rds-43','--ssl-mode=VERIFY_IDENTITY',"--ssl-ca=$ca43")
mysqldump @tls43 --single-transaction --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF "--result-file=$backup43\backup.sql" $schema43
if ($LASTEXITCODE -ne 0) { throw 'El volcado lógico no se completó' }
mysqldump @tls43 --no-data --routines --no-tablespaces --set-gtid-purged=OFF "--result-file=$backup43\ddl.sql" $schema43
if ($LASTEXITCODE -ne 0) { throw 'El respaldo DDL no se completó' }
Get-FileHash -LiteralPath "$backup43\backup.sql","$backup43\ddl.sql" -Algorithm SHA256
```

Los `DEFINER` y privilegios necesarios para restaurar rutinas se revisan en la instancia de prueba. Nunca se añade el volcado productivo a Git. [Documentación de mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html)

## 2 Preparar backend y aplicar migración aprobada

Desde `C:\IoT\api-vehiculo-iot`, obtén la revisión desde `NODE01_Backend_4_3.bundle`. Conserva `.env` y `.venv`. Elige integración por avance rápido y revisa las ramas si hay divergencia.

```powershell
$bundle43 = Read-Host 'Ruta absoluta del bundle backend 4.3'
git bundle verify $bundle43
if ($LASTEXITCODE -ne 0) { throw 'Bundle incompatible con el historial local' }
git fetch $bundle43 refs/heads/codex/practica-4-3
if ($LASTEXITCODE -ne 0) { throw 'No se obtuvo la revisión 4.3' }
git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'La actualización necesita reconciliar la historia' }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependencias incompletas' }
.\.venv\Scripts\python.exe -m pip check
```

En laboratorio restaura primero el esquema histórico. Ejecuta `000_preflight.sql`, `001_schema.sql` y `003_verify.sql` sobre la copia. Si la copia debe incluir la exhibición, usa un esquema terminado en `_lab` con `SET @iot43_seed_confirm=1;` al principio de una copia temporal de `002_seed_controlado.sql`. Verifica que la unidad resultante está marcada como virtual. El esquema productivo conserva sus datos históricos y no recibe la semilla de laboratorio.

Los siguientes comandos productivos requieren snapshot verificado, restauración de ensayo y autorización expresa. Compara inicialmente seis tablas, 21 procedimientos, índices, referencias huérfanas y conteos. Detén el procedimiento ante discrepancias.

```powershell
$sqlFolder43 = (Resolve-Path -LiteralPath '.\scripts\migrations').Path.Replace('\','/')
mysql @tls43 --batch --database=$schema43 --execute="source $sqlFolder43/000_preflight.sql" |
    Set-Content -LiteralPath (Join-Path $backup43 'preflight-antes.tsv') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'No se pudo auditar el destino' }
# Pausa para revisar destino, conteos, huérfanos y autorización.
mysql @tls43 --database=$schema43 --execute="source $sqlFolder43/001_schema.sql"
if ($LASTEXITCODE -ne 0) { throw 'Migración incompleta. Conservar salida y aplicar plan de recuperación' }
mysql @tls43 --batch --database=$schema43 --execute="source $sqlFolder43/003_verify.sql" |
    Set-Content -LiteralPath (Join-Path $backup43 'verify.tsv') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'No se completó la verificación comercial' }
mysql @tls43 --batch --database=$schema43 --execute="source $sqlFolder43/000_preflight.sql" |
    Set-Content -LiteralPath (Join-Path $backup43 'preflight-despues.tsv') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'No se completó la verificación histórica' }
```

## 3 Activar y verificar servicios

Empieza con `IOT43_ENABLED=false` en el archivo privado `.env` para comprobar compatibilidad histórica. Tras verificar la migración, registra al administrador inicial desde el directorio del backend. Usa su correo y una contraseña única de al menos 12 caracteres. El proceso solicita la contraseña sin eco.

```powershell
.\.venv\Scripts\python.exe -m scripts.crear_admin43
if ($LASTEXITCODE -ne 0) { throw 'Verifica el alta inicial antes de activar 4.3' }
```

Guarda `IOT43_ENABLED=true` en `.env` tras el alta y reinicia en la ventana acordada. Las claves del dispositivo, MySQL y AWS permanecen en sus mecanismos privados. La identidad de dispositivo debe seguir separada. Mantén el número de workers compatible con el estado del broker local.

```powershell
$api43 = Get-Service -Name ApiVehiculoIoT -ErrorAction Stop
$active43 = @($api43.DependentServices | Where-Object Status -eq Running)
if ($active43 | Where-Object Name -ne 'CaddyVehiculoIoT') { throw 'Dependencia no prevista en este procedimiento' }
$resumeCaddy43 = $active43.Name -contains 'CaddyVehiculoIoT'
if ($resumeCaddy43) {
    Stop-Service -Name CaddyVehiculoIoT -ErrorAction Stop
    (Get-Service CaddyVehiculoIoT).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
}
Restart-Service -Name ApiVehiculoIoT -ErrorAction Stop
(Get-Service ApiVehiculoIoT).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
if ($resumeCaddy43) { Start-Service -Name CaddyVehiculoIoT -ErrorAction Stop }
Get-Service ApiVehiculoIoT,CaddyVehiculoIoT | Format-Table Name,Status
$apiPublic43 = 'https://184-72-72-255.sslip.io'
Invoke-RestMethod "$apiPublic43/health" -TimeoutSec 10
Invoke-RestMethod "$apiPublic43/health/db" -TimeoutSec 10
Invoke-RestMethod "$apiPublic43/plataforma/status" -TimeoutSec 10
(Invoke-WebRequest "$apiPublic43/docs" -TimeoutSec 15).StatusCode
```

Con 4.3 activa, confirma identidad Admin y dos compradores distintos en perfiles de navegador limpios. Una cuenta ajena debe recibir rechazo aun conociendo el ID. Comprueba emisión de ticket, conexión WSS, rechazo al reutilizar el ticket y cierre de la suscripción al revocar. La exhibición virtual y los permisos del ESP8266 se prueban por separado. Actúa físicamente solo con el vehículo aislado y bajo supervisión.

## 4 Actualizar Pages y recuperar

Valida el frontend 4.3 con el backend preparado. Si `/plataforma/status` está ausente, el frontend usa el funcionamiento histórico compatible. Comprueba el sitio en la raíz de `main` tras publicar el cambio aprobado. Conserva `entregables`, capturas, adjuntos y credenciales fuera de la publicación.

```powershell
Set-Location -LiteralPath 'C:\Users\joseh\Downloads\control-iot-jack'
git status --short --branch
git bundle verify '.\entregables\practica-4.3\NODE01_Frontend_4_3.bundle'
if ($LASTEXITCODE -ne 0) { throw 'Bundle incompatible con el historial del frontend' }
git fetch origin main
git fetch '.\entregables\practica-4.3\NODE01_Frontend_4_3.bundle' refs/heads/codex/practica-4-3
if ($LASTEXITCODE -ne 0) { throw 'No se obtuvo el frontend 4.3' }
git merge-base --is-ancestor origin/main FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'El sitio publicado requiere integrar divergencias' }
# Solo después de la comprobación y autorización de publicación.
git push origin FETCH_HEAD:refs/heads/main
```

Si falla la validación, revierte la publicación y el backend coordinadamente. Para una regresión comercial con datos previos intactos, conserva las tablas y desactiva 4.3 durante la ventana solo si la exposición histórica está autorizada. Si requiere restauración, recupera el snapshot en otra instancia, compara datos y reconfigura la conexión tras verificar integridad y reconciliar las escrituras posteriores al punto de recuperación. El DDL MySQL puede confirmar implícitamente. [Restauración de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html)
