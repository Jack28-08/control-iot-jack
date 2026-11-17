# Prototipo de banco para control direccional NODE/01

Este módulo concentra la validación de los dos ejes, el orden de comandos y
la liberación automática. Las pruebas sustituyen las salidas con un objeto
que guarda los bytes recibidos. El código puede compilarse sin Arduino,
puertos serie, GPIO, Wi-Fi, credenciales ni acceso a AWS. Las diagonales
físicas siguen pendientes de la integración y la prueba en el vehículo.

## Contrato del módulo

El adaptador de transporte autentica el enlace del dispositivo con HTTPS/WSS
privado, valida que este corresponda al vehículo autorizado y lo identifica
con una generación local creciente. Solo ese adaptador puede llamar a
`openAuthenticatedChannel(generación)`. La generación que se adjunta a cada
`Frame` pertenece a esa conexión local. El cliente no la propone en un
mensaje. Cada conexión nueva aplica neutral antes de aceptar una concesión
explícita. Los callbacks del canal anterior conservan su generación y no
pueden afectar el canal nuevo.

| Operación | Datos de la trama | Resultado |
| --- | --- | --- |
| `grant` | Concesión creciente y secuencia creciente. Vigencia entre 1 y 1000 ms en banco. | Autoriza una sola concesión activa. Las salidas permanecen en neutral. |
| `direction` | Concesión activa, secuencia creciente y dos ejes en `{-1,0,1}`. | Escribe una máscara que representa los dos ejes. `(0,0)` tiene prioridad de STOP. |
| `renew` | Concesión activa y secuencia creciente. | Renueva el plazo original por separado. Una orden de dirección no lo renueva. |
| `stop` | Concesión activa o posterior, secuencia positiva. | Aplica neutral e invalida esa concesión, incluso si STOP se procesa antes del permiso o después de una dirección con secuencia mayor. |
| `disconnect` | Generación de la conexión cerrada. | Libera las salidas si corresponde al canal actual. |
| `poll` | Tiempo monotónico local de 32 bits en milisegundos. | Libera la salida al vencer el plazo, aunque no lleguen mensajes. |

La concesión y la secuencia son enteros sin signo de 64 bits y deben empezar
en uno o más. Si se serializan a JSON, usar cadenas decimales canónicas y
validar el rango antes de pasarlas al módulo para evitar pérdida de precisión
en clientes JavaScript. La secuencia es global a la conexión. El primer
movimiento puede tener secuencia mayor que la de su concesión. Un STOP de
una concesión ya superada no afecta una concesión posterior. Un mensaje de
dirección duplicado o fuera de orden no cambia el estado. Ejes fuera de rango
en una orden actual revocan la concesión y liberan las salidas.

El resultado `Applied` representa la aplicación de la máscara al adaptador
de salidas. Para un futuro acuse, devolver vehículo, concesión, secuencia y
resultado y distinguirlo de una observación física. Los límites de tiempo
de producción requieren mediciones y se acuerdan antes de cablear y habilitar.
El enlace autenticado deberá descartar colas de la generación anterior,
validar la vigencia antes de despachar, limitar la frecuencia de renovación
y cancelar la concesión al cerrar la sesión del operador. El módulo no
implementa TLS, autenticación, parseo JSON ni reenvío de eventos públicos.

## Acoplamiento pendiente al 74HCT595

Los sketches de banco `pruebazuwu.ino` y `pruebazuwu1.ino` que se
inspeccionaron tienen la clase `Registro595`. Su método `escribir(byte)`
desplaza el byte y sube el latch una vez. La configuración del sketch usa
D7 para datos, D5 para reloj y D6 para latch. Comprueba que esa revisión y
esos pines corresponden al equipo antes de seguir. La asignación de bits
local es Q0 izquierda, Q1 avance, Q4 retroceso y Q7 derecha. Los cuatro
valores de diagonal que verifica la prueba son `0x03`, `0x82`, `0x11` y
`0x90`. Conserva esos bytes dentro del firmware.

En el sketch confirmado, coloca los dos archivos `directional_control.h` y
`directional_control.cpp` junto al `.ino`. Después de la definición de
`Registro595` se puede adaptar la misma salida con esta clase:

```cpp
class RegistroLatch final : public node01::Latch {
public:
    explicit RegistroLatch(Registro595& registro) : registro_(registro) {}
    void write(std::uint8_t mascara) override { registro_.escribir(mascara); }
private:
    Registro595& registro_;
};
```

Inicializa `Registro595` y escribe cero en `setup()` antes de cualquier
canal remoto. Conserva una sola instancia de `DirectionalControl` en el
bucle del dispositivo. Llama a `poll(millis())` incluso cuando no llegue
tráfico. Todas las escrituras, incluidas velocidad, grúa y DEMO, deberán
pasar por un único arbitraje que pueda cancelar una tarea activa y liberar
las salidas con prioridad. No se debe conectar este adaptador en paralelo
con las órdenes serie del sketch. Para integrar el resto de sus controles,
primero sustituye las esperas con `delay` por estados y temporizadores
no bloqueantes.

Confirma el modo seguro del pin `OE` y de los optoacopladores con el equipo
apagado y durante reset o pérdida de alimentación. En el banco, desacopla
la tracción y verifica que el flanco de latch aplica ambas salidas de cada
par a la vez, dentro del límite de corriente y sin activar los otros
contactos. Verifica que el mando y el receptor interpretan esas pulsaciones
juntas. Prueba desconexión, expiración, STOP con una orden retrasada y
reinicio antes de permitir controles de red. La validación final debe
confirmar el comportamiento con un operador presente y separar el acuse de
salidas de la trayectoria realmente observada.

## Preparación del backend

Usar un canal privado del dispositivo y un contrato de dirección separados
del WSS público de monitoreo. El backend autentica al operador, limita la
concesión al vehículo autorizado, permite una sola concesión y revoca al
recibir STOP o cuando vence la sesión. Bloquea una DEMO y una concesión
direccional simultáneas. No incorpora la capacidad a la evaluación temporal
hasta habilitarla expresamente. El cliente web mantiene previsualización
hasta que la capacidad y el dispositivo estén verificados.

El GET de catálogo y los cuatro POST del operador conservan sus contratos.
La persistencia individual y los 21 procedimientos de RDS se mantienen.
El futuro canal puede emitir telemetría separada de «orden aceptada» y
«salidas aplicadas». Esa telemetría no inserta movimientos en el historial
individual ni reutiliza IDs del catálogo para las combinaciones.
[Auditoría de firmware y API](../../docs/CONTROL_DIRECCIONAL.md).

## Pruebas sin hardware

Desde este directorio, con C++11 y las aserciones habilitadas:

```sh
g++ -std=c++11 -Wall -Wextra -Werror -pedantic directional_control.cpp directional_control_test.cpp -o directional_control_test
./directional_control_test
```

Los seis escenarios cubren el mapa completo, el cambio de diagonal a una
cardinal, la escritura única por cambio de máscara, el STOP con tramas
retrasadas, el límite temporal, el desbordamiento de `millis()`, la
reconexión y los datos incompatibles. Se puede compilar el módulo para
Arduino ESP8266 en modo C++11 con `xtensa-lx106-elf-g++` mediante
`-std=gnu++11 -Wall -Wextra -Werror -Wpedantic -fno-rtti -fno-exceptions -c`.
La compilación genera objetos, sin cargar un programa en una placa.
