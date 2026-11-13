import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Building2, Check, ExternalLink, LoaderCircle, MapPin, Search, ShieldCheck } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api, OSMBounds, OSMLead, OSMZone } from '../../lib/api';

type LeafletMap = any;
type LeafletGlobal = Window & { L?: any };

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
    script.onload = () => leafletWindow.L ? resolve(leafletWindow.L) : reject(new Error('No se pudo cargar el mapa.'));
    script.onerror = () => reject(new Error('No se pudo cargar el mapa.'));
    if (!existing) document.head.appendChild(script);
  }).catch((error) => {
    leafletScript = null;
    throw error;
  });

  return leafletScript;
}

function safeWebsite(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function popupContent(lead: OSMLead): HTMLElement {
  const container = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = lead.name;
  container.appendChild(title);

  if (lead.address) {
    const address = document.createElement('p');
    address.textContent = lead.address;
    container.appendChild(address);
  }

  if (lead.opening_hours) {
    const openingHours = document.createElement('p');
    openingHours.textContent = `Horario publicado: ${lead.opening_hours}`;
    container.appendChild(openingHours);
  }

  const source = document.createElement('a');
  source.href = lead.osm_url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = 'Ver en OpenStreetMap';
  container.appendChild(source);
  return container;
}

function leadWebsite(lead: OSMLead): string | null {
  return safeWebsite(lead.website);
}

export const MapCaptureView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, triggerDataReload } = useVault();
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMap>>(new Map());

  const [zones, setZones] = useState<OSMZone[]>([]);
  const [selectedZone, setSelectedZone] = useState('zona-rio');
  const [sector, setSector] = useState('dentistas');
  const [subsector, setSubsector] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [results, setResults] = useState<OSMLead[] | null>(null);
  const [resultSource, setResultSource] = useState<'cache' | 'openstreetmap' | null>(null);
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const selectedZoneInfo = useMemo(
    () => zones.find((zone) => zone.slug === selectedZone) || null,
    [zones, selectedZone]
  );

  useEffect(() => {
    if (!isUnlocked) {
      setMapReady(false);
      setResults(null);
      return;
    }

    let active = true;
    let styleElement: HTMLLinkElement | null = null;
    setMapError('');

    const loadMap = async () => {
      try {
        styleElement = document.createElement('link');
        styleElement.rel = 'stylesheet';
        styleElement.href = '/vendor/leaflet/leaflet.css';
        styleElement.dataset.leafletStyles = 'true';
        if (!document.querySelector('link[data-leaflet-styles]')) document.head.appendChild(styleElement);

        const [config, zoneResponse, leaflet] = await Promise.all([
          api.getCaptureMapConfig(),
          api.getCaptureZones(),
          loadLeaflet(),
        ]);
        if (!active || !mapElementRef.current) return;

        setZones(zoneResponse.zones);
        const initialZone = zoneResponse.zones.find((zone) => zone.slug === 'zona-rio') || zoneResponse.zones[0];
        if (initialZone) setSelectedZone(initialZone.slug);

        const map = leaflet.map(mapElementRef.current, {
          zoomControl: true,
          scrollWheelZoom: false,
          tap: true,
        }).setView(initialZone?.center || config.center, initialZone?.zoom || config.zoom);
        leaflet.tileLayer(config.tile_url_template, {
          maxZoom: 19,
          attribution: config.attribution,
          updateWhenIdle: true,
          keepBuffer: 1,
        }).addTo(map);
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
      styleElement?.remove();
    };
  }, [isUnlocked, mapAttempt]);

  useEffect(() => {
    if (!mapReady || !selectedZoneInfo || !mapRef.current) return;
    mapRef.current.flyTo(selectedZoneInfo.center, selectedZoneInfo.zoom, { duration: 0.35 });
  }, [mapReady, selectedZoneInfo]);

  useEffect(() => {
    if (!mapReady || !markerLayerRef.current || !results) return;
    const leaflet = (window as LeafletGlobal).L;
    const layer = markerLayerRef.current;
    layer.clearLayers();
    markersRef.current.clear();

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

  const runSearch = useCallback(async (bbox?: OSMBounds) => {
    if (!sector.trim() || !selectedZone) {
      setSearchError('Escribe un giro comercial y selecciona una zona.');
      return;
    }
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
      });
      setResults(response.results);
      setResultSource(response.source);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'No se pudo completar la búsqueda.');
    } finally {
      setLoading(false);
    }
  }, [sector, subsector, selectedZone]);

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

  const saveLead = async (lead: OSMLead) => {
    if (!isUnlocked || savingId) return;
    setSavingId(lead.osm_id);
    try {
      const website = leadWebsite(lead);
      const sourceNote = [
        `Origen: OpenStreetMap (${lead.osm_id}).`,
        lead.address ? `Dirección publicada: ${lead.address}.` : '',
        lead.email ? `Correo publicado: ${lead.email}.` : '',
        lead.whatsapp ? `WhatsApp publicado explícitamente: ${lead.whatsapp}.` : '',
        lead.opening_hours ? `Horario publicado: ${lead.opening_hours}.` : '',
        website ? `Sitio web publicado: ${website}` : '',
      ].filter(Boolean).join('\n');
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
      setSavedIds((current) => [...current, lead.osm_id]);
      triggerDataReload();
      showToast(`${lead.name} se guardó como prospecto nuevo.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el prospecto.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 p-5 sm:p-8">
        <div className="rounded-2xl border border-obsidian-border bg-obsidian-card p-5 sm:p-7">
          <ShieldCheck size={24} className="mb-3 text-indigo-300" />
          <h1 className="text-xl font-bold text-white">Captación en mapa</h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-obsidian-muted">Desbloquea la bóveda para buscar negocios y guardarlos como prospectos.</p>
          <button type="button" onClick={openUnlockModal} className="mt-5 min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
            Desbloquear bóveda
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-obsidian-borderLight bg-gradient-to-r from-obsidian-card via-obsidian-panel to-obsidian-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-3 text-indigo-300">
            <MapPin size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Captación en mapa</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-obsidian-muted">Busca negocios publicados en OpenStreetMap dentro de una zona de Tijuana y guarda únicamente los que quieras seguir.</p>
          </div>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> OpenStreetMap
        </span>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] xl:items-start">
        <section aria-label="Mapa de búsqueda" className="min-w-0 overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card">
          <form onSubmit={handleSearch} className="grid gap-3 border-b border-obsidian-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto] sm:items-end">
            <label className="min-w-0 text-xs font-medium text-obsidian-text">
              Giro o negocio
              <input value={sector} onChange={(event) => setSector(event.target.value)} maxLength={64} required placeholder="Ej. dentistas" className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </label>
            <label className="min-w-0 text-xs font-medium text-obsidian-text">
              Zona
              <select value={selectedZone} onChange={(event) => { setSelectedZone(event.target.value); setResults(null); setResultSource(null); }} disabled={!zones.length} className="mt-1.5 min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {zones.map((zone) => <option key={zone.slug} value={zone.slug}>{zone.zone}</option>)}
              </select>
            </label>
            <button type="submit" disabled={loading || !mapReady} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-indigo-950/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar zona
            </button>
            <label className="min-w-0 text-xs font-medium text-obsidian-muted sm:col-span-2">
              Filtro opcional
              <input value={subsector} onChange={(event) => setSubsector(event.target.value)} maxLength={64} placeholder="Especialidad, por ejemplo ortodoncia" className="mt-1.5 min-h-10 w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white placeholder:text-obsidian-muted focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </label>
            <button type="button" onClick={searchMapArea} disabled={loading || !mapReady} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface px-3 text-xs font-medium text-obsidian-text hover:border-indigo-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              <MapPin size={14} /> Buscar área visible
            </button>
          </form>

          {searchError && <p role="alert" className="flex items-start gap-2 border-b border-rose-500/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"><AlertCircle size={16} className="mt-0.5 shrink-0" />{searchError}</p>}
          {mapError && <div role="alert" className="flex items-center justify-between gap-3 border-b border-rose-500/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"><span>{mapError}</span><button type="button" onClick={() => { setMapError(''); setMapAttempt((value) => value + 1); }} className="min-h-9 shrink-0 underline underline-offset-4">Reintentar</button></div>}

          <div ref={mapElementRef} role="region" aria-label="Mapa interactivo de Tijuana" className="relative z-0 h-[clamp(10rem,55dvh,20rem)] w-full bg-[#101827] sm:h-[clamp(10rem,55dvh,26.25rem)] xl:h-[clamp(10rem,60dvh,35rem)]" />
          <div className="flex flex-col gap-1.5 border-t border-obsidian-border px-4 py-3 text-[11px] leading-relaxed text-obsidian-muted sm:flex-row sm:items-center sm:justify-between">
            <span>Los datos de negocios dependen de lo publicado en OpenStreetMap.</span>
            <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-300 underline-offset-4 hover:underline">Reportar un problema del mapa <ExternalLink size={11} /></a>
          </div>
        </section>

        <section aria-labelledby="captura-resultados" className="min-w-0 overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-card xl:sticky xl:top-4">
          <div className="flex items-start justify-between gap-3 border-b border-obsidian-border p-4 sm:p-5">
            <div className="min-w-0">
              <h2 id="captura-resultados" className="text-base font-semibold text-white">Resultados</h2>
              <p className="mt-1 text-xs text-obsidian-muted">{results ? `${results.length} negocios encontrados` : 'Selecciona un giro y busca en el mapa.'}</p>
            </div>
            {resultSource && <span className="shrink-0 rounded-lg border border-obsidian-border bg-obsidian-surface px-2 py-1 text-[10px] font-medium text-obsidian-muted">{resultSource === 'cache' ? 'Caché' : 'Consulta reciente'}</span>}
          </div>

          {loading ? (
            <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-obsidian-muted">
              <LoaderCircle size={22} className="animate-spin text-indigo-300" /> Consultando OpenStreetMap…
            </div>
          ) : !results ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-obsidian-muted">
              <Building2 size={22} className="text-obsidian-muted/70" />
              <p>Los negocios aparecerán aquí después de una búsqueda.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-obsidian-muted">
              <Search size={22} className="text-obsidian-muted/70" />
              <p>No encontramos negocios publicados en esta búsqueda. Prueba otro giro o una zona cercana.</p>
            </div>
          ) : (
            <ul className="max-h-[min(620px,65dvh)] divide-y divide-obsidian-border overflow-y-auto">
              {results.map((lead) => {
                const website = leadWebsite(lead);
                const isSaved = savedIds.includes(lead.osm_id);
                return (
                  <li key={lead.osm_id} className="p-4 transition-colors hover:bg-obsidian-surface/40 sm:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button type="button" onClick={() => markersRef.current.get(lead.osm_id)?.openPopup()} className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
                        <span className="block break-words text-sm font-semibold text-white">{lead.name}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-obsidian-muted">{lead.category} · {lead.zone}</span>
                      </button>
                      <button type="button" onClick={() => saveLead(lead)} disabled={isSaved || savingId !== null} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300" aria-label={isSaved ? `${lead.name} ya está guardado` : `Guardar ${lead.name} como prospecto`}>
                        {isSaved ? <Check size={14} /> : savingId === lead.osm_id ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
                        <span>{isSaved ? 'Guardado' : 'Guardar'}</span>
                      </button>
                    </div>
                    {lead.address && <p className="mt-2 break-words text-xs leading-relaxed text-obsidian-muted">{lead.address}</p>}
                    {lead.opening_hours && <p className="mt-1 break-words text-xs leading-relaxed text-obsidian-muted">Horario publicado: {lead.opening_hours}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="text-obsidian-text underline decoration-obsidian-border underline-offset-4 hover:text-white">{lead.phone}</a>}
                      {lead.email && <a href={`mailto:${lead.email}`} className="max-w-full break-all text-obsidian-text underline decoration-obsidian-border underline-offset-4 hover:text-white">{lead.email}</a>}
                      {lead.whatsapp && <span className="break-all text-emerald-300">WhatsApp publicado: {lead.whatsapp}</span>}
                      {website && <a href={website} target="_blank" rel="noopener noreferrer" className="max-w-full break-all text-indigo-300 underline underline-offset-4 hover:text-indigo-200">Sitio web <ExternalLink size={11} className="inline" /></a>}
                      <a href={lead.osm_url} target="_blank" rel="noopener noreferrer" className="text-obsidian-muted underline underline-offset-4 hover:text-white">OpenStreetMap <ExternalLink size={11} className="inline" /></a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-obsidian-border px-4 py-3 text-[10px] leading-relaxed text-obsidian-muted sm:px-5">
            © OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">ODbL</a>. Guarda cada prospecto manualmente después de revisar sus datos.
          </div>
        </section>
      </div>
    </div>
  );
};
