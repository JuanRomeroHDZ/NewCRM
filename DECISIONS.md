# Registro de Decisiones de Arquitectura y Negocio | Contact LESSSO

## 2026-10-28: Conservar la copia local existente
El propietario seleccionó la copia de trabajo actual como base de desarrollo. Todos los cambios preexistentes se preservan.

## 2026-10-28: Omisión temporal de respaldo
Por instrucción explícita del propietario al ejecutar este documento, se omite la generación de respaldo por el momento y se procede de forma continua a través de todas las fases.

## 2026-10-28: Política de tarjetas (Adopción de Opción B)
Para garantizar cumplimiento estricto con PCI DSS y privacidad financiera:
- Se adopta la **Opción B**: se conserva únicamente el alias identificador, la entidad emisora/banco, los últimos 4 dígitos y la fecha de vencimiento cifrada para alimentar recordatorios en la agenda.
- Los números completos de tarjeta y los códigos de seguridad (CVV/CVC) no se migran ni se almacenan bajo ningún concepto.

## 2026-10-28: Parámetro de servidor activo y cero datos de red
El nombre canónico del servidor en red local es `lessso-srv`. Queda estrictamente prohibido escribir direcciones IP, nombres de host o rutas absolutas fijas en el código fuente. Toda configuración se inyecta por variables de entorno y archivos de configuración por equipo.

## 2026-10-28: Sistema de diseño, contraste y tipografía
- **Modo oscuro exclusivo**: La paleta semántica se rige por:
  - Fondo principal: `#080A0A`
  - Superficies y tarjetas: `#081416`
  - Barra lateral y navegación: `#0C1024`
  - Alerta de peligro (solo fondo): `#240B0B`
  - Acción principal, selección y foco: `#A98242`
  - Texto principal: `#FFFFFF`
  - Texto secundario y de error con ratio de contraste WCAG AA superior a 4.5:1.
- **Tipografías locales**: Títulos en Lora Bold y textos en Poppins, servidas localmente desde el proyecto sin dependencias de CDN externos.
- **Sin emojis generados**: Ningún texto, plantilla, notificación o registro generado por el sistema contiene emojis.

## 2026-10-28: Modelo de sesiones en base de datos
Las sesiones de autenticación se migran a la base de datos PostgreSQL con identificadores aleatorios `jti`, control de inactividad, bloqueo por intentos fallidos y revocación remota, eliminando la dependencia de memoria local por proceso.
