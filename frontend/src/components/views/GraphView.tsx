import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldAlert,
  LoaderCircle,
  Plus,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { GraphData, GraphNode, GraphLink } from '../../types';
import { EmptyState } from '../common/EmptyState';

type GraphFilterType = 'all' | 'email' | 'platform' | 'prospect' | 'payment';

const FILTER_OPTIONS: { value: GraphFilterType; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'email', label: 'Correos' },
  { value: 'platform', label: 'Cuentas' },
  { value: 'prospect', label: 'Prospectos' },
  { value: 'payment', label: 'Pagos' },
];

const fitGraph = (width: number, height: number) => {
  const safeW = Math.max(200, width);
  const safeH = Math.max(200, height);
  const scale = Math.max(0.1, Math.min(0.95, (safeW - 24) / 1000, (safeH - 24) / 700));
  return { x: (safeW - 1000 * scale) / 2, y: (safeH - 700 * scale) / 2, scale };
};

const isNodeVisible = (node: GraphNode, filter: GraphFilterType): boolean => {
  return filter === 'all' || node.type === filter;
};

export const GraphView: React.FC = () => {
  const { openInspector, openEmailModal, openProspectModal, openUnlockModal, dataVersion, isUnlocked } = useVault();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(isUnlocked);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filterType, setFilterType] = useState<GraphFilterType>('all');
  const [highlightSPOF, setHighlightSPOF] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [nodeSearch, setNodeSearch] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Transform state: pan & zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pointerDownOriginRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Active pointers for 2-finger pinch-to-zoom
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Simulation nodes state
  const simNodesRef = useRef<GraphNode[]>([]);
  const simLinksRef = useRef<GraphLink[]>([]);

  useEffect(() => {
    if (!isUnlocked) {
      setGraphData(null);
      setLoading(false);
      setError('');
      setHoveredNode(null);
      simNodesRef.current = [];
      simLinksRef.current = [];
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    api
      .getGraph()
      .then((data) => {
        if (!active) return;
        setGraphData(data);

        // Initialize node positions in a radial / distributed layout
        const width = 1000;
        const height = 700;
        const emailNodes = data.nodes.filter((n) => n.type === 'email');
        const platformNodes = data.nodes.filter((n) => n.type === 'platform');
        const prospectNodes = data.nodes.filter((n) => n.type === 'prospect');
        const paymentNodes = data.nodes.filter((n) => n.type === 'payment');

        // Place emails in central ring
        emailNodes.forEach((node, i) => {
          const angle = (i / Math.max(1, emailNodes.length)) * 2 * Math.PI;
          const radius = 180;
          node.x = width / 2 + Math.cos(angle) * radius;
          node.y = height / 2 + Math.sin(angle) * radius;
          node.vx = 0;
          node.vy = 0;
        });

        // Place platforms radially around their parent email
        const emailPosMap = new Map(emailNodes.map((e) => [e.id, { x: e.x || 0, y: e.y || 0 }]));
        const platformsPerEmail = new Map<string, number>();
        const platformParents = new Map<string, string>();
        const prospectParents = new Map<string, string>();
        data.links.forEach((link) => {
          if (link.type === 'child' && !platformParents.has(link.target)) {
            platformParents.set(link.target, link.source);
          }
          if (link.type === 'prospect' && !prospectParents.has(link.target)) {
            prospectParents.set(link.target, link.source);
          }
        });

        platformNodes.forEach((pNode) => {
          const parentId = platformParents.get(pNode.id) || emailNodes[0]?.id;
          const parentPos = (parentId ? emailPosMap.get(parentId) : undefined) || {
            x: width / 2,
            y: height / 2,
          };

          const currentCount = (parentId ? platformsPerEmail.get(parentId) : 0) || 0;
          if (parentId) platformsPerEmail.set(parentId, currentCount + 1);

          const subAngle = currentCount * 2.39996323;
          const subDist = 126 + (currentCount % 4) * 12;
          pNode.x = parentPos.x + Math.cos(subAngle) * subDist;
          pNode.y = parentPos.y + Math.sin(subAngle) * subDist;
          pNode.vx = 0;
          pNode.vy = 0;
        });

        // Place prospects radially around their parent email (or on right side if unlinked)
        const prospectsPerEmail = new Map<string, number>();
        prospectNodes.forEach((prNode, idx) => {
          const parentId = prospectParents.get(prNode.id);
          const parentPos = parentId ? emailPosMap.get(parentId) : undefined;

          if (parentPos && parentId) {
            const currentCount = prospectsPerEmail.get(parentId) || 0;
            prospectsPerEmail.set(parentId, currentCount + 1);
            const subAngle = Math.PI + currentCount * 0.95 + 0.3;
            const subDist = 145 + (currentCount % 2) * 30;
            prNode.x = parentPos.x + Math.cos(subAngle) * subDist;
            prNode.y = parentPos.y + Math.sin(subAngle) * subDist;
          } else {
            prNode.x = width - 140;
            prNode.y = 140 + idx * 90;
          }
          prNode.vx = 0;
          prNode.vy = 0;
        });

        // Place payments
        paymentNodes.forEach((payNode, i) => {
          payNode.x = 120 + i * 140;
          payNode.y = height - 100;
          payNode.vx = 0;
          payNode.vy = 0;
        });

        simNodesRef.current = data.nodes;
        simLinksRef.current = data.links;

        if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          transformRef.current = fitGraph(rect.width, rect.height);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el mapa de conexiones.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion, isUnlocked, attempt]);

  // Main Render Loop for HTML5 Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Pan & Zoom in CSS pixel space
    const { x, y, scale } = transformRef.current;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const visibleNodes = simNodesRef.current.filter((n) => isNodeVisible(n, filterType));
    const visibleNodeMap = new Map(visibleNodes.map((n) => [n.id, n]));
    const links = simLinksRef.current;

    // 1. Draw Links (only between visible nodes)
    links.forEach((link) => {
      const src = visibleNodeMap.get(link.source);
      const tgt = visibleNodeMap.get(link.target);
      if (!src || !tgt || src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) {
        return;
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      if (link.type === 'recovery') {
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = link.is_cycle ? 2.5 : 1.8;
        ctx.strokeStyle = link.is_cycle ? 'rgba(244, 63, 94, 0.85)' : 'rgba(6, 182, 212, 0.6)';
      } else if (link.type === 'payment') {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
      } else if (link.type === 'prospect') {
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      } else {
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (link.type === 'recovery') {
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        ctx.beginPath();
        ctx.arc(midX, midY, 3, 0, Math.PI * 2);
        ctx.fillStyle = link.is_cycle ? '#f43f5e' : '#06b6d4';
        ctx.fill();
      }
    });

    // 2. Draw Nodes
    visibleNodes.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;

      const isHovered = hoveredNode?.id === node.id;
      const isCritical = highlightSPOF && node.is_critical_failure_point;

      if (node.type === 'email') {
        const radius = isCritical ? 28 : 24;

        if (isCritical) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#17191f';
        ctx.fill();
        ctx.lineWidth = isCritical ? 2.5 : 2;
        ctx.strokeStyle = isCritical ? '#f43f5e' : '#6366f1';
        ctx.stroke();

        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 16);

        ctx.font = '500 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(
          `${node.metrics.platforms_count || 0} hijos • ${node.sub_type}`,
          node.x,
          node.y + radius + 30
        );

        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = isCritical ? '#f43f5e' : '#818cf8';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 5);
      } else if (node.type === 'platform') {
        const radius = 16;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#14161c';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = node.status === 'free_trial' ? '#f59e0b' : '#38bdf8';
        ctx.stroke();

        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 14);

        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 4);
      } else if (node.type === 'prospect') {
        const radius = 15;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#1b1815';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle =
          node.status === 'respondido'
            ? '#10b981'
            : node.status === 'tiempo_agotado'
            ? '#f43f5e'
            : '#f59e0b';
        ctx.stroke();

        ctx.font = '500 10.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 13);

        ctx.font = 'bold 9.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = node.status === 'respondido' ? '#10b981' : '#f59e0b';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 3.5);
      } else {
        // Payment Node
        const radius = 14;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#1a2e28' : '#10b98115';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();

        ctx.font = '500 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 12);

        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#34d399';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 3.5);
      }
    });

    ctx.restore();
  }, [hoveredNode, highlightSPOF, filterType]);

  // Handle Resize with DPR support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.parentElement?.clientWidth || 800;
      const cssHeight = canvas.parentElement?.clientHeight || 600;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, graphData]);

  // Find visible node under pointer coords
  const getNodeAtCoords = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const { x, y, scale } = transformRef.current;

      const mouseX = (clientX - rect.left - x) / scale;
      const mouseY = (clientY - rect.top - y) / scale;

      const nodes = simNodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!isNodeVisible(n, filterType)) continue;
        if (n.x === undefined || n.y === undefined) continue;
        const hitRadius = n.type === 'email' ? 32 : 20;
        const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
        if (dist <= hitRadius) {
          return n;
        }
      }
      return null;
    },
    [filterType]
  );

  const zoomAtPoint = useCallback(
    (factor: number, localX?: number, localY?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pivotX = localX ?? rect.width / 2;
      const pivotY = localY ?? rect.height / 2;

      const oldScale = transformRef.current.scale;
      const newScale = Math.max(0.1, Math.min(2.5, oldScale * factor));

      transformRef.current.x = pivotX - (pivotX - transformRef.current.x) * (newScale / oldScale);
      transformRef.current.y = pivotY - (pivotY - transformRef.current.y) * (newScale / oldScale);
      transformRef.current.scale = newScale;
      draw();
    },
    [draw]
  );

  // Pointer & Touch Pinch Events
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      // Begin 2-pointer pinch
      const pts = Array.from(activePointersRef.current.values());
      lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      draggedNodeRef.current = null;
      isDraggingCanvasRef.current = false;
      hasDraggedRef.current = true;
      return;
    }

    pointerDownOriginRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;

    const clickedNode = getNodeAtCoords(e.clientX, e.clientY);
    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const canvas = canvasRef.current;
      if (canvas && lastPinchDistRef.current && lastPinchDistRef.current > 0) {
        const rect = canvas.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
        zoomAtPoint(dist / lastPinchDistRef.current, midX, midY);
      }
      lastPinchDistRef.current = dist;
      return;
    }

    if (pointerDownOriginRef.current) {
      const moveDist = Math.hypot(
        e.clientX - pointerDownOriginRef.current.x,
        e.clientY - pointerDownOriginRef.current.y
      );
      if (moveDist > 5) {
        hasDraggedRef.current = true;
      }
    }

    if (draggedNodeRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x, y, scale } = transformRef.current;

      draggedNodeRef.current.x = (e.clientX - rect.left - x) / scale;
      draggedNodeRef.current.y = (e.clientY - rect.top - y) / scale;
      draw();
    } else if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      draw();
    } else {
      const node = getNodeAtCoords(e.clientX, e.clientY);
      if (node?.id !== hoveredNode?.id) {
        setHoveredNode(node);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistRef.current = null;
    }

    if (draggedNodeRef.current) {
      const n = draggedNodeRef.current;
      draggedNodeRef.current = null;
      if (!hasDraggedRef.current && n.entity_id) {
        openInspector(n.type, n.entity_id);
      }
    }
    isDraggingCanvasRef.current = false;
    pointerDownOriginRef.current = null;
    hasDraggedRef.current = false;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistRef.current = null;
    }
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
    pointerDownOriginRef.current = null;
    hasDraggedRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomAtPoint(zoomFactor, e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleResetZoom = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    transformRef.current = fitGraph(rect.width, rect.height);
    draw();
  };

  if (!isUnlocked) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl items-start p-4 sm:items-center sm:p-8">
        <section className="w-full rounded-2xl border border-obsidian-border bg-obsidian-card p-5 sm:p-7" aria-labelledby="graph-locked-title">
          <Network size={24} className="mb-3 text-indigo-300" aria-hidden="true" />
          <h2 id="graph-locked-title" className="text-xl font-bold text-white">Mapa de conexiones</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-obsidian-muted">
            Desbloquea la bóveda para consultar las relaciones entre tus correos, cuentas, prospectos y pagos.
          </p>
          <button
            type="button"
            onClick={openUnlockModal}
            className="mt-5 min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            Desbloquear bóveda
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-4rem)] min-h-0 w-full select-none overflow-hidden bg-obsidian-bg dot-grid-canvas">
      {/* Keep mobile controls compact so the map remains visible. */}
      <div className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-start gap-2 sm:left-6 sm:right-6 sm:top-4">
        <details className="relative max-w-[calc(100vw-1rem)] rounded-xl border border-obsidian-border bg-obsidian-panel/95 p-1 text-xs shadow-xl backdrop-blur-md">
          <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 font-medium text-white [&::-webkit-details-marker]:hidden">
            <span>Filtros: {FILTER_OPTIONS.find((option) => option.value === filterType)?.label}</span>
          </summary>
          <div className="absolute left-0 top-full mt-1 flex min-w-40 flex-col gap-1 rounded-xl border border-obsidian-border bg-obsidian-panel p-1.5 shadow-xl">
            <div role="group" aria-label="Filtrar nodos del mapa" className="flex flex-col gap-1">
              {FILTER_OPTIONS.map((opt) => {
                const active = filterType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilterType(opt.value)}
                    className={`min-h-[36px] rounded-lg px-2.5 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      active ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:bg-obsidian-surface hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-pressed={highlightSPOF}
              onClick={() => setHighlightSPOF(!highlightSPOF)}
              className="flex min-h-[36px] items-center gap-2 rounded-lg border-t border-obsidian-border px-2.5 pt-1 text-left text-xs text-obsidian-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <ShieldAlert size={14} aria-hidden="true" />
              <span>Resaltar correos clave</span>
            </button>
          </div>
        </details>

        {/* Cycles Alert Banner */}
        {graphData?.cycles_detected && graphData.cycles_detected.length > 0 && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 backdrop-blur-md"
          >
            <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />
            <span>{graphData.cycles_detected.length} conexiones circulares</span>
          </div>
        )}
      </div>

      {/* Floating Zoom & Pan Controls */}
      <div
        role="group"
        aria-label="Controles de zoom del mapa"
        className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl border border-obsidian-border bg-obsidian-panel/90 p-1.5 text-obsidian-muted shadow-xl backdrop-blur-md sm:bottom-6 sm:right-6"
      >
        <button
          type="button"
          onClick={() => zoomAtPoint(1.2)}
          aria-label="Acercar mapa"
          title="Acercar"
          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomAtPoint(0.8)}
          aria-label="Alejar mapa"
          title="Alejar"
          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          aria-label="Restablecer vista del mapa"
          title="Restablecer vista"
          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Legend Card positioned away from zoom controls on 375px */}
      <details
        onToggle={(event) => setIsLegendOpen(event.currentTarget.open)}
        className="absolute bottom-3 left-3 z-10 max-h-[calc(100%-6rem)] max-w-[calc(100%-5.25rem)] overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel/95 p-3 text-[11px] text-obsidian-muted shadow-xl backdrop-blur-md sm:bottom-6 sm:left-6 sm:max-w-xs"
      >
        <summary className="cursor-pointer text-xs font-semibold text-white">Guía y elementos</summary>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-indigo-500 bg-obsidian-card" aria-hidden="true" />
            <span>Correo Principal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-cyan-400 bg-obsidian-card" aria-hidden="true" />
            <span>Cuenta o Servicio</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-amber-400 bg-obsidian-card" aria-hidden="true" />
            <span>Prospecto / Demo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-emerald-500 bg-emerald-500/20" aria-hidden="true" />
            <span>Método de Pago</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 shrink-0 border-t border-dashed border-cyan-400" aria-hidden="true" />
            <span>Correo de Respaldo (A recupera a B)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-rose-500 bg-rose-500/20" aria-hidden="true" />
            <span>Correo Indispensable (muchas cuentas dependen de él)</span>
          </div>
          {isLegendOpen && graphData?.nodes.length ? (
            <div className="mt-3 border-t border-obsidian-border pt-3">
              <h2 className="text-xs font-semibold text-white">Elementos del mapa</h2>
              <label className="mt-2 block text-xs text-obsidian-muted">
                Buscar elemento
                <input value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} maxLength={100} className="mt-1 min-h-10 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-sm text-white" />
              </label>
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto" aria-label="Elementos disponibles en el mapa">
                {graphData.nodes.filter((node) => isNodeVisible(node, filterType) && node.label.toLocaleLowerCase().includes(nodeSearch.trim().toLocaleLowerCase())).map((node) => {
                  const typeLabel = node.type === 'email'
                    ? 'Correo'
                    : node.type === 'platform'
                    ? 'Cuenta'
                    : node.type === 'prospect'
                    ? 'Prospecto'
                    : 'Método de pago';
                  const entityId = node.entity_id;
                  return (
                    <li key={node.id}>
                      {entityId ? (
                        <button
                          type="button"
                          onClick={() => openInspector(node.type, entityId)}
                          className="min-h-10 w-full break-words rounded-md px-2 py-1 text-left text-xs text-obsidian-text hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                        >
                          {typeLabel}: {node.label}
                        </button>
                      ) : (
                        <span className="block break-words px-2 py-1 text-xs text-obsidian-muted">
                          {typeLabel}: {node.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </details>

      {/* Loading State Overlay */}
      {loading && !graphData && (
        <div
          role="status"
          className="absolute inset-0 z-20 flex items-center justify-center bg-obsidian-bg/80 p-4 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-obsidian-border bg-obsidian-panel px-6 py-5 text-xs text-obsidian-muted shadow-2xl">
            <LoaderCircle size={22} className="animate-spin text-indigo-400" aria-hidden="true" />
            <span>Cargando mapa de conexiones…</span>
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {error && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-obsidian-bg/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <EmptyState
              icon={AlertTriangle}
              tone="error"
              title="No se pudo cargar el mapa de conexiones"
              description={error}
              actionLabel="Reintentar"
              onAction={() => setAttempt((value) => value + 1)}
            />
          </div>
        </div>
      )}

      {/* Empty State Overlay when there are no nodes */}
      {!loading && !error && graphData && graphData.nodes.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-6">
          <div className="pointer-events-auto my-auto w-full max-w-md space-y-4 rounded-2xl border border-obsidian-border bg-obsidian-panel/95 p-4 text-center shadow-2xl backdrop-blur-md sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
              <Network size={22} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mapa de Conexiones Vacío</h3>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openEmailModal()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-indigo-500"
              >
                <Plus size={14} aria-hidden="true" />
                <span>Agregar Correo Principal</span>
              </button>
              <button
                type="button"
                onClick={() => openProspectModal()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-obsidian-border"
              >
                <Plus size={14} className="text-amber-400" aria-hidden="true" />
                <span>Nuevo Prospecto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The HTML5 Canvas */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Mapa interactivo de conexiones entre correos, plataformas, prospectos y métodos de pago"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
