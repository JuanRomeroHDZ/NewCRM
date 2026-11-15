# Continuación: informes y editor

## Estado al cerrar esta sesión

- Están publicados el encabezado de navegación contraída, la barra de herramientas sin saltos de fila y las etiquetas con colores y tamaños.
- La portada formal está implementada en HTML, PDF y DOCX. Los formatos Markdown, ZIP, JSON, CSV y SARIF mantienen su estructura de datos.
- La selección «Todas las herramientas» se comprobó visualmente en escritorio: la barra queda en una línea desplazable. La bóveda estaba desbloqueada en la pestaña del CRM.
- Pasaron 57 pruebas de frontend, 19 pruebas de informes/configuración y la prueba de portada PDF/DOCX. El detector de diseño solo informó de la cuadrícula decorativa preexistente de la aplicación.

## Pendiente de comprobación

1. Verificar en móvil y en escritorio que todas las herramientas se alcanzan con teclado y desplazamiento, y que la cabecera lateral se ve correctamente contraída y expandida.
2. En un informe de prueba aislado, insertar etiquetas de cada color y tamaño, guardar, recargar y comprobar vista previa y exportaciones HTML, PDF y DOCX. No modificar ni eliminar los informes reales del usuario.
3. Revisar visualmente las portadas exportadas en PDF y Word, incluyendo textos largos, clasificación y alcance censurado. Comprobar también el formato HTML.
4. Completar la prueba anterior de pegar una captura nueva, guardar, recargar y confirmar que aparece en edición y vista previa.
5. Revisar el comportamiento de etiquetas dentro de bloques de código con delimitadores alternativos y ajustar la sintaxis si es necesario sin alterar las anclas existentes `{#texto}`.

## Contexto

El usuario prefiere jade oscuro como color principal, rojo para seguridad, azul para infraestructura y jade para desarrollo; en contextos neutros usa blanco, dorado y negro. Mantener la bóveda y el guardado de informes. No solicitar contraseñas por chat. No intervenir la interfaz Wi‑Fi activa; las pruebas físicas pendientes están en `Limites_hardware.md`.
