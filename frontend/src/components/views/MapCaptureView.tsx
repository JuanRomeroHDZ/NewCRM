import React, { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api, OSMBounds, OSMLead, OSMMapConfig, OSMZone } from '../../lib/api';
import { RuntimeMapSector } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { leadWebsite, parseAttribution, popupContent } from './mapCapture/mapCaptureHelpers';

type LeafletMap = any;
type LeafletGlobal = Window & { L?: any };
type CaptureMapConfig = OSMMapConfig & {
  sectors?: RuntimeMapSector[];
};

let leafletScript: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const leafletWindow = window as LeafletGlobal;
  if (leafletWindow.L) return Promise.resolve(leafletWindow.L);
  if (leafletScript) return leafletScript;

  leafletScript = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-leaflet-runtime]');
    const script = existing || document.createElement('script');
    script.dataset.leafletRuntime = 'true';
    script.src = '/vendor/leaflet/leaflet.js';
    script.onload = () =>
      leafletWindow.L ? resolve(leafletWindow.L) : reject(new Error('No se pudo cargar el mapa.'));
    script.onerror = () => reject(new Error('No se pudo cargar el mapa.'));
    if (!existing) document.head.appendChild(script);
  }).catch((error) => {
    leafletScript = null;
    throw error;
  });

  return leafletScript;
}

