# Certificado

## Vigilante de Certificados

http://192.168.38.165:9000/voerka/voerkalicensewatcher

## Problema de Compilación

Tras compilar el código del vigilante de certificados, se ejecutará en Electron y se informará un error.

https://github.com/bytenode/bytenode/issues/63

**Motivo**:

El entorno de Node.js dentro de Electron no coincide con el entorno de Node.js compilado externamente.

**Solución**:

Incorpore el proceso de compilación externo original al proceso principal de Electron para la compilación.

**Cómo compilar ahora**:

1. Establezca `LICENSE_BUILD` de la variable de entorno en `true`, inicie el proyecto, espere el aviso de salida del registro y cierre la ejecución del proyecto.

2. Cambie `LICENSE_BUILD` de nuevo a `false`.

P. D. La compilación solo se realiza una vez. Si no ha modificado el código para actualizar el detector de certificados, no es necesario compilarlo, simplemente úselo.

**Actualizar el detector de certificados**:

Extraiga el código, reemplace `src.js` por `src-electron/license/build/src.js` y luego `recompile using electron`.