import React, { useState } from 'react';
import { ArrowRight, BookOpen, X } from 'lucide-react';
import { SectionType, useVault } from '../../context/VaultContext';

type Entry = { title: string; description: string; section: SectionType; locked?: boolean };
const guidance: Partial<Record<SectionType, string[]>> = {
  dashboard: ['Usa el filtro superior para cambiar entre información de negocio y personal. Los indicadores financieros y de seguimiento responden al ámbito seleccionado.', '«Acciones recomendadas» reúne alertas de seguridad, cuentas y vencimientos con acceso a la ficha para corregirlas.', '«Flujo previsto» proyecta hasta 90 días con fechas registradas. Las igualas marcadas como recurrentes se estiman mes a mes; revisa la cotización y las fechas antes de tomar decisiones.', 'En Informes y actividad reciente abre los apartados completos; esos registros son generales y no dependen del filtro de ámbito.'],
  capture: ['Elige un giro y una zona y pulsa «Buscar zona», o mueve el mapa y busca en el área visible.', 'Abre un resultado para revisar sus datos y selecciona «Guardar» solo en los negocios que quieras convertir en prospectos. Los datos provienen de OpenStreetMap.'],
  prospects: ['Busca por empresa, contacto o sitio y abre un prospecto para consultar su ficha y estado.', 'Las acciones de WhatsApp, correo y plantilla preparan el mensaje. Después de enviarlo, elige el canal y usa «Registrar contacto» para conservar el seguimiento.'],
  emails: ['Abre una cuenta para consultar sus relaciones, datos de recuperación y protección en dos pasos.', 'Despliega «Comprobar configuración del dominio de correo» para consultar SPF y DMARC. DKIM requiere el selector de tu proveedor. El análisis solo consulta dominios guardados y los registros publicados no garantizan que el correo esté correctamente autenticado.', 'Usa el buscador general con Ctrl+K para localizar elementos sin recorrer todos los apartados.'],
  platforms: ['Abre un servicio para consultar sus datos, cuenta vinculada y credenciales.', 'Registra suscripción y próximas fechas cuando quieras que aparezcan en finanzas y vencimientos.'],
  graph: ['Abre el mapa para explorar cómo se conectan cuentas, servicios y prospectos.', 'Desbloquea la bóveda para cargar las relaciones protegidas.'],
  subscriptions: ['Consulta ingresos, gastos, suscripciones y renovaciones desde las pestañas disponibles.', 'En Resumen general, «Flujo previsto» estima entradas y salidas de 30, 60 y 90 días a partir de fechas guardadas; las igualas recurrentes se proyectan mensualmente y los movimientos en monedas sin cotización se omiten.', 'Configura moneda y presupuesto en Ajustes; revisa el aviso del tipo de cambio antes de interpretar importes convertidos.'],
  passwords: ['Busca y filtra credenciales o recursos protegidos. Abre un elemento para consultar sus datos y copiar lo necesario.', 'En Ajustes → Sesión y portapapeles puedes elegir el tiempo de limpieza y si se permite mostrar contraseñas en pantalla.'],
  writeups: ['Crea o selecciona un informe. En «Área de trabajo» cambia entre informe, pizarra, hallazgos y evidencias; «Detalles» reúne estado, severidad, alcance y relaciones.', 'Abre «Correlaciones» para encontrar informes que comparten CVE, CWE, activo, proyecto o etiquetas. La búsqueda usa los informes cargados; amplíala desde el propio panel y confirma cada coincidencia antes de tratarla como causa común.', 'Escribe Markdown y pega una captura con Ctrl+V. En la barra elige «Bloques» → «Tabla» para rellenar celdas; usa «Dos vistas» para revisar el resultado mientras editas.', 'Los cambios se guardan automáticamente. El estado superior distingue la copia local cifrada del guardado en el servidor; Ctrl+S también guarda. Si aparece «Recuperación local», compara la copia antes de recuperarla.', 'Abre «Historial» para comparar o restaurar revisiones. En «Más acciones» puedes nombrar un hito o duplicar el informe con sus pizarras y hallazgos.', 'Selecciona texto y usa «Censurar» o escribe {{redact:texto}}. Comprueba la vista de cliente y activa la censura al exportar; HTML puede incluir un índice de encabezados.', 'Selecciona un fragmento y usa «Citar» para llevarlo a una pizarra. Las citas desactualizadas se señalan cuando cambia el texto vinculado.'],
  security_audit: ['Revisa los resultados de contraseñas repetidas o débiles y cuentas sin segundo factor.', 'Usa el buscador de cada sección para localizar un elemento y abre su ficha para corregirlo.'],
  c2_hosts: ['Desbloquea la bóveda e inicia sesión con una cuenta Propietario en Accesos del equipo.', 'Inicia C2 desde el menú de LESSSO en la computadora donde está instalado; selecciona la interfaz y el alcance autorizado antes de trabajar.'],
  c2_topo: ['Usa la topología para revisar los dispositivos y sus relaciones dentro del alcance seleccionado.', 'Comprueba la interfaz y actualiza los datos del laboratorio cuando cambie la red.'],
  c2_ports: ['Selecciona el objetivo autorizado y revisa los parámetros antes de iniciar una exploración.', 'Consulta los puertos y servicios detectados; la disponibilidad de opciones depende de los permisos del servicio.'],
  c2_mitm: ['Comprueba que objetivo y puerta de enlace pertenezcan al laboratorio autorizado y selecciona la interfaz apropiada.', 'Revisa el estado del módulo y detén la operación al terminar. La función requiere que C2 esté disponible y puede necesitar privilegios del sistema.'],
  c2_sniff: ['Selecciona la interfaz y, si corresponde, define un filtro antes de capturar.', 'Consulta los eventos en la consola y detén la captura cuando termines.'],
  c2_dns: ['Comprueba el alcance y configura las respuestas DNS para el entorno de prueba.', 'Revisa el estado del módulo y los eventos antes de cerrarlo.'],
  c2_creds: ['Consulta los eventos de credenciales capturados durante pruebas autorizadas.', 'Trata los resultados como información sensible y limita su uso al alcance autorizado.'],
  c2_http: ['Revisa las opciones y objetivos del módulo HTTP antes de iniciarlo.', 'El estado del servicio y la consola permiten detectar errores o requisitos pendientes.'],
  c2_poison: ['Selecciona las opciones del protocolo o WPAD que correspondan al laboratorio.', 'Consulta la consola y detén los módulos activos cuando termines la prueba.'],
  c2_mitm6: ['Verifica la interfaz y el alcance IPv6 autorizado antes de iniciar el módulo.', 'Supervisa los eventos y detén la operación al terminar.'],
  c2_wifi: ['Selecciona el adaptador y revisa los requisitos del modo elegido antes de operar.', 'Las funciones inalámbricas pueden requerir un adaptador compatible y permisos especiales. Usa uno dedicado si necesitas conservar la conexión actual.'],
  c2_camera: ['Busca dispositivos dentro de la red autorizada y revisa los resultados antes de continuar.', 'Las funciones disponibles dependen de los servicios y credenciales del dispositivo.'],
  c2_opsec: ['Consulta primero el estado actual de la interfaz y del equipo.', 'Utiliza las opciones de restauración cuando termines para recuperar la identidad original.'],
  audit_logs: ['Filtra por acción o busca un elemento para encontrar eventos concretos.', 'Abre «Ver más» en un registro para consultar sus detalles y origen.'],
  trash: ['Busca el elemento eliminado y utiliza la opción de restaurar si sigue disponible.', 'La retención se configura en Ajustes; revisa el elemento antes de cualquier eliminación definitiva.'],
  settings: ['Ajusta apariencia, recordatorios, límites, moneda y valores predeterminados en las secciones de Preferencias.', 'Guarda los cambios del bloque correspondiente: algunas secciones tienen su propio botón de guardar.'],
  settings_backup: ['En Importación y respaldos puedes importar contraseñas o descargar un respaldo cifrado.', 'Guarda la contraseña del respaldo y la hoja de recuperación en un lugar seguro; se necesitarán para recuperar la información.'],
  settings_team: ['Con la bóveda abierta, crea la primera cuenta Propietario si todavía no existe o inicia sesión con una cuenta existente.', 'La cuenta del equipo y la bóveda usan accesos distintos. El propietario administra usuarios y permisos y permite acceder a Red y Lab.'],
};
const groups: { id: string; title: string; entries: Entry[] }[] = [
  { id: 'inicio', title: 'Inicio y prospección', entries: [
    { title: 'Resumen general', section: 'dashboard', description: 'Consulta indicadores, acciones priorizadas, vencimientos y una previsión de caja de 90 días.' },
    { title: 'Captación en mapa', section: 'capture', locked: true, description: 'Busca negocios por giro y zona o en el área visible. Revisa los resultados antes de guardarlos como prospectos.' },
    { title: 'Prospectos', section: 'prospects', locked: true, description: 'Organiza oportunidades y seguimientos; consulta sus relaciones y datos de contacto.' },
  ] },
  { id: 'operacion', title: 'Servicios y finanzas', entries: [
    { title: 'Correos principales', section: 'emails', locked: true, description: 'Registra cuentas, recuperación, segundo factor y revisa la publicación de SPF, DKIM y DMARC.' },
    { title: 'Servicios vinculados', section: 'platforms', description: 'Relaciona servicios con cuentas y consulta sus datos y credenciales.' },
    { title: 'Conexiones', section: 'graph', locked: true, description: 'Visualiza relaciones entre correos, servicios y otros elementos.' },
    { title: 'Ingresos y gastos', section: 'subscriptions', description: 'Controla suscripciones, ingresos, vencimientos y pagos; el resumen también estima los próximos movimientos.' },
  ] },
  { id: 'seguridad', title: 'Seguridad e informes', entries: [
    { title: 'Contraseñas y notas', section: 'passwords', locked: true, description: 'Guarda y consulta recursos protegidos; el portapapeles puede limpiarse automáticamente.' },
    { title: 'Informes de seguridad', section: 'writeups', locked: true, description: 'Escribe Markdown, correlaciona hallazgos entre informes, pega capturas y usa pizarras. El autoguardado y el historial permiten recuperar versiones; exporta una vista interna o censurada.' },
    { title: 'Auditoría de seguridad', section: 'security_audit', locked: true, description: 'Revisa señales como contraseñas repetidas o cuentas sin protección adicional.' },
  ] },
  { id: 'laboratorio', title: 'Red y Lab', entries: [
    { title: 'Hosts', section: 'c2_hosts', locked: true, description: 'Descubre equipos autorizados y selecciona objetivos para el laboratorio.' },
    { title: 'Topología', section: 'c2_topo', locked: true, description: 'Organiza las relaciones entre dispositivos en un mapa de red.' },
    { title: 'Puertos', section: 'c2_ports', locked: true, description: 'Consulta puertos y servicios de los objetivos seleccionados.' },
    { title: 'MITM (ARP)', section: 'c2_mitm', locked: true, description: 'Configura pruebas de intermediación ARP entre equipos autorizados.' },
    { title: 'Sniffer', section: 'c2_sniff', locked: true, description: 'Captura tráfico de laboratorio y aplica filtros de paquetes.' },
    { title: 'DNS Spoof', section: 'c2_dns', locked: true, description: 'Define respuestas DNS para pruebas controladas.' },
    { title: 'Credenciales', section: 'c2_creds', locked: true, description: 'Consulta las credenciales y sesiones capturadas durante una prueba autorizada.' },
    { title: 'HTTP Inject', section: 'c2_http', locked: true, description: 'Configura pruebas de inyección y tratamiento de tráfico HTTP.' },
    { title: 'Poisoners y mitm6', section: 'c2_poison', locked: true, description: 'Prueba resolución de nombres y WPAD; mitm6 está disponible como apartado independiente.' },
    { title: 'mitm6', section: 'c2_mitm6', locked: true, description: 'Configura pruebas de red IPv6 en el laboratorio.' },
    { title: 'Wi-Fi', section: 'c2_wifi', locked: true, description: 'Revisa herramientas inalámbricas; algunas requieren un adaptador y permisos específicos.' },
    { title: 'Cámaras', section: 'c2_camera', locked: true, description: 'Descubre y revisa dispositivos de cámara en el laboratorio.' },
    { title: 'Identidad OPSEC', section: 'c2_opsec', locked: true, description: 'Consulta y administra cambios reversibles de identidad del equipo.' },
  ] },
  { id: 'administracion', title: 'Actividad y ajustes', entries: [
    { title: 'Historial de actividad', section: 'audit_logs', locked: true, description: 'Consulta los eventos registrados y utiliza los filtros para encontrarlos.' },
    { title: 'Papelera', section: 'trash', locked: true, description: 'Revisa y restaura elementos eliminados que todavía estén disponibles.' },
    { title: 'Preferencias', section: 'settings', locked: true, description: 'Ajusta apariencia, tiempo de bloqueo, portapapeles, recordatorios y datos predeterminados.' },
    { title: 'Importación y respaldos', section: 'settings_backup', locked: true, description: 'Importa información y prepara respaldos cifrados o una hoja de recuperación.' },
    { title: 'Accesos del equipo', section: 'settings_team', locked: true, description: 'Crea la primera cuenta Propietario, inicia sesión y administra usuarios y permisos.' },
  ] },
];

