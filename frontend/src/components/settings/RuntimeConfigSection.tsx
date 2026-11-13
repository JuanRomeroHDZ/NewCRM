import React, { useEffect, useState } from 'react';
import { FileText, Globe, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { RuntimeMapZone } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';

const SYSTEM_CURRENCIES = [
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', is_base: true },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', is_base: false },
] as const;

const INPUT_CLASS = 'w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none';
const LABEL_CLASS = 'mb-1 block text-xs text-obsidian-muted';

function parseColonias(value: string): { values: string[]; error: string | null } {
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (values.length > 100) return { values, error: 'Cada zona admite hasta 100 colonias.' };
  if (values.some((item) => item.length > 120)) {
    return { values, error: 'Cada colonia puede tener hasta 120 caracteres.' };
  }
  return { values, error: null };
}

export const RuntimeConfigSection: React.FC = () => {
  const {
    runtimeConfig,
    runtimeConfigLoading,
    runtimeConfigError,
    refreshRuntimeConfig,
    triggerDataReload,
    showToast,
  } = useVault();
  const [locale, setLocale] = useState('es-MX');
  const [defaultCity, setDefaultCity] = useState('');
  const [defaultZone, setDefaultZone] = useState('');
  const [defaultSector, setDefaultSector] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLon, setCenterLon] = useState('');
  const [zoom, setZoom] = useState('13');
  const [fullBoundsZone, setFullBoundsZone] = useState('');
  const [mapZones, setMapZones] = useState<RuntimeMapZone[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneColonias, setNewZoneColonias] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [watermark, setWatermark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!runtimeConfig) return;
    setLocale(runtimeConfig.currency_config.locale || 'es-MX');
    setDefaultCity(runtimeConfig.map_defaults.default_city || '');
    setDefaultZone(runtimeConfig.map_defaults.default_zone || '');
    setDefaultSector(runtimeConfig.map_defaults.default_sector || '');
    setCenterLat(String(runtimeConfig.map_defaults.center?.[0] ?? ''));
    setCenterLon(String(runtimeConfig.map_defaults.center?.[1] ?? ''));
    setZoom(String(runtimeConfig.map_defaults.zoom ?? 13));
    setFullBoundsZone(runtimeConfig.map_defaults.full_bounds_zone_slug || '');
    setMapZones(runtimeConfig.map_zones || []);
    setOrganizationName(runtimeConfig.writeup_defaults.organization_name || '');
    setWatermark(runtimeConfig.writeup_defaults.watermark_default || '');
  }, [runtimeConfig]);

  const handleAddZone = () => {
    const name = newZoneName.trim();
    if (!name) {
      showToast('Escribe el nombre de la zona.', 'error');
      return;
    }
    if (mapZones.length >= 100) {
      showToast('El límite es de 100 zonas.', 'error');
      return;
    }
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!slug) {
      showToast('El nombre debe incluir letras o números.', 'error');
      return;
    }
    if (mapZones.some((zone) => zone.slug === slug)) {
      showToast('Ya existe una zona con un nombre similar.', 'error');
      return;
    }

    const lat = Number(centerLat);
    const lon = Number(centerLon);
    const zoneZoom = Number(zoom);
    const parsedColonias = parseColonias(newZoneColonias);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      showToast('El centro del mapa necesita una latitud y longitud válidas.', 'error');
      return;
    }
    if (!Number.isInteger(zoneZoom) || zoneZoom < 1 || zoneZoom > 20) {
      showToast('El acercamiento debe ser un número entero entre 1 y 20.', 'error');
      return;
    }
    if (parsedColonias.error) {
      showToast(parsedColonias.error, 'error');
      return;
    }

    setMapZones((zones) => [...zones, {
      slug,
      zone: name,
      center: [lat, lon],
      zoom: zoneZoom,
      bbox: {
        min_lat: Number(Math.max(-90, lat - 0.05).toFixed(4)),
        max_lat: Number(Math.min(90, lat + 0.05).toFixed(4)),
        min_lon: Number(Math.max(-180, lon - 0.05).toFixed(4)),
        max_lon: Number(Math.min(180, lon + 0.05).toFixed(4)),
      },
      colonias: parsedColonias.values,
    }]);
    if (!defaultZone) setDefaultZone(slug);
    if (!fullBoundsZone) setFullBoundsZone(slug);
    setNewZoneName('');
    setNewZoneColonias('');
  };

  const handleRemoveZone = (slug: string) => {
    if (mapZones.length <= 1) {
      showToast('Debe quedar al menos una zona geográfica.', 'warning');
      return;
    }
    const remaining = mapZones.filter((zone) => zone.slug !== slug);
    const fallback = remaining[0]?.slug || '';
    setMapZones(remaining);
    if (defaultZone === slug) setDefaultZone(fallback);
    if (fullBoundsZone === slug) setFullBoundsZone(fallback);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!runtimeConfig || runtimeConfigLoading || runtimeConfigError) {
      showToast('Carga la configuración actual antes de guardar.', 'warning');
      return;
    }
    const localeValue = locale.trim();
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(localeValue) || localeValue.length > 35) {
      showToast('Escribe un formato regional válido, por ejemplo es-MX.', 'error');
      return;
    }
    if (!defaultCity.trim() || !defaultZone || !defaultSector) {
      showToast('Completa ciudad, zona y sector predeterminados.', 'error');
      return;
    }
    if (!mapZones.some((zone) => zone.slug === defaultZone) || !mapZones.some((zone) => zone.slug === fullBoundsZone)) {
      showToast('Selecciona zonas que sigan disponibles en la lista.', 'error');
      return;
    }
    if (!runtimeConfig.map_sectors.some((sector) => sector.id === defaultSector)) {
      showToast('Selecciona un sector disponible para el mapa.', 'error');
      return;
    }
    const lat = Number(centerLat);
    const lon = Number(centerLon);
    const parsedZoom = Number(zoom);
    if (!centerLat.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      showToast('La latitud debe estar entre -90 y 90.', 'error');
      return;
    }
    if (!centerLon.trim() || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      showToast('La longitud debe estar entre -180 y 180.', 'error');
      return;
    }
    if (!Number.isInteger(parsedZoom) || parsedZoom < 1 || parsedZoom > 20) {
      showToast('El acercamiento debe ser un número entero entre 1 y 20.', 'error');
      return;
    }
    const invalidZone = mapZones.find((zone) => {
      const parsed = parseColonias(zone.colonias.join(', '));
      return parsed.error !== null;
    });
    if (invalidZone) {
      showToast(`Revisa las colonias de ${invalidZone.zone}.`, 'error');
      return;
    }

    setSaving(true);
    try {
      await api.updateRuntimeConfig({
        currencies: SYSTEM_CURRENCIES.map((currency) => ({ ...currency })),
        currency_config: {
          base_currency: 'MXN',
          exchange_pair: { base: 'USD', target: 'MXN' },
          locale: localeValue,
        },
        map_defaults: {
          default_city: defaultCity.trim(),
          default_zone: defaultZone,
          default_sector: defaultSector,
          center: [lat, lon],
          zoom: parsedZoom,
          max_search_area_deg: runtimeConfig.map_defaults.max_search_area_deg,
          full_bounds_zone_slug: fullBoundsZone,
          tile_url_template: runtimeConfig.map_defaults.tile_url_template,
          attribution: runtimeConfig.map_defaults.attribution,
        },
        map_zones: mapZones,
        writeup_defaults: {
          organization_name: organizationName.trim(),
          watermark_default: watermark.trim(),
        },
      });
      const refreshed = await refreshRuntimeConfig();
      triggerDataReload();
      if (!refreshed) {
        showToast('Se guardó, pero no se pudo actualizar la vista. Reintenta la carga.', 'warning');
        return;
      }
      showToast('Configuración de moneda, mapa e informes guardada.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'No se pudo guardar la configuración.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const configUnavailable = !runtimeConfig || runtimeConfigLoading || Boolean(runtimeConfigError);

  return (
    <form onSubmit={handleSave} className="min-w-0 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:space-y-5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Globe size={16} className="shrink-0 text-cyan-400" aria-hidden="true" />
          <h3 className="text-sm font-bold text-white">Monedas, mapa e informes</h3>
          <InfoTooltip content="Configura el formato de moneda, la ubicación de búsqueda y los datos de los informes." />
        </div>
        <button
          type="submit"
          disabled={saving || configUnavailable}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
        >
          <Save size={13} aria-hidden="true" />
          <span>{saving ? 'Guardando…' : 'Guardar'}</span>
        </button>
      </div>

      {runtimeConfigLoading && (
        <p role="status" className="rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-xs text-obsidian-muted">
          Cargando configuración…
        </p>
      )}
      {runtimeConfigError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <span>No se pudo cargar la configuración actual. Vuelve a intentarlo antes de guardar.</span>
          <button
            type="button"
            onClick={() => void refreshRuntimeConfig()}
            disabled={runtimeConfigLoading}
            className="font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            Reintentar
          </button>
        </div>
      )}
      {!runtimeConfig && !runtimeConfigLoading && !runtimeConfigError && (
        <p role="status" className="text-xs text-obsidian-muted">Preparando configuración…</p>
      )}

      <fieldset disabled={configUnavailable || saving} className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
        <section className="space-y-3 text-xs">
          <h4 className="font-semibold text-white">Monedas y formato</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2">
              <p className="mb-1 text-obsidian-muted">Moneda principal</p>
              <p className="font-semibold text-white">MXN · Peso mexicano</p>
            </div>
            <div className="rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2">
              <p className="mb-1 text-obsidian-muted">Conversión disponible</p>
              <p className="font-semibold text-white">USD a MXN</p>
            </div>
            <div>
              <label htmlFor="rt-locale" className={LABEL_CLASS}>Formato regional</label>
              <input id="rt-locale" type="text" maxLength={35} value={locale} onChange={(event) => setLocale(event.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <p className="text-obsidian-muted">Los importes en USD se convierten a MXN con el tipo de cambio configurado.</p>
        </section>

        <section className="space-y-3 border-t border-obsidian-border pt-4 text-xs">
          <h4 className="flex items-center gap-1.5 font-semibold text-white">
            <MapPin size={14} className="text-emerald-400" aria-hidden="true" /> Mapa y zonas
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="rt-map-city" className={LABEL_CLASS}>Ciudad predeterminada</label>
              <input id="rt-map-city" type="text" required maxLength={100} value={defaultCity} onChange={(event) => setDefaultCity(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="rt-map-zone" className={LABEL_CLASS}>Zona predeterminada</label>
              <select id="rt-map-zone" required value={defaultZone} onChange={(event) => setDefaultZone(event.target.value)} className={INPUT_CLASS}>
                {mapZones.map((zone) => <option key={zone.slug} value={zone.slug}>{zone.zone}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rt-map-sector" className={LABEL_CLASS}>Sector predeterminado</label>
              <select id="rt-map-sector" required value={defaultSector} onChange={(event) => setDefaultSector(event.target.value)} className={INPUT_CLASS}>
                {runtimeConfig?.map_sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rt-map-lat" className={LABEL_CLASS}>Latitud central</label>
              <input id="rt-map-lat" type="number" inputMode="decimal" min={-90} max={90} step="any" required value={centerLat} onChange={(event) => setCenterLat(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="rt-map-lon" className={LABEL_CLASS}>Longitud central</label>
              <input id="rt-map-lon" type="number" inputMode="decimal" min={-180} max={180} step="any" required value={centerLon} onChange={(event) => setCenterLon(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="rt-map-zoom" className={LABEL_CLASS}>Acercamiento inicial</label>
              <input id="rt-map-zoom" type="number" min={1} max={20} step={1} required value={zoom} onChange={(event) => setZoom(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="rt-map-full-zone" className={LABEL_CLASS}>Zona amplia para buscar</label>
              <select id="rt-map-full-zone" required value={fullBoundsZone} onChange={(event) => setFullBoundsZone(event.target.value)} className={INPUT_CLASS}>
                {mapZones.map((zone) => <option key={zone.slug} value={zone.slug}>{zone.zone}</option>)}
              </select>
            </div>
          </div>

          {mapZones.map((zone) => (
            <div key={zone.slug} className="grid grid-cols-1 items-center gap-2 border-t border-obsidian-border/70 pt-2 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.5fr)_auto]">
              <label htmlFor={`zone-colonias-${zone.slug}`} className="min-w-0 font-medium text-white">
                <span className="block truncate">{zone.zone}</span>
                <span className="font-mono text-[10px] text-obsidian-muted">{zone.slug}</span>
              </label>
              <input
                id={`zone-colonias-${zone.slug}`}
                type="text"
                maxLength={400}
                value={zone.colonias.join(', ')}
                onChange={(event) => {
                  const parsed = parseColonias(event.target.value);
                  setMapZones((zones) => zones.map((item) => item.slug === zone.slug ? { ...item, colonias: parsed.values } : item));
                }}
                aria-label={`Colonias de ${zone.zone}`}
                placeholder="Colonias separadas por coma"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                aria-label={`Eliminar zona ${zone.zone}`}
                onClick={() => handleRemoveZone(zone.slug)}
                className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-obsidian-border px-3 text-obsidian-muted hover:border-rose-500/50 hover:text-rose-300"
              >
                <Trash2 size={13} aria-hidden="true" />
                <span className="sm:hidden">Eliminar zona</span>
              </button>
            </div>
          ))}

          <div className="grid grid-cols-1 gap-2 border-t border-obsidian-border pt-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_auto]">
            <input type="text" maxLength={80} value={newZoneName} onChange={(event) => setNewZoneName(event.target.value)} aria-label="Nombre de nueva zona geográfica" placeholder="Nueva zona" className={INPUT_CLASS} />
            <input type="text" maxLength={400} value={newZoneColonias} onChange={(event) => setNewZoneColonias(event.target.value)} aria-label="Colonias de la nueva zona" placeholder="Colonias separadas por coma" className={INPUT_CLASS} />
            <button type="button" onClick={handleAddZone} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-obsidian-border px-3 text-xs font-semibold text-white hover:bg-obsidian-surface">
              <Plus size={13} aria-hidden="true" /> Agregar zona
            </button>
          </div>
        </section>

        <section className="space-y-3 border-t border-obsidian-border pt-4 text-xs">
          <h4 className="flex items-center gap-1.5 font-semibold text-white">
            <FileText size={14} className="text-indigo-400" aria-hidden="true" /> Informes de seguridad
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rt-writeup-org" className={LABEL_CLASS}>Organización predeterminada</label>
              <input id="rt-writeup-org" type="text" maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="rt-writeup-watermark" className={LABEL_CLASS}>Marca de agua predeterminada</label>
              <input id="rt-writeup-watermark" type="text" maxLength={180} value={watermark} onChange={(event) => setWatermark(event.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
        </section>
      </fieldset>
    </form>
  );
};
