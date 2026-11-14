import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network,
  AlertTriangle,
  ListFilter,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { GraphData, GraphNode, GraphLink } from '../../types';
import { EmptyState } from '../common/EmptyState';

type GraphFilterType = 'all' | 'email' | 'platform' | 'prospect' | 'payment';
type GraphFixtureMode = 'demo' | 'worst' | 'empty' | 'one' | 'thousand';

const GRAPH_FIXTURE_MODES: { value: GraphFixtureMode; label: string; title: string }[] = [
  { value: 'demo', label: 'Demo', title: 'Datos actuales de LESSSO' },
  { value: 'worst', label: 'Extremo', title: 'Datos límite: nombres largos, campos vacíos y ciclos' },
  { value: 'empty', label: 'Vacío', title: 'Sin nodos ni conexiones' },
  { value: 'one', label: 'Uno', title: 'Un nodo y ninguna conexión' },
  { value: 'thousand', label: '1,000', title: '1,000 nodos y muchas conexiones' },
];

const readGraphFixtureMode = (): GraphFixtureMode => {
  if (!import.meta.env.DEV) return 'demo';
  const requested = new URLSearchParams(window.location.search).get('graphData');
  return GRAPH_FIXTURE_MODES.some((option) => option.value === requested)
    ? (requested as GraphFixtureMode)
    : 'demo';
};

const formatGraphCount = (count: number): string => new Intl.NumberFormat('es-MX').format(count);

const getNodeTypeLabel = (type: GraphNode['type']): string => {
  if (type === 'email') return 'Correo';
  if (type === 'platform') return 'Cuenta';
  if (type === 'prospect') return 'Prospecto';
  return 'Método de pago';
};

const getNodeMonogram = (label: string): string => {
  const monogram = Array.from(label.trim()).slice(0, 2).join('').trim().toLocaleUpperCase();
  return monogram || '·';
};