export const MapCaptureView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, triggerDataReload, runtimeConfig } = useVault();
  const sectorDatalistId = useId();
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMap>>(new Map());
  const searchRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const savingOsmIdsRef = useRef(new Set<string>());

  const [zones, setZones] = useState<OSMZone[]>([]);
  const [mapSectors, setMapSectors] = useState<RuntimeMapSector[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [defaultCity, setDefaultCity] = useState('');
  const [mapAttribution, setMapAttribution] = useState('');
  const [sector, setSector] = useState('');
  const [subsector, setSubsector] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [results, setResults] = useState<OSMLead[] | null>(null);
  const [resultSource, setResultSource] = useState<'cache' | 'openstreetmap' | null>(null);
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingOsmIds, setSavingOsmIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [mobileTab, setMobileTab] = useState<'map' | 'results'>('map');

  const sectors = useMemo(
    () => (mapSectors.length > 0 ? mapSectors : runtimeConfig?.map_sectors || []),
    [mapSectors, runtimeConfig?.map_sectors]
  );

  const parsedAttribution = useMemo(() => parseAttribution(mapAttribution), [mapAttribution]);

  const selectedZoneInfo = useMemo(
    () => zones.find((zone) => zone.slug === selectedZone) || null,
    [zones, selectedZone]
  );

  useEffect(() => {
    if (!isUnlocked) {
      searchRequestIdRef.current += 1;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      if (searchTimeoutRef.current !== null) window.clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
      setMapReady(false);
      setResults(null);
      setResultSource(null);
      setSearchError('');
      setLoading(false);
      return;
    }

    let active = true;
    setMapError('');

    const loadMap = async () => {
      try {
        if (!document.querySelector('link[data-leaflet-styles]')) {
          const styleElement = document.createElement('link');
          styleElement.rel = 'stylesheet';
          styleElement.href = '/vendor/leaflet/leaflet.css';
          styleElement.dataset.leafletStyles = 'true';
          document.head.appendChild(styleElement);
        }

        const [rawConfig, zoneResponse, leaflet] = await Promise.all([
          api.getCaptureMapConfig(),
          api.getCaptureZones(),
          loadLeaflet(),
        ]);
        if (!active || !mapElementRef.current) return;

        const config = rawConfig as CaptureMapConfig;
        setZones(zoneResponse.zones);
        setMapSectors(Array.isArray(config.sectors) ? config.sectors : []);
        setDefaultCity(config.default_city || runtimeConfig?.map_defaults?.default_city || '');
        setMapAttribution(config.attribution || runtimeConfig?.map_defaults?.attribution || '');

        const initialZone =
          zoneResponse.zones.find((zone) => zone.slug === config.default_zone) || zoneResponse.zones[0];
        if (initialZone) setSelectedZone(initialZone.slug);
        if (config.default_sector) {
          setSector((prev) => prev || config.default_sector || '');
        }

        const map = leaflet
          .map(mapElementRef.current, {
            zoomControl: true,
            scrollWheelZoom: false,
          })
          .setView(initialZone?.center || config.center, initialZone?.zoom || config.zoom);

        leaflet
          .tileLayer(config.tile_url_template, {
            maxZoom: 19,
            attribution: config.attribution,
            updateWhenIdle: true,
            keepBuffer: 1,
          })
          .addTo(map);

        const markerLayer = leaflet.layerGroup().addTo(map);
        mapRef.current = map;
        markerLayerRef.current = markerLayer;
        setMapReady(true);
      } catch (error) {
        if (active) setMapError(error instanceof Error ? error.message : 'No se pudo preparar el mapa.');
      }
    };

    loadMap();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      markersRef.current.clear();
      setMapReady(false);
    };
  }, [isUnlocked, mapAttempt]);

  useEffect(() => () => {
    searchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
    if (searchTimeoutRef.current !== null) window.clearTimeout(searchTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!mapReady || !selectedZoneInfo || !mapRef.current) return;
    mapRef.current.flyTo(selectedZoneInfo.center, selectedZoneInfo.zoom, { duration: 0.35 });
  }, [mapReady, selectedZoneInfo]);

  useEffect(() => {
    if (mobileTab !== 'map' || !mapReady) return;
    const raf = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [mobileTab, mapReady]);

  useEffect(() => {
    const element = mapElementRef.current;
    if (!mapReady || !element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => mapRef.current?.invalidateSize?.({ pan: false }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    const layer = markerLayerRef.current;
    layer.clearLayers();
    markersRef.current.clear();
    if (!results) return;

    const leaflet = (window as LeafletGlobal).L;

    results.forEach((lead) => {
      const marker = leaflet.circleMarker([lead.lat, lead.lon], {
        radius: 7,
        color: '#0b1020',
        weight: 2,
        fillColor: '#818cf8',
        fillOpacity: 0.95,
      });
      marker.bindPopup(popupContent(lead));
      layer.addLayer(marker);
      markersRef.current.set(lead.osm_id, marker);
    });
  }, [mapReady, results]);

  const runSearch = useCallback(
    async (bbox?: OSMBounds) => {
      if (!sector.trim() || !selectedZone) {
        setSearchError('Escribe un giro comercial y selecciona una zona.');
        return;
      }
      const requestId = ++searchRequestIdRef.current;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 25_000);
      searchTimeoutRef.current = timeoutId;
      setLoading(true);
      setSearchError('');
      setResults(null);
      setResultSource(null);
      try {
        const response = await api.searchOSMLeads({
          sector: sector.trim(),
          subsector: subsector.trim() || undefined,
          zone: selectedZone,
          bbox,
        }, { signal: controller.signal });
        if (requestId !== searchRequestIdRef.current) return;
        setResults(response.results);
        setResultSource(response.source);
        if (window.matchMedia('(max-width: 1023px)').matches) setMobileTab('results');
      } catch (error) {
        if (requestId === searchRequestIdRef.current) {
          setSearchError(
            timedOut
              ? 'La búsqueda tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'
              : controller.signal.aborted
                ? 'La búsqueda se canceló.'
                : error instanceof Error
                  ? error.message
                  : 'No se pudo completar la búsqueda.'
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (requestId === searchRequestIdRef.current) {
          searchTimeoutRef.current = null;
          searchAbortRef.current = null;
          setLoading(false);
        }
      }
    },
    [sector, subsector, selectedZone]
  );

  const cancelSearch = () => {
    if (!loading) return;
    searchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (searchTimeoutRef.current !== null) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = null;
    setLoading(false);
    setSearchError('La búsqueda se canceló.');
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch();
  };

  const searchMapArea = () => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) {
      setSearchError('Espera a que el mapa termine de cargar.');
      return;
    }
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    runSearch({
      min_lat: southWest.lat,
      min_lon: southWest.lng,
      max_lat: northEast.lat,
      max_lon: northEast.lng,
    });
  };

  const focusLeadOnMap = (lead: OSMLead) => {
    setMobileTab('map');
    requestAnimationFrame(() => {
      mapRef.current?.invalidateSize?.();
      mapRef.current?.panTo([lead.lat, lead.lon], { animate: true });
      markersRef.current.get(lead.osm_id)?.openPopup();
      mapElementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const saveLead = async (lead: OSMLead) => {
    if (!isUnlocked || savingOsmIdsRef.current.has(lead.osm_id) || savedIds.includes(lead.osm_id)) return;
    savingOsmIdsRef.current.add(lead.osm_id);
    setSavingOsmIds((current) => (current.includes(lead.osm_id) ? current : [...current, lead.osm_id]));
    try {
      const website = leadWebsite(lead);
      const sourceNote = [
        `Origen: OpenStreetMap (${lead.osm_id}).`,
        lead.address ? `Dirección publicada: ${lead.address}.` : '',
        lead.email ? `Correo publicado: ${lead.email}.` : '',
        lead.whatsapp ? `WhatsApp publicado explícitamente: ${lead.whatsapp}.` : '',
        lead.opening_hours ? `Horario publicado: ${lead.opening_hours}.` : '',
        website ? `Sitio web publicado: ${website}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      await api.createProspect({
        company_name: lead.name,
        workflow_type: 'direct_quote',
        status: 'nuevo',
        scope: 'business',
        contact_email: lead.email || undefined,
        phones: lead.phone || undefined,
        whatsapp: lead.whatsapp || undefined,
        maps_url: lead.osm_url,
        social_links: website ? JSON.stringify({ website, source: 'openstreetmap', osm_id: lead.osm_id }) : undefined,
        notes: sourceNote,
        tags: [{ name: `OSM: ${lead.category}` }],
      });
      setSavedIds((current) => (current.includes(lead.osm_id) ? current : [...current, lead.osm_id]));
      triggerDataReload();
      showToast(`${lead.name} se guardó como prospecto nuevo.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el prospecto.', 'error');
    } finally {
      savingOsmIdsRef.current.delete(lead.osm_id);
      setSavingOsmIds((current) => current.filter((osmId) => osmId !== lead.osm_id));
    }
  };

  if (!isUnlocked) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 p-5 sm:p-8">
        <div className="rounded-2xl border border-obsidian-border bg-obsidian-card p-5 sm:p-7">
          <ShieldCheck size={24} className="mb-3 text-indigo-300" aria-hidden="true" />
          <h1 className="text-xl font-bold text-white">Captación en mapa</h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-obsidian-muted">
            Desbloquea la bóveda para buscar negocios y guardarlos como prospectos.
          </p>
          <button
            type="button"
            onClick={openUnlockModal}
            className="mt-5 min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            Desbloquear bóveda
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex min-w-0 flex-col gap-3 rounded-2xl border border-obsidian-borderLight bg-gradient-to-r from-obsidian-card via-obsidian-panel to-obsidian-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5 lg:p-7">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3.5">
          <span className="shrink-0 rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-2 text-indigo-300 sm:p-3" aria-hidden="true">
            <MapPin size={19} className="sm:h-[22px] sm:w-[22px]" />
          </span>
          <div className="min-w-0">
            <h1 id="capture-map-heading" className="text-base font-bold tracking-tight text-white sm:text-2xl">Captación en mapa</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-obsidian-muted sm:text-sm">
              Busca negocios publicados en OpenStreetMap dentro de una zona{defaultCity ? ` de ${defaultCity}` : ''} y
              guarda únicamente los que quieras seguir.
            </p>
          </div>
        </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> OpenStreetMap
        </span>
      </header>

      {/* Mobile/Tablet (<lg) tab switch to avoid double-scroll traps */}
      <div
        className="flex items-center gap-1 rounded-xl border border-obsidian-border bg-obsidian-card p-1 lg:hidden"
        role="group"
        aria-label="Mostrar"
      >
        <button
          type="button"
          aria-pressed={mobileTab === 'map'}
          onClick={() => setMobileTab('map')}
          className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-semibold transition-colors ${
            mobileTab === 'map' ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:text-white'
          }`}
        >
          Mapa
        </button>
        <button
          type="button"
          aria-pressed={mobileTab === 'results'}
          onClick={() => setMobileTab('results')}
          className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-semibold transition-colors ${
            mobileTab === 'results' ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:text-white'
          }`}
        >
          Resultados ({results ? results.length : 0})
        </button>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:items-start">
        <section
          aria-label="Mapa de búsqueda"
          className={`min-w-0 overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card ${
            mobileTab === 'map' ? 'block' : 'hidden lg:block'
          }`}
        >
          <form
            onSubmit={handleSearch}
            className="grid gap-3 border-b border-obsidian-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto] sm:items-end"
          >
            <label className="min-w-0 text-xs font-medium text-obsidian-text">
              Giro o negocio
              <input
                list={sectors.length > 0 ? sectorDatalistId : undefined}
                value={sector}
                onChange={(event) => {
                  setSector(event.target.value);
                  setResults(null);
                  setResultSource(null);
                  setSearchError('');
                }}
                disabled={loading}
                maxLength={64}
                required
                placeholder={sectors[0]?.label ? `Ej. ${sectors[0].label}` : 'Giro comercial'}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {sectors.length > 0 && (
                <datalist id={sectorDatalistId}>
                  {sectors.map((item) => (
                    <option key={item.id} value={item.label} />
                  ))}
                </datalist>
              )}
            </label>
            <label className="min-w-0 text-xs font-medium text-obsidian-text">
              Zona
              <select
                value={selectedZone}
                onChange={(event) => {
                  setSelectedZone(event.target.value);
                  setResults(null);
                  setResultSource(null);
                  setSearchError('');
                }}
                disabled={!zones.length || loading}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {zones.map((zone) => (
                  <option key={zone.slug} value={zone.slug}>
                    {zone.zone}
                  </option>
                ))}
              </select>
            </label>
            <button
              type={loading ? 'button' : 'submit'}
              onClick={loading ? cancelSearch : undefined}
              disabled={!loading && !mapReady}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-indigo-950/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            >
              {loading ? <X size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
              {loading ? 'Cancelar búsqueda' : 'Buscar zona'}
            </button>
            <label className="min-w-0 text-xs font-medium text-obsidian-muted sm:col-span-2">
              Filtro opcional
              <input
                value={subsector}
                onChange={(event) => {
                  setSubsector(event.target.value);
                  setResults(null);
                  setResultSource(null);
                  setSearchError('');
                }}
                disabled={loading}
                maxLength={64}
                placeholder="Especialidad o palabra clave opcional"
                className="mt-1.5 min-h-10 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <button
              type="button"
              onClick={searchMapArea}
              disabled={loading || !mapReady}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface px-3 text-xs font-medium text-obsidian-text hover:border-indigo-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            >
              <MapPin size={14} aria-hidden="true" /> Buscar área visible
            </button>

            {sectors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 sm:col-span-3" role="group" aria-label="Giros sugeridos">
                <span className="text-[11px] text-obsidian-muted mr-1">Sugeridos:</span>
                {sectors.map((item) => {
                  const isActive = sector.trim().toLowerCase() === item.label.toLowerCase();
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSector(item.label);
                        setResults(null);
                        setResultSource(null);
                        setSearchError('');
                      }}
                      disabled={loading}
                      aria-pressed={isActive}
                      className={`min-h-[36px] rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                        isActive
                          ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                          : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted hover:border-obsidian-borderLight hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </form>

          {searchError && (
            <p
              role="alert"
              className="flex items-start gap-2 border-b border-rose-500/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {searchError}
            </p>
          )}
          {mapError && (
            <div className="p-4 border-b border-obsidian-border">
              <EmptyState
                icon={AlertCircle}
                tone="error"
                title="No se pudo inicializar el mapa"
                description={mapError}
                actionLabel="Reintentar"
                onAction={() => {
                  setMapError('');
                  setMapAttempt((value) => value + 1);
                }}
              />
            </div>
          )}

          <div
            ref={mapElementRef}
            role="region"
            aria-label={defaultCity ? `Mapa interactivo de ${defaultCity}` : 'Mapa interactivo'}
            className="relative z-0 min-h-[220px] h-[clamp(220px,45dvh,320px)] w-full bg-[#101827] sm:min-h-[300px] sm:h-[clamp(300px,55dvh,420px)] lg:h-[clamp(380px,62dvh,560px)]"
          />
          <div className="flex flex-col gap-1.5 border-t border-obsidian-border px-4 py-3 text-[11px] leading-relaxed text-obsidian-muted sm:flex-row sm:items-center sm:justify-between">
            <span>Los datos de negocios dependen de lo publicado en OpenStreetMap.</span>
            <a
              href="https://www.openstreetmap.org/fixthemap"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-300 underline-offset-4 hover:underline"
            >
              Reportar un problema del mapa <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          aria-labelledby="captura-resultados"
          className={`min-w-0 overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card lg:sticky lg:top-4 ${
            mobileTab === 'results' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-obsidian-border p-4 sm:p-5">
            <div className="min-w-0">
              <h2 id="captura-resultados" className="text-base font-semibold text-white">
                Resultados
              </h2>
              <p aria-live="polite" className="mt-1 text-xs text-obsidian-muted">
                {results ? `${results.length} negocios encontrados` : 'Selecciona un giro y busca en el mapa.'}
              </p>
            </div>
            {resultSource && (
              <span className="shrink-0 rounded-lg border border-obsidian-border bg-obsidian-surface px-2 py-1 text-[10px] font-medium text-obsidian-muted">
                {resultSource === 'cache' ? 'Caché' : 'Consulta reciente'}
              </span>
            )}
          </div>

          {loading ? (
            <div
              role="status"
              className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-obsidian-muted"
            >
              <LoaderCircle size={22} className="animate-spin text-indigo-300" aria-hidden="true" /> Consultando
              OpenStreetMap…
            </div>
          ) : !results ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-obsidian-muted">
              <Building2 size={22} className="text-obsidian-muted/70" aria-hidden="true" />
              {searchError && mobileTab === 'results' ? (
                <div className="lg:hidden" role="alert">
                  <p>{searchError}</p>
                  <button
                    type="button"
                    onClick={() => setMobileTab('map')}
                    className="mt-3 min-h-10 rounded-lg border border-obsidian-border px-3 text-xs font-semibold text-white hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                  >
                    Volver a la búsqueda
                  </button>
                </div>
              ) : !searchError ? (
                <p>Los negocios aparecerán aquí después de una búsqueda.</p>
              ) : null}
            </div>
          ) : results.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-obsidian-muted">
              <Search size={22} className="text-obsidian-muted/70" aria-hidden="true" />
              <p>No encontramos negocios publicados en esta búsqueda. Prueba otro giro o una zona cercana.</p>
            </div>
          ) : (
            <ul className="max-h-[min(55dvh,520px)] divide-y divide-obsidian-border overflow-y-auto lg:max-h-[min(620px,65dvh)]">
              {results.map((lead) => {
                const website = leadWebsite(lead);
                const isSaved = savedIds.includes(lead.osm_id);
                const isSavingThis = savingOsmIds.includes(lead.osm_id);
                return (
                  <li key={lead.osm_id} className="p-4 transition-colors hover:bg-obsidian-surface/40 sm:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => focusLeadOnMap(lead)}
                        aria-label={`Centrar mapa en ${lead.name}`}
                        className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                      >
                        <span className="block break-words text-sm font-semibold text-white">{lead.name}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-obsidian-muted">
                          {lead.category} · {lead.zone}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => saveLead(lead)}
                        disabled={isSaved || isSavingThis}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                        aria-label={isSaved ? `${lead.name} ya está guardado` : `Guardar ${lead.name} como prospecto`}
                      >
                        {isSaved ? (
                          <Check size={14} aria-hidden="true" />
                        ) : isSavingThis ? (
                          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight size={14} aria-hidden="true" />
                        )}
                        <span>{isSaved ? 'Guardado' : isSavingThis ? 'Guardando…' : 'Guardar'}</span>
                      </button>
                    </div>
                    {lead.address && (
                      <p className="mt-2 break-words text-xs leading-relaxed text-obsidian-muted">{lead.address}</p>
                    )}
                    {lead.opening_hours && (
                      <p className="mt-1 break-words text-xs leading-relaxed text-obsidian-muted">
                        Horario publicado: {lead.opening_hours}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                          className="text-obsidian-text underline decoration-obsidian-border underline-offset-4 hover:text-white"
                        >
                          {lead.phone}
                        </a>
                      )}
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="max-w-full break-all text-obsidian-text underline decoration-obsidian-border underline-offset-4 hover:text-white"
                        >
                          {lead.email}
                        </a>
                      )}
                      {lead.whatsapp && (
                        <span className="break-all text-emerald-300">WhatsApp publicado: {lead.whatsapp}</span>
                      )}
                      {website && (
                        <a
                          href={website}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir sitio web de ${lead.name}`}
                          className="max-w-full break-all text-indigo-300 underline underline-offset-4 hover:text-indigo-200"
                        >
                          Sitio web <ExternalLink size={11} className="inline" aria-hidden="true" />
                        </a>
                      )}
                      <a
                        href={lead.osm_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ver ${lead.name} en OpenStreetMap`}
                        className="text-obsidian-muted underline underline-offset-4 hover:text-white"
                      >
                        OpenStreetMap <ExternalLink size={11} className="inline" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-obsidian-border px-4 py-3 text-[10px] leading-relaxed text-obsidian-muted sm:px-5">
            {parsedAttribution.href ? (
              <a
                href={parsedAttribution.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-white"
              >
                {parsedAttribution.text}
              </a>
            ) : (
              <span>{parsedAttribution.text}</span>
            )}{' '}
            ·{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-white"
            >
              ODbL
            </a>
            . Guarda cada prospecto manualmente después de revisar sus datos.
          </div>
        </section>
      </div>
    </div>
  );
};