export const HelpView: React.FC = () => {
  const { isSetup, isUnlocked, openUnlockModal, setActiveSection } = useVault();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleGroups = groups.map((group) => ({ ...group, entries: group.entries.filter((entry) =>
    !normalizedQuery || [group.title, entry.title, entry.description, ...(guidance[entry.section] || [])].join(' ').toLocaleLowerCase('es').includes(normalizedQuery),
  ) })).filter((group) => group.entries.length > 0);
  const [stepsOpen, setStepsOpen] = useState(() => {
    try { return localStorage.getItem('lessso-first-steps-dismissed') !== '1'; } catch { return true; }
  });
  const closeSteps = () => {
    setStepsOpen(false);
    try { localStorage.setItem('lessso-first-steps-dismissed', '1'); } catch { /* The guide still closes for this visit. */ }
  };
  const go = (section: SectionType, locked = false) => {
    if (locked && !isUnlocked) { openUnlockModal(); return; }
    setActiveSection(section);
  };
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-obsidian-border pb-5">
      <div><h2 className="font-serif text-2xl font-semibold text-white">Guía de LESSSO</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-obsidian-muted">Busca un apartado y abre sus instrucciones para conocer sus herramientas y funciones.</p></div>
      {!stepsOpen && <button type="button" onClick={() => setStepsOpen(true)} className="ui-action-secondary">{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}Ver primeros pasos</button>}
    </div>
    {stepsOpen && <section aria-labelledby="first-steps-title" className="mt-6 rounded-lg border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4"><div><h3 id="first-steps-title" className="text-base font-semibold text-white">Primeros pasos</h3><p className="mt-1 text-sm text-obsidian-muted">Configura tu espacio en tres pasos. Puedes volver a esta guía cuando quieras.</p></div><button type="button" onClick={closeSteps} aria-label="Cerrar primeros pasos" className="ui-action-icon">{/* [Icono] Acción identificada por su nombre accesible. */}<X size={16} aria-hidden="true" /></button></div>
      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        <li><h4 className="font-semibold text-white">1. Protege la bóveda</h4><p className="mt-1 text-sm leading-6 text-obsidian-muted">{isSetup ? 'Desbloquéala con tu contraseña para acceder a tus datos.' : 'Crea una contraseña para proteger tus datos.'}</p><button type="button" onClick={openUnlockModal} className="ui-action-secondary mt-2 items-center">{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}{isSetup ? 'Abrir bóveda' : 'Crear contraseña'}</button></li>
        <li><h4 className="font-semibold text-white">2. Configura tu cuenta</h4><p className="mt-1 text-sm leading-6 text-obsidian-muted">Crea la cuenta inicial de Propietario o inicia sesión si ya existe. Es distinta de la bóveda.</p><button type="button" onClick={() => go('settings_team', true)} className="ui-nav-action mt-2 items-center">{/* [Navegación] Mantiene disponible esta acción en su contexto. */}Ir a accesos del equipo</button></li>
        <li><h4 className="font-semibold text-white">3. Elige el tiempo de bloqueo</h4><p className="mt-1 text-sm leading-6 text-obsidian-muted">En Sesión y portapapeles define cuándo se bloquea por inactividad y cuánto dura una contraseña copiada.</p><button type="button" onClick={() => go('settings_session', true)} className="ui-nav-action mt-2 items-center">{/* [Navegación] Mantiene disponible esta acción en su contexto. */}Abrir ajustes de sesión</button></li>
      </ol>
      <button type="button" onClick={closeSteps} className="ui-action-secondary mt-5">{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}Cerrar recorrido</button>
    </section>}
    <div className="mt-8 grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Índice de la guía" className="lg:sticky lg:top-4 lg:self-start"><h3 className="flex items-center gap-2 text-sm font-semibold text-white"><BookOpen size={16} className="text-obsidian-accent" /> Índice</h3><ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col">{visibleGroups.map((group) => <li key={group.id}><a className="text-sm text-obsidian-muted underline-offset-4 hover:text-white hover:underline" href={`#guia-${group.id}`}>{group.title}</a></li>)}</ul></nav>
      <div className="min-w-0"><label className="mb-5 block max-w-md text-sm text-obsidian-muted">Buscar en la guía<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. capturas, historial, respaldo…" className="mt-2 block min-h-11 w-full rounded-md border border-obsidian-borderLight bg-obsidian-bg px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent" /></label>
        {visibleGroups.length === 0 && <p role="status" className="py-5 text-sm text-obsidian-muted">No hay resultados. Prueba con otra palabra.</p>}
        {visibleGroups.map((group) => <section key={group.id} id={`guia-${group.id}`} className="scroll-mt-4 border-b border-obsidian-border pb-6 pt-2 last:border-0"><h3 className="font-serif text-lg font-semibold text-white">{group.title}</h3><ul className="mt-2 divide-y divide-obsidian-border">{group.entries.map((entry) => <li key={entry.title} className="py-3"><div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2"><div className="min-w-0 max-w-2xl"><h4 className="text-sm font-medium text-white">{entry.title}</h4><p className="mt-1 text-sm leading-6 text-obsidian-muted">{entry.description}</p></div><button type="button" onClick={() => go(entry.section, entry.locked)} aria-label={`Abrir ${entry.title}`} className="ui-nav-action shrink-0 items-center gap-1">{/* [Navegación] Mantiene disponible esta acción en su contexto. */}Abrir <ArrowRight size={15} /></button></div><details className="mt-2 text-sm"><summary className="w-fit cursor-pointer inline-flex min-h-11 items-center py-1 text-obsidian-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">Cómo usar y funciones</summary><ul className="mt-2 max-w-3xl list-disc space-y-2 pl-5 leading-6 text-obsidian-muted">{(guidance[entry.section] || []).map((step) => <li key={step}>{step}</li>)}</ul></details></li>)}</ul></section>)}</div>
    </div>
  </div>;
};
