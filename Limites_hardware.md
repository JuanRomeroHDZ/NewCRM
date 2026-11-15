# Límites de verificación por hardware

Este archivo conserva las comprobaciones que no se pueden cerrar solo con código o con el laboratorio aislado del equipo.

## Wi‑Fi real

- No se pudo probar el cambio de modo, la captura ni la restauración de Wi‑Fi: el equipo solo muestra la interfaz integrada `wlo1`, que mantiene la conexión de Internet. No hay un adaptador USB Wi‑Fi dedicado disponible.
- No se desconectó la laptop ni se puso `wlo1` en modo monitor. Las funciones que cambian el estado de una radio deben probarse con un adaptador de laboratorio separado y un punto de acceso aislado.
- El preflight del C2 real confirma que `iw` está disponible y que el servicio tiene privilegios de root. Eso no acredita que la tarjeta integrada admita monitor/inyección; no se cambió el modo de `wlo1` ni se desconectó Internet.

## Red y MITM

- El ciclo ARP se verificó en un namespace de red aislado, incluyendo envenenamiento, restauración y recuperación del reenvío IP.
- No se lanzó MITM, captura ni escaneo activo contra el gateway doméstico o equipos de la red habitual. Hacerlo podría interceptar o interrumpir tráfico real.
- Las pantallas del C2, la sesión de Propietario, los preflight y los valores seguros por defecto sí se revisaron en el CRM activo. Esto no sustituye una prueba con tráfico y hardware físicos.

## Para cerrar estas comprobaciones en otra sesión

1. Conectar un adaptador Wi‑Fi USB separado y mantener `wlo1` como conexión habitual.
2. Confirmar que `iw dev` detecta el adaptador dedicado y que no tiene la ruta de Internet.
3. Usar un punto de acceso y objetivos de laboratorio aislados, con el alcance correspondiente registrado en LESSSO.
4. Verificar en ese adaptador los cambios de modo, captura, restauración y limpieza; dejar la conexión de `wlo1` sin cambios.
