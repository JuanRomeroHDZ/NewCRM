# Manual Operativo y Guía de Recuperación (Runbook) | Contact LESSSO

Fecha: 2026-10-28.
Propósito: Procedimientos estandarizados paso a paso para el arranque, mantenimiento, recuperación ante incidentes y traspaso entre equipos.

---

## 1. Procedimiento de Arranque tras Corte de Energía o Apagón
1. Verificar que el suministro eléctrico esté estabilizado (se recomienda uso de SAI/UPS en el equipo servidor).
2. Encender el equipo servidor (`lessso-srv`).
3. Comprobar que el servicio Docker esté activo:
   ```bash
   sudo systemctl status docker
   ```
4. Navegar al directorio del proyecto e iniciar los contenedores en orden:
   ```bash
   docker compose up -d
   ```
5. Supervisar el estado de salud de todos los contenedores:
   ```bash
   docker compose ps
   ```
6. Verificar el resumen del arranque y trabajos pendientes en la interfaz o logs:
   ```bash
   docker compose logs backend --tail 50
   ```

---

## 2. Instalación de la Autoridad Certificadora Local (HTTPS) en Dispositivos

El sistema genera una Autoridad Certificadora (CA) privada local guardada en `nginx/certs/ca.crt`. Esta CA debe instalarse una única vez en cada dispositivo cliente de la red local para navegar por HTTPS sin advertencias.

### A. Linux (Ubuntu / Debian)
```bash
sudo cp nginx/certs/ca.crt /usr/local/share/ca-certificates/lessso-ca.crt
sudo update-ca-certificates
```

### B. Windows
1. Abrir el archivo `ca.crt` descargado desde la sección Sistema > Estado del servidor.
2. Hacer clic en "Instalar certificado...".
3. Seleccionar "Equipo local" y dar clic en Siguiente.
4. Seleccionar "Colocar todos los certificados en el siguiente almacén" y examinar.
5. Elegir **"Entidades de certificación raíz de confianza"**.
6. Finalizar el asistente y reiniciar el navegador.

### C. Android
1. Descargar `ca.crt` al dispositivo.
2. Ir a Ajustes > Seguridad y privacidad > Ajustes avanzados > Cifrado y credenciales.
3. Tocar en "Instalar un certificado" > "Certificado de CA".
4. Confirmar el PIN del teléfono y seleccionar el archivo `ca.crt`.
5. Asignar el nombre `Contact LESSSO CA`.

### D. Apple iOS / iPadOS
1. Descargar `ca.crt` en Safari.
2. Ir a Ajustes > Perfil descargado > Instalar.
3. Introducir el código de desbloqueo y confirmar la instalación.
4. Ir a Ajustes > General > Información > Ajustes de confianza de los certificados.
5. Activar la casilla de verificación junto a la CA `Contact LESSSO CA`.

---

## 3. Traspaso del Servidor Activo entre Computadoras
1. **En el Servidor Emisor**:
   - Detener la recepción de peticiones deteniendo los contenedores de forma ordenada:
     ```bash
     docker compose down
     ```
   - Exportar el volcado de datos más reciente con número de secuencia correlativo.
2. **En el Servidor Receptor**:
   - Copiar el respaldo cifrado al almacenamiento local.
   - Verificar la secuencia y autenticidad del archivo con la clave maestra.
   - Configurar el nombre de red o dirección local hacia el nuevo equipo.
   - Iniciar los contenedores:
     ```bash
     docker compose up -d
     ```
   - Validar que las migraciones y tablas se inicialicen de forma limpia.

---

## 4. Rotación de Secretos y Contraseñas
1. Para rotar la contraseña maestra de la bóveda:
   - Ingresar a Sistema > Ajustes y Seguridad.
   - Introducir la contraseña actual y la nueva contraseña.
   - El sistema ejecuta el recifrado atómico de todos los registros en `backend/app/security/rekey.py`.
2. Para rotar claves de APIs externas (Zoho, WhatsApp, Google):
   - Actualizar el valor en la tarjeta de integración correspondiente.
   - Presionar "Probar conexión" para verificar la validez antes de guardar.