const truncateCanvasText = (context: CanvasRenderingContext2D, value: string, maxWidth: number): string => {
  const text = value.trim() || 'Sin nombre';
  if (context.measureText(text).width <= maxWidth) return text;

  const characters = Array.from(text);
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join('').trimEnd()}…`;
    if (context.measureText(candidate).width <= maxWidth) return candidate;
  }
  return '…';
};

const FILTER_OPTIONS: { value: GraphFilterType; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'email', label: 'Correos' },
  { value: 'platform', label: 'Cuentas' },
  { value: 'prospect', label: 'Prospectos' },
  { value: 'payment', label: 'Pagos' },
];

const fitGraph = (width: number, height: number, nodes: GraphNode[]) => {
  const positioned = nodes.filter((node) => node.x !== undefined && node.y !== undefined);
  const safeWidth = Math.max(200, width);
  const safeHeight = Math.max(200, height);
  if (!positioned.length) return { x: safeWidth / 2, y: safeHeight / 2, scale: 1 };
  const xs = positioned.map((node) => node.x!);
  const ys = positioned.map((node) => node.y!);
  const minX = Math.min(...xs) - 110;
  const maxX = Math.max(...xs) + 110;
  const minY = Math.min(...ys) - 100;
  const maxY = Math.max(...ys) + 120;
  const scale = Math.max(0.02, Math.min(0.95, (safeWidth - 32) / (maxX - minX), (safeHeight - 32) / (maxY - minY)));
  return {
    x: safeWidth / 2 - (minX + maxX) * scale / 2,
    y: safeHeight / 2 - (minY + maxY) * scale / 2,
    scale,
  };
};

const isNodeVisible = (node: GraphNode, filter: GraphFilterType): boolean => {
  return filter === 'all' || node.type === filter;
};

export const GraphView: React.FC = () => {
  const { openInspector, openEmailModal, openProspectModal, openUnlockModal, dataVersion, isUnlocked } = useVault();

  const [fixtureMode, setFixtureMode] = useState<GraphFixtureMode>(readGraphFixtureMode);
  const isFixturePreview = import.meta.env.DEV && fixtureMode !== 'demo';
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(isUnlocked);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filterType, setFilterType] = useState<GraphFilterType>('all');
  const [nodeSearch, setNodeSearch] = useState('');
  const [highlightSPOF, setHighlightSPOF] = useState(true);
  const [hideEmailAddresses, setHideEmailAddresses] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

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
  const visibleGraphNodes = (graphData?.nodes || []).filter((node) => isNodeVisible(node, filterType));
  const searchTerm = nodeSearch.trim().toLocaleLowerCase();
  const searchedGraphNodes = visibleGraphNodes.filter((node) => node.label.toLocaleLowerCase().includes(searchTerm));

  useEffect(() => {
    if (!isUnlocked) {
      if (!isFixturePreview) {
        setGraphData(null);
        setLoading(false);
        setError('');
        setHoveredNode(null);
        simNodesRef.current = [];
        simLinksRef.current = [];
        return;
      }
    }

    let active = true;
    setLoading(true);
    setError('');

    const graphRequest = isFixturePreview
      ? import('./graphStressFixtures').then(({ createGraphStressFixture }) => createGraphStressFixture(fixtureMode))
      : api.getGraph();

    graphRequest
      .then((data) => {
        if (!active) return;
        setGraphData(data);

        // Keep the familiar radial layout for small maps and distribute larger maps into readable clusters.
        const width = 1000;
        const height = 700;
        const useCompactLayout = data.nodes.length > 80;
        const emailNodes = data.nodes.filter((n) => n.type === 'email');
        const platformNodes = data.nodes.filter((n) => n.type === 'platform');
        const prospectNodes = data.nodes.filter((n) => n.type === 'prospect');
        const paymentNodes = data.nodes.filter((n) => n.type === 'payment');

        // Place emails in a ring for small maps and a grid for dense maps.
        const emailColumns = Math.max(1, Math.ceil(Math.sqrt(emailNodes.length)));
        emailNodes.forEach((node, i) => {
          if (useCompactLayout) {
            const column = i % emailColumns;
            const row = Math.floor(i / emailColumns);
            node.x = 260 + column * 420;
            node.y = 220 + row * 420;
          } else {
            const angle = (i / Math.max(1, emailNodes.length)) * 2 * Math.PI;
            const radius = 180;
            node.x = width / 2 + Math.cos(angle) * radius;
            node.y = height / 2 + Math.sin(angle) * radius;
          }
          node.vx = 0;
          node.vy = 0;
        });

        // Place platforms radially around their parent email
        const emailPosMap = new Map(emailNodes.map((e) => [e.id, { x: e.x ?? width / 2, y: e.y ?? height / 2 }]));
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

        const detachedPlatformColumns = Math.max(1, Math.ceil(Math.sqrt(platformNodes.length)));
        let detachedPlatformIndex = 0;
        platformNodes.forEach((pNode) => {
          const parentId = platformParents.get(pNode.id);
          const parentPos = parentId ? emailPosMap.get(parentId) : undefined;

          if (parentId && parentPos) {
            const currentCount = platformsPerEmail.get(parentId) || 0;
            platformsPerEmail.set(parentId, currentCount + 1);
            const subAngle = currentCount * 2.39996323;
            const subDist = useCompactLayout ? 112 + Math.sqrt(currentCount) * 24 : 126 + (currentCount % 4) * 12;
            pNode.x = parentPos.x + Math.cos(subAngle) * subDist;
            pNode.y = parentPos.y + Math.sin(subAngle) * subDist;
          } else {
            const column = detachedPlatformIndex % detachedPlatformColumns;
            const row = Math.floor(detachedPlatformIndex / detachedPlatformColumns);
            pNode.x = width / 2 - (detachedPlatformColumns - 1) * 80 + column * 160;
            pNode.y = height + 160 + row * 150;
            detachedPlatformIndex += 1;
          }
          pNode.vx = 0;
          pNode.vy = 0;
        });

        // Place prospects radially around their parent email, with a grid for unlinked records.
        const prospectsPerEmail = new Map<string, number>();
        const detachedProspectColumns = Math.max(1, Math.ceil(Math.sqrt(prospectNodes.length)));
        let detachedProspectIndex = 0;
        prospectNodes.forEach((prNode) => {
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
            const column = detachedProspectIndex % detachedProspectColumns;
            const row = Math.floor(detachedProspectIndex / detachedProspectColumns);
            prNode.x = width / 2 - (detachedProspectColumns - 1) * 80 + column * 160;
            prNode.y = -140 - row * 150;
            detachedProspectIndex += 1;
          }
          prNode.vx = 0;
          prNode.vy = 0;
        });

        // Place payment methods beside linked accounts, or in a compact grid when unlinked.
        const platformParentsById = new Map(platformNodes.map((platform) => [platform.id, platformParents.get(platform.id)]));
        const paymentPlatforms = new Map<string, string>();
        data.links.forEach((link) => {
          if (link.type === 'payment') paymentPlatforms.set(link.source, link.target);
        });
        const paymentsPerEmail = new Map<string, number>();
        const detachedPaymentColumns = Math.max(1, Math.ceil(Math.sqrt(paymentNodes.length)));
        let detachedPaymentIndex = 0;
        paymentNodes.forEach((payNode) => {
          const platformId = paymentPlatforms.get(payNode.id);
          const parentEmailId = platformId ? platformParentsById.get(platformId) : undefined;
          const parentPos = parentEmailId ? emailPosMap.get(parentEmailId) : undefined;

          if (parentEmailId && parentPos) {
            const currentCount = paymentsPerEmail.get(parentEmailId) || 0;
            paymentsPerEmail.set(parentEmailId, currentCount + 1);
            payNode.x = parentPos.x + 190;
            payNode.y = parentPos.y + (currentCount - 0.5) * 52;
          } else {
            const column = detachedPaymentIndex % detachedPaymentColumns;
            const row = Math.floor(detachedPaymentIndex / detachedPaymentColumns);
            payNode.x = width + 140 + column * 160;
            payNode.y = height / 2 + row * 150;
            detachedPaymentIndex += 1;
          }
          payNode.vx = 0;
          payNode.vy = 0;
        });

        simNodesRef.current = data.nodes;
        simLinksRef.current = data.links;

        if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          transformRef.current = fitGraph(rect.width, rect.height, simNodesRef.current);
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
  }, [dataVersion, isUnlocked, attempt, fixtureMode, isFixturePreview]);

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
    const showLabels = visibleNodes.length <= 16 && scale >= 0.65;
    const maxLabelWidth = Math.min(180, 120 / Math.max(scale, 0.1));
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

      ctx.textAlign = 'center';
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

        if (!hideEmailAddresses && (showLabels || isHovered)) {
          ctx.font = '600 12px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(truncateCanvasText(ctx, node.label, maxLabelWidth), node.x, node.y + radius + 16);

          ctx.font = '500 10px JetBrains Mono, monospace';
          ctx.fillStyle = '#94a3b8';
          const platformCount = Number(node.metrics.platforms_count);
          const formattedPlatformCount = formatGraphCount(Number.isFinite(platformCount) ? platformCount : 0);
          const detail = `${formattedPlatformCount} hijos • ${node.sub_type || 'Sin proveedor'}`;
          ctx.fillText(truncateCanvasText(ctx, detail, maxLabelWidth), node.x, node.y + radius + 30);
        }

        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = isCritical ? '#f43f5e' : '#818cf8';
        ctx.fillText(getNodeMonogram(node.label), node.x, node.y + 5);
      } else if (node.type === 'platform') {
        const radius = 16;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#14161c';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = node.status === 'free_trial' ? '#f59e0b' : '#38bdf8';
        ctx.stroke();

        if (showLabels || isHovered) {
          ctx.font = '500 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#e2e8f0';
          ctx.textAlign = 'center';
          ctx.fillText(truncateCanvasText(ctx, node.label, maxLabelWidth), node.x, node.y + radius + 14);
        }

        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(getNodeMonogram(node.label), node.x, node.y + 4);
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

        if (showLabels || isHovered) {
          ctx.font = '500 10.5px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#fde68a';
          ctx.textAlign = 'center';
          ctx.fillText(truncateCanvasText(ctx, node.label, maxLabelWidth), node.x, node.y + radius + 13);
        }

        ctx.font = 'bold 9.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = node.status === 'respondido' ? '#10b981' : '#f59e0b';
        ctx.fillText(getNodeMonogram(node.label), node.x, node.y + 3.5);
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

        if (showLabels || isHovered) {
          ctx.font = '500 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.textAlign = 'center';
          ctx.fillText(truncateCanvasText(ctx, node.label, maxLabelWidth), node.x, node.y + radius + 12);
        }

        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#34d399';
        ctx.fillText(getNodeMonogram(node.label), node.x, node.y + 3.5);
      }
    });

    ctx.restore();
  }, [hoveredNode, highlightSPOF, filterType, hideEmailAddresses]);

  // Handle Resize with DPR support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.parentElement?.clientWidth || 800;
      const cssHeight = canvas.parentElement?.clientHeight || 600;
      const sizeChanged = cssWidth !== canvasSizeRef.current.width || cssHeight !== canvasSizeRef.current.height;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      if (sizeChanged && simNodesRef.current.length > 0) {
        transformRef.current = fitGraph(cssWidth, cssHeight, simNodesRef.current);
      }
      canvasSizeRef.current = { width: cssWidth, height: cssHeight };
      draw();
    };

    resize();
    const observer = canvas.parentElement && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
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
      setHoveredNode(clickedNode);
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
      if (!hasDraggedRef.current && !isFixturePreview && n.entity_id) openInspector(n.type, n.entity_id);
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
    transformRef.current = fitGraph(rect.width, rect.height, simNodesRef.current);
    draw();
  };

  const selectFixtureMode = (mode: GraphFixtureMode) => {
    setFixtureMode(mode);
    setFilterType('all');
    setNodeSearch('');
    setHoveredNode(null);
    if (!import.meta.env.DEV) return;
    const nextUrl = new URL(window.location.href);
    if (mode === 'demo') nextUrl.searchParams.delete('graphData');
    else nextUrl.searchParams.set('graphData', mode);
    window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const selectGraphNode = (node: GraphNode) => {
    setHoveredNode(node);
    if (!isFixturePreview && node.entity_id) openInspector(node.type, node.entity_id);
  };

  const mapOverlayBottomClass = import.meta.env.DEV ? 'bottom-16 sm:bottom-20' : 'bottom-3 sm:bottom-6';
  const graphFixtureSwitcher = import.meta.env.DEV ? (
    <div
      role="group"
      aria-label="Datos de prueba del mapa"
      className="fixed bottom-2 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-0.5 overflow-x-auto rounded-lg border border-slate-300 bg-slate-100 p-1 font-sans text-[11px] text-slate-700 shadow-lg"
    >
      {GRAPH_FIXTURE_MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={fixtureMode === option.value}
          title={option.title}
          onClick={() => selectFixtureMode(option.value)}
          className={`min-h-11 shrink-0 touch-manipulation rounded-md px-2 font-medium ${
            fixtureMode === option.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;


  if (!isUnlocked && !isFixturePreview) {
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
            className="mt-5 min-h-11 touch-manipulation rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            Desbloquear bóveda
          </button>
        </section>
        {graphFixtureSwitcher}
      </div>
    );
  }

  return (
    <div
      className="graph-view-map relative h-[calc(100dvh-4rem)] min-h-0 w-full overflow-hidden bg-obsidian-bg dot-grid-canvas"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {graphData?.cycles_detected && graphData.cycles_detected.length > 0 && (
        <div className="absolute left-3 right-3 top-3 z-10 flex justify-start">
          <div
            role="status"
            className="flex max-w-full items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 shadow-lg backdrop-blur-md"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span className="break-words">
              {formatGraphCount(graphData.cycles_detected.length)}{' '}
              {graphData.cycles_detected.length === 1 ? 'conexión circular' : 'conexiones circulares'}
            </span>
          </div>
        </div>
      )}

      {!loading && !error && graphData && graphData.nodes.length > 0 && graphData.links.length === 0 && (
        <div className="absolute left-3 right-3 top-3 z-10 flex justify-center">
          <div role="status" className="rounded-xl border border-obsidian-border bg-obsidian-panel/95 px-3 py-2 text-center text-xs text-obsidian-muted shadow-lg">
            {formatGraphCount(graphData.nodes.length)} {graphData.nodes.length === 1 ? 'elemento' : 'elementos'} sin conexiones todavía.
          </div>
        </div>
      )}

      {hoveredNode && !loading && !error && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-3 right-3 top-14 z-10 mx-auto max-w-sm rounded-xl border border-obsidian-border bg-obsidian-panel/95 px-3 py-2 shadow-xl"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-obsidian-muted">{getNodeTypeLabel(hoveredNode.type)}</span>
          <p className="break-words text-sm font-medium leading-relaxed text-white">{hoveredNode.label}</p>
          {hoveredNode.sub_type && <p className="mt-0.5 break-words text-xs text-obsidian-muted">{hoveredNode.sub_type}</p>}
        </div>
      )}

      {/* Floating Zoom & Pan Controls */}
      <div
        role="group"
        aria-label="Controles de zoom del mapa"
        className={`absolute ${mapOverlayBottomClass} right-3 z-10 flex flex-col gap-1 rounded-xl border border-obsidian-border bg-obsidian-panel/90 p-1.5 text-obsidian-muted shadow-xl backdrop-blur-md sm:right-6`}
      >
        <details className="relative text-xs">
          <summary aria-label="Filtros y nodos del mapa" className="flex min-h-11 min-w-11 touch-manipulation cursor-pointer list-none items-center justify-center rounded-lg active:bg-obsidian-surface hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 sm:min-h-9 sm:min-w-9 [&::-webkit-details-marker]:hidden">
            <ListFilter size={16} aria-hidden="true" /><span className="sr-only">Filtros y nodos del mapa</span>
          </summary>
          <div className="absolute bottom-0 right-full mr-2 flex w-[min(13rem,calc(100vw-5.5rem))] max-h-[min(70dvh,32rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-1.5 shadow-xl">
            <div role="group" aria-label="Filtrar nodos del mapa" className="flex flex-col gap-1">
              {FILTER_OPTIONS.map((opt) => {
                const active = filterType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-label={`Filtrar nodos: ${opt.label}`}
                    aria-pressed={active}
                    onClick={() => setFilterType(opt.value)}
                    className={`min-h-11 touch-manipulation rounded-lg px-2.5 text-left text-xs font-medium active:bg-obsidian-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9 ${
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
              className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border-t border-obsidian-border px-2.5 pt-1 text-left text-xs text-obsidian-text active:bg-obsidian-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:min-h-9"
            >
              <ShieldAlert size={14} aria-hidden="true" />
              <span>Resaltar correos clave</span>
            </button>
            <button
              type="button"
              aria-pressed={hideEmailAddresses}
              onClick={() => setHideEmailAddresses((hidden) => !hidden)}
              className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border-t border-obsidian-border px-2.5 pt-1 text-left text-xs text-obsidian-text active:bg-obsidian-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9"
            >
              {hideEmailAddresses ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              <span>Ocultar correos completos</span>
            </button>

            <div className="border-t border-obsidian-border pt-2">
              <label className="block text-xs font-medium text-obsidian-text">
                Buscar elemento
                <input
                  type="search"
                  value={nodeSearch}
                  onChange={(event) => setNodeSearch(event.target.value)}
                  maxLength={255}
                  autoComplete="off"
                  className="mt-1 min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-base text-white placeholder:text-obsidian-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9 sm:text-sm"
                  placeholder="Nombre del nodo"
                />
              </label>
              <p className="mt-1 text-[10px] text-obsidian-muted">
                {formatGraphCount(visibleGraphNodes.length)} {visibleGraphNodes.length === 1 ? 'elemento' : 'elementos'} en el filtro
              </p>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto" aria-label="Elementos disponibles en el mapa">
                {searchedGraphNodes.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-obsidian-muted">
                    {visibleGraphNodes.length === 0 ? 'No hay elementos de este tipo.' : 'No hay coincidencias para esta búsqueda.'}
                  </li>
                ) : (
                  searchedGraphNodes.slice(0, 40).map((node) => (
                    <li key={node.id}>
                      {node.entity_id || isFixturePreview ? (
                        <button
                          type="button"
                          onClick={() => selectGraphNode(node)}
                          className="min-h-11 w-full touch-manipulation break-words rounded-md px-2 py-1 text-left text-xs text-obsidian-text active:bg-obsidian-surface hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                        >
                          <span className="block text-[10px] text-obsidian-muted">{getNodeTypeLabel(node.type)}</span>
                          <span>{node.label}</span>
                        </button>
                      ) : (
                        <span className="block break-words rounded-md px-2 py-1 text-xs text-obsidian-muted">
                          <span className="block text-[10px]">{getNodeTypeLabel(node.type)}</span>
                          {node.label}
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
              {searchedGraphNodes.length > 40 && (
                <p className="mt-1 text-[10px] text-obsidian-muted">Mostrando 40 de {formatGraphCount(searchedGraphNodes.length)}. Busca para acotar la lista.</p>
              )}
            </div>
          </div>
        </details>
        <button
          type="button"
          onClick={() => zoomAtPoint(1.2)}
          aria-label="Acercar mapa"
          title="Acercar"
          className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg transition-colors active:bg-obsidian-surface hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9 sm:min-w-9"
        >
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomAtPoint(0.8)}
          aria-label="Alejar mapa"
          title="Alejar"
          className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg transition-colors active:bg-obsidian-surface hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9 sm:min-w-9"
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          aria-label="Restablecer vista del mapa"
          title="Restablecer vista"
          className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg transition-colors active:bg-obsidian-surface hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-9 sm:min-w-9"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>

      <aside aria-label="Guía del mapa" className={`absolute ${mapOverlayBottomClass} left-3 z-10 max-h-[min(40vh,15rem)] max-w-[min(18rem,calc(100%-7rem))] overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel/95 p-3 text-[11px] text-obsidian-muted shadow-xl sm:left-6`}>
          <div className="space-y-1.5">
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
          </div>
      </aside>

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
              <p className="mt-1 text-xs leading-relaxed text-obsidian-muted">
                Agrega un correo principal o un prospecto. Al vincular cuentas y pagos, aparecerán aquí.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openEmailModal()}
                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-all active:bg-indigo-500 hover:bg-indigo-500"
              >
                <Plus size={14} aria-hidden="true" />
                <span>Agregar Correo Principal</span>
              </button>
              <button
                type="button"
                onClick={() => openProspectModal()}
                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface px-4 py-2 text-xs font-semibold text-white transition-all active:bg-obsidian-border hover:bg-obsidian-border"
              >
                <Plus size={14} className="text-amber-400" aria-hidden="true" />
                <span>Nuevo Prospecto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && graphData && graphData.nodes.length > 0 && visibleGraphNodes.length === 0 && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center p-4">
          <div role="status" className="w-full max-w-sm rounded-2xl border border-obsidian-border bg-obsidian-panel/95 p-5 text-center shadow-2xl backdrop-blur-md">
            <h3 className="text-sm font-bold text-white">No hay elementos en este filtro</h3>
            <p className="mt-1 text-xs leading-relaxed text-obsidian-muted">
              Prueba otro tipo o vuelve a mostrar todos los nodos del mapa.
            </p>
            <button
              type="button"
              onClick={() => { setFilterType('all'); setNodeSearch(''); }}
              className="mt-4 min-h-11 touch-manipulation rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white active:bg-indigo-500 hover:bg-indigo-500"
            >
              Mostrar todos
            </button>
          </div>
        </div>
      )}

      {graphFixtureSwitcher}

      {/* The HTML5 Canvas */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Mapa de conexiones con ${formatGraphCount(visibleGraphNodes.length)} elementos visibles. Para buscar o seleccionar nodos, abre Filtros y nodos del mapa.`}
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
