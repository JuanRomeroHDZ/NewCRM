import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Loader2,
  Maximize2,
  Network,
  Radar,
  RotateCcw,
  ScanSearch,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';
import type { C2DeviceType, C2TopologyData, C2TopologyNode } from '../../../types/c2';

interface TopoTypeConfig {
  label: string;
  color: string;
}

interface TopoIconDef {
  paths?: string[];
  circles?: Array<[number, number, number]>;
  dots?: Array<[number, number]>;
  text?: string;
}

const TOPO_TYPES: Record<string, TopoTypeConfig> = {
  self: { label: 'topo.t.self', color: '#A98242' },
  router: { label: 'topo.t.router', color: '#9DB1AE' },
  internet: { label: 'topo.t.internet', color: '#D9E0DE' },
  pc: { label: 'topo.t.pc', color: '#B7C5C2' },
  phone: { label: 'topo.t.phone', color: '#B8AEBE' },
  tv: { label: 'topo.t.tv', color: '#AD9973' },
  printer: { label: 'topo.t.printer', color: '#B8C3C0' },
  iot: { label: 'topo.t.iot', color: '#A6B4AE' },
  camera: { label: 'topo.t.camera', color: '#C29696' },
  console: { label: 'topo.t.console', color: '#B6C0C7' },
  nas: { label: 'topo.t.nas', color: '#A5B5AF' },
  speaker: { label: 'topo.t.speaker', color: '#B5ADBF' },
  plc: { label: 'topo.t.plc', color: '#A98242' },
  hmi: { label: 'topo.t.hmi', color: '#A8B9B1' },
  rtu: { label: 'topo.t.rtu', color: '#B5A08A' },
  scada: { label: 'topo.t.scada', color: '#B7C5C2' },
  drive: { label: 'topo.t.drive', color: '#AF968B' },
  relay: { label: 'topo.t.relay', color: '#C2B188' },
  robot: { label: 'topo.t.robot', color: '#B2BD9C' },
  switch: { label: 'topo.t.switch', color: '#9DB1AE' },
  gateway: { label: 'topo.t.gateway', color: '#B8AFC0' },
  sensor: { label: 'topo.t.sensor', color: '#AABDB8' },
  unknown: { label: 'topo.t.unknown', color: '#AEB9B6' },
};

const TOPO_GROUPS: Array<{ titleKey: string; types: C2DeviceType[] }> = [
  {
    titleKey: 'topo.group.plant',
    types: ['plc', 'hmi', 'rtu', 'scada', 'drive', 'relay', 'robot', 'switch', 'gateway', 'sensor'],
  },
  {
    titleKey: 'topo.group.net',
    types: [
      'self',
      'router',
      'internet',
      'pc',
      'phone',
      'tv',
      'printer',
      'iot',
      'camera',
      'console',
      'nas',
      'speaker',
      'unknown',
    ],
  },
];

const TOPO_ICONS: Record<string, TopoIconDef> = {
  router: {
    paths: ['M4.5 11.2h15v8.2h-15z', 'M8 11.2V6.4', 'M16 11.2V6.4'],
    dots: [
      [8, 5.1],
      [16, 5.1],
      [8, 15],
      [12, 15],
      [16, 15],
    ],
  },
  pc: {
    paths: ['M6 4.2h12v9H6z', 'M3.2 15.2h17.6', 'M5.2 15.2h13.6l-1.1 3.4H6.3z'],
  },
  phone: {
    paths: [
      'M9 2.4h6a2 2 0 0 1 2 2v15.2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4.4a2 2 0 0 1 2-2z',
      'M10.6 18.7h2.8',
    ],
  },
  tv: {
    paths: ['M3 4.2h18v11.2H3z', 'M8.2 15.4l-1.4 3.4', 'M15.8 15.4l1.4 3.4'],
  },
  printer: {
    paths: ['M7.2 8V3.4h9.6V8', 'M4 8.4h16v6.4H4z', 'M7.4 13.2h9.2V20.4H7.4z'],
    dots: [[16.6, 11]],
  },
  iot: {
    paths: [
      'M12 2.6a5.4 5.4 0 0 0-3.4 9.6c.7.6 1.1 1.3 1.2 2.1h4.4c.1-.8.5-1.5 1.2-2.1A5.4 5.4 0 0 0 12 2.6z',
      'M9.5 16.4h5',
      'M10.2 18.6h3.6',
      'M10.7 20.7h2.6',
    ],
  },
  camera: {
    paths: ['M12 14.4v3.8', 'M8 20.8h8'],
    circles: [
      [12, 9, 5],
      [12, 9, 1.8],
    ],
  },
  console: {
    paths: [
      'M8 9.6h8a3.6 3.6 0 0 1 3.6 3.6v.6a2.7 2.7 0 0 1-4.6 1.9l-.9-1.1H9.9l-.9 1.1A2.7 2.7 0 0 1 4.4 13.8v-.6A3.6 3.6 0 0 1 8 9.6z',
      'M8.1 12v2.5',
      'M6.85 13.25h2.5',
    ],
    dots: [
      [15.5, 12.2],
      [17.5, 14.2],
    ],
  },
  nas: {
    paths: ['M4 4.4h16v6.2H4z', 'M4 13.4h16v6.2H4z'],
    dots: [
      [7.1, 7.5],
      [7.1, 16.5],
    ],
  },
  speaker: {
    paths: [
      'M9 2.8h6a1.6 1.6 0 0 1 1.6 1.6v15.2a1.6 1.6 0 0 1-1.6 1.6H9a1.6 1.6 0 0 1-1.6-1.6V4.4A1.6 1.6 0 0 1 9 2.8z',
    ],
    circles: [[12, 15.2, 2.5]],
    dots: [[12, 7]],
  },
  self: {
    paths: ['M3.2 4.4h17.6v14.2H3.2z', 'M7 9l2.7 2.4L7 13.8', 'M11.6 14.2h4.6'],
  },
  internet: {
    paths: ['M7 18.2a4.6 4.6 0 0 1-.5-9.1A6.1 6.1 0 0 1 18.2 8.2 3.9 3.9 0 0 1 17.6 18.2H7z'],
  },
  unknown: {
    circles: [[12, 12, 8.4]],
    text: '?',
  },
  plc: {
    paths: ['M3.2 6.2h17.6v11.6H3.2z', 'M7.6 6.2v11.6', 'M12 6.2v11.6', 'M16.4 6.2v11.6'],
    dots: [
      [5.4, 9.6],
      [5.4, 14.4],
      [9.8, 12],
      [14.2, 12],
    ],
  },
  hmi: {
    paths: [
      'M2.6 3.6h18.8v16.8H2.6z',
      'M4.6 5.8h11.4v9.4H4.6z',
      'M17.2 7h1.6',
      'M17.2 10.6h1.6',
      'M17.2 14.2h1.6',
    ],
  },
  rtu: {
    paths: ['M7 8.2h10v12H7z', 'M12 8.2V3.8'],
    dots: [
      [12, 2.8],
      [9.4, 12.6],
      [12, 12.6],
      [14.6, 12.6],
    ],
  },
  scada: {
    paths: [
      'M1.6 5.2h9.4v7.4H1.6z',
      'M13 7h9.4v7.4H13z',
      'M6.3 12.6v2.8',
      'M17.7 14.4v1.8',
      'M3.8 17.8h16.4',
    ],
  },
  drive: {
    paths: ['M4 3.6h16v16.8H4z', 'M7.2 7h9.6', 'M7.2 10h9.6', 'M7.2 13h9.6', 'M8 16.6h8'],
  },
  relay: {
    paths: ['M6.2 2.8h11.6v18.4H6.2z', 'M8.2 5.8h7.6v3.8H8.2z'],
    dots: [
      [9, 12.8],
      [12, 12.8],
      [15, 12.8],
      [9, 16.6],
      [15, 16.6],
    ],
  },
  robot: {
    paths: ['M4.8 19.6h7.2', 'M8.4 19.6V14', 'M8.4 14h6.4', 'M14.8 14V8', 'M14.8 8h4'],
    circles: [
      [18.8, 8, 1.7],
      [8.4, 19.6, 2.1],
    ],
  },
  switch: {
    paths: [
      'M3 8h18v8.4H3z',
      'M6 10.2v4',
      'M9.4 10.2v4',
      'M12.8 10.2v4',
      'M16.2 10.2v4',
    ],
    dots: [[5, 9.2]],
  },
  gateway: {
    paths: [
      'M2.4 7h6.4v10H2.4z',
      'M15.2 7h6.4v10h-6.4z',
      'M8.8 12h4.4',
      'M11.8 9.6 L14.8 12 L11.8 14.4',
    ],
  },
  sensor: {
    paths: ['M12 11.2v6.6', 'M8 20.4h8'],
    circles: [[12, 7.2, 3.8]],
  },
};

function drawTopoIcon(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const icon = TOPO_ICONS[type] || TOPO_ICONS.unknown;
  const s = size / 24;
  ctx.save();
  ctx.translate(x - 12 * s, y - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.9 / s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const d of icon.paths || []) {
    ctx.stroke(new Path2D(d));
  }
  for (const [cx, cy, r] of icon.circles || []) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const [dx, dy] of icon.dots || []) {
    ctx.beginPath();
    ctx.arc(dx, dy, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (icon.text) {
    ctx.font = '700 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.text, 12, 12.5);
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

const TopoTypeSvg: React.FC<{ type: string; color: string; size?: number }> = ({
  type,
  color,
  size = 16,
}) => {
  const icon = TOPO_ICONS[type] || TOPO_ICONS.unknown;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {(icon.paths || []).map((d, idx) => (
        <path key={`p-${idx}`} d={d} />
      ))}
      {(icon.circles || []).map(([cx, cy, r], idx) => (
        <circle key={`c-${idx}`} cx={cx} cy={cy} r={r} />
      ))}
      {(icon.dots || []).map(([cx, cy], idx) => (
        <circle key={`d-${idx}`} cx={cx} cy={cy} r={1.1} fill={color} stroke="none" />
      ))}
      {icon.text && (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fill={color}
          stroke="none"
          fontSize="11"
          fontWeight="700"
          fontFamily="monospace"
        >
          {icon.text}
        </text>
      )}
    </svg>
  );
};

interface SimNode extends C2TopologyNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

interface SimEdge {
  a: SimNode;
  b: SimNode;
  kind?: string;
  count?: number;
}

interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  mode: 'drag' | 'pan';
  dragNode: SimNode | null;
}

export const TopologyPanel: React.FC = () => {
  const { showToast } = useVault();
  const {
    lang,
    t,
    currentInterface,
    topologyData,
    setTopologyData,
    pinHostTarget,
    scanHostPorts,
    addLog,
  } = useC2();

  const [scanMode, setScanMode] = useState<'quiet' | 'aggressive' | null>(null);
  const [selectedNode, setSelectedNode] = useState<C2TopologyNode | null>(null);
  const [nodeFilter, setNodeFilter] = useState('');
  const [zoomPct, setZoomPct] = useState(100);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<{
    nodes: SimNode[];
    edges: SimEdge[];
    pan: { x: number; y: number };
    zoom: number;
    selectedId: string | null;
    width: number;
    height: number;
  }>({
    nodes: [],
    edges: [],
    pan: { x: 0, y: 0 },
    zoom: 1,
    selectedId: null,
    width: 720,
    height: 460,
  });

  const pointerRef = useRef<PointerSession | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const seedGraph = useCallback((data: C2TopologyData) => {
    const sim = simRef.current;
    const cx = sim.width / 2;
    const cy = sim.height / 2;
    const byId = new Map<string, SimNode>();

    const count = data.nodes.length;
    sim.nodes = data.nodes.map((n, i) => {
      const angle = (i / Math.max(1, count - 1)) * Math.PI * 2;
      const radius = n.type === 'internet' ? 0 : n.type === 'router' ? 110 : 220 + (i % 3) * 45;
      const simNode: SimNode = {
        ...n,
        x:
          n.type === 'internet'
            ? cx
            : cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 30,
        y:
          n.type === 'internet'
            ? cy - 210
            : cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        fixed: false,
      };
      byId.set(simNode.id, simNode);
      return simNode;
    });

    sim.edges = (data.edges || [])
      .map((e) => {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) return null;
        return { a, b, kind: e.kind, count: e.count } as SimEdge;
      })
      .filter((e): e is SimEdge => e !== null);

    sim.pan = { x: 0, y: 0 };
    sim.zoom = 1;
    setZoomPct(100);
  }, []);

  // Re-seed whenever topologyData updates (including when returning to this panel)
  useEffect(() => {
    if (!topologyData) {
      simRef.current.nodes = [];
      simRef.current.edges = [];
      simRef.current.selectedId = null;
      setSelectedNode(null);
      return;
    }
    seedGraph(topologyData);
    if (simRef.current.selectedId) {
      const stillExists = topologyData.nodes.find((n) => n.id === simRef.current.selectedId) || null;
      if (!stillExists) {
        simRef.current.selectedId = null;
        setSelectedNode(null);
      } else {
        setSelectedNode(stillExists);
      }
    }
  }, [topologyData, seedGraph]);

  // ResizeObserver for sharp HiDPI rendering
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      simRef.current.width = rect.width;
      simRef.current.height = rect.height;
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Force-directed simulation + canvas render loop
  useEffect(() => {
    let rafId = 0;

    const step = () => {
      const sim = simRef.current;
      const nodes = sim.nodes;
      if (nodes.length === 0) return;

      // Pairwise repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          if (d2 > 260 * 260) continue;
          const d = Math.sqrt(d2);
          const f = 2600 / d2;
          dx /= d;
          dy /= d;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }

      // Edge springs
      for (const e of sim.edges) {
        const dx = e.b.x - e.a.x;
        const dy = e.b.y - e.a.y;
        const d = Math.hypot(dx, dy) || 1;
        const target = 150;
        const f = (d - target) * 0.015;
        const ux = dx / d;
        const uy = dy / d;
        e.a.vx += ux * f;
        e.a.vy += uy * f;
        e.b.vx -= ux * f;
        e.b.vy -= uy * f;
      }

      // Center gravity + integration
      const cx = sim.width / 2;
      const cy = sim.height / 2;
      for (const n of nodes) {
        if (n.fixed) continue;
        if (n.type === 'internet') {
          n.x = cx;
          n.y = cy - 210;
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx += (cx - n.x) * 0.0018;
        n.vy += (cy - n.y) * 0.0018;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += Math.max(-14, Math.min(14, n.vx));
        n.y += Math.max(-14, Math.min(14, n.vy));
      }
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const sim = simRef.current;
      const W = sim.width;
      const H = sim.height;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const toScreen = (wx: number, wy: number) => ({
        x: wx * sim.zoom + sim.pan.x,
        y: wy * sim.zoom + sim.pan.y,
      });

      // Edges
      for (const e of sim.edges) {
        const p1 = toScreen(e.a.x, e.a.y);
        const p2 = toScreen(e.b.x, e.b.y);
        if (e.kind === 'traffic') {
          ctx.strokeStyle = 'rgba(169, 130, 66, 0.55)';
          ctx.lineWidth = 1 + Math.min(2.5, Math.log2((e.count || 1) + 1) / 2);
          ctx.setLineDash([]);
        } else {
          const isUp = e.a.type === 'internet' || e.b.type === 'internet';
          ctx.strokeStyle = isUp ? 'rgba(217, 224, 222, 0.2)' : 'rgba(169, 130, 66, 0.3)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash(isUp ? [4, 6] : []);
        }
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Nodes
      ctx.textAlign = 'center';
      for (const n of sim.nodes) {
        const cfg = TOPO_TYPES[n.type] || TOPO_TYPES.unknown;
        const p = toScreen(n.x, n.y);
        const base = n.type === 'router' || n.type === 'self' ? 22 : n.type === 'internet' ? 19 : 16;
        const rad = Math.max(14, base * sim.zoom);
        const isSelected = n.id === sim.selectedId;

        ctx.fillStyle = 'rgba(8, 10, 10, 0.96)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#FFFFFF' : cfg.color;
        ctx.lineWidth = isSelected ? 2.5 : 1.6;
        ctx.stroke();

        const ink = isSelected ? '#F4F4F2' : cfg.color;
        drawTopoIcon(ctx, n.type, p.x, p.y, rad * 1.32, ink);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${Math.max(10, 12 * sim.zoom)}px "Poppins", sans-serif`;
        ctx.fillStyle = '#E4E9E7';
        const rawLabel = n.type === 'self' ? tRef.current('topo.t.self') : n.label || n.ip || n.id;
        const label = rawLabel.length > 18 ? `${rawLabel.slice(0, 15)}...` : rawLabel;
        ctx.fillText(label, p.x, p.y + rad + 16);

        if (n.ip) {
          ctx.fillStyle = '#AEB9B6';
          ctx.font = `${Math.max(9, 10.5 * sim.zoom)}px "JetBrains Mono", monospace`;
          ctx.fillText(n.ip, p.x, p.y + rad + 29);
        }
      }
    };

    const tick = () => {
      step();
      draw();
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const toWorld = (sx: number, sy: number) => {
    const sim = simRef.current;
    return {
      x: (sx - sim.pan.x) / sim.zoom,
      y: (sy - sim.pan.y) / sim.zoom,
    };
  };

  const pickNode = (sx: number, sy: number): SimNode | null => {
    const sim = simRef.current;
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const n = sim.nodes[i];
      const px = n.x * sim.zoom + sim.pan.x;
      const py = n.y * sim.zoom + sim.pan.y;
      const hitRadius = Math.max(22, 24 * sim.zoom);
      if (Math.hypot(px - sx, py - sy) <= hitRadius) {
        return n;
      }
    }
    return null;
  };

  const applyZoom = useCallback((factor: number, anchorX?: number, anchorY?: number) => {
    const sim = simRef.current;
    const nextZoom = Math.min(3, Math.max(0.25, sim.zoom * factor));
    const ax = anchorX ?? sim.width / 2;
    const ay = anchorY ?? sim.height / 2;
    const wx = (ax - sim.pan.x) / sim.zoom;
    const wy = (ay - sim.pan.y) / sim.zoom;
    sim.zoom = nextZoom;
    sim.pan.x = ax - wx * nextZoom;
    sim.pan.y = ay - wy * nextZoom;
    setZoomPct(Math.round(nextZoom * 100));
  }, []);

  const handleResetView = useCallback(() => {
    const sim = simRef.current;
    sim.pan = { x: 0, y: 0 };
    sim.zoom = 1;
    setZoomPct(100);
  }, []);

  // Native non-passive wheel zoom listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.12 : 0.89;
      applyZoom(factor, sx, sy);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  const cleanupPointer = (canvas: HTMLCanvasElement, pointerId: number) => {
    const session = pointerRef.current;
    if (session?.dragNode) {
      session.dragNode.fixed = false;
    }
    pointerRef.current = null;
    try {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore if capture already released
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture not supported
    }

    const hit = pickNode(sx, sy);
    if (hit) {
      hit.fixed = true;
      hit.vx = 0;
      hit.vy = 0;
    }

    pointerRef.current = {
      pointerId: e.pointerId,
      startX: sx,
      startY: sy,
      lastX: sx,
      lastY: sy,
      moved: false,
      mode: hit ? 'drag' : 'pan',
      dragNode: hit,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!session.moved && Math.hypot(sx - session.startX, sy - session.startY) > 4) {
      session.moved = true;
    }

    if (session.mode === 'drag' && session.dragNode) {
      const w = toWorld(sx, sy);
      session.dragNode.x = w.x;
      session.dragNode.y = w.y;
      session.dragNode.vx = 0;
      session.dragNode.vy = 0;
    } else if (session.mode === 'pan') {
      simRef.current.pan.x += sx - session.lastX;
      simRef.current.pan.y += sy - session.lastY;
      session.lastX = sx;
      session.lastY = sy;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = pointerRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const wasClick = session && session.pointerId === e.pointerId && !session.moved;
    cleanupPointer(e.currentTarget, e.pointerId);

    if (wasClick) {
      const hit = pickNode(sx, sy);
      if (hit) {
        simRef.current.selectedId = hit.id;
        setSelectedNode({ ...hit });
      } else {
        simRef.current.selectedId = null;
        setSelectedNode(null);
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    cleanupPointer(e.currentTarget, e.pointerId);
  };

  const handleSelectNodeById = (node: C2TopologyNode) => {
    simRef.current.selectedId = node.id;
    setSelectedNode(node);
    const simNode = simRef.current.nodes.find((n) => n.id === node.id);
    if (simNode) {
      simRef.current.pan.x = simRef.current.width / 2 - simNode.x * simRef.current.zoom;
      simRef.current.pan.y = simRef.current.height / 2 - simNode.y * simRef.current.zoom;
    }
  };

  const handleRunTopology = async (aggressive: boolean) => {
    if (!currentInterface || !currentInterface.cidr) {
      const msg = t('hosts.noCidr');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setScanMode(aggressive ? 'aggressive' : 'quiet');
    addLog(
      'info',
      t('topo.running', {
        mode: aggressive ? t('topo.modeAgg') : t('topo.modeQuiet'),
        cidr: currentInterface.cidr,
      })
    );

    try {
      const data = await c2Api.runTopology({
        interface: currentInterface.name,
        cidr: currentInterface.cidr,
        aggressive,
      });
      setTopologyData(data);
      addLog(
        'info',
        t('topo.ready', {
          nodes: data.nodes.length,
          edges: data.edges.length,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Topology scan failed';
      addLog('error', t('topo.fail', { msg }));
      showToast(msg, 'error');
    } finally {
      setScanMode(null);
    }
  };

  const filteredNodes = useMemo(() => {
    const nodes = topologyData?.nodes || [];
    const q = nodeFilter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => {
      const hay = [n.label, n.ip, n.hostname, n.mac, n.vendor, n.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [topologyData, nodeFilter]);

  const selectedCfg = selectedNode
    ? TOPO_TYPES[selectedNode.type] || TOPO_TYPES.unknown
    : null;

  return (
    <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2.5">
            <Network size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('topo.title')}</h2>
            {topologyData && (
              <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
                {topologyData.nodes.length} / {topologyData.edges.length}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('topo.hint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRunTopology(false)}
            disabled={scanMode !== null}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {scanMode === 'quiet' ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Radar size={15} aria-hidden="true" />
            )}
            <span>{scanMode === 'quiet' ? t('topo.mapping') : t('topo.passive')}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunTopology(true)}
            disabled={scanMode !== null}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-500/40 bg-obsidian-surface px-3.5 py-2 text-xs font-semibold text-amber-200 transition-colors hover:border-obsidian-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {scanMode === 'aggressive' ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Maximize2 size={15} aria-hidden="true" />
            )}
            <span>{scanMode === 'aggressive' ? t('topo.scanning') : t('topo.aggressive')}</span>
          </button>
        </div>
      </div>

      {/* Main Graph + Details/Accessible Node List */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        {/* Interactive Canvas */}
        <div
          ref={containerRef}
          className="relative h-[420px] sm:h-[500px] w-full overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-bg dot-grid-canvas"
        >
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none' }}
            aria-label={t('topo.title')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            className="h-full w-full cursor-grab active:cursor-grabbing"
          />

          {/* Empty state overlay */}
          {(!topologyData || topologyData.nodes.length === 0) && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <Network size={28} className="mb-2 text-obsidian-gold/60" aria-hidden="true" />
              <p className="text-xs text-obsidian-muted">
                {lang === 'es'
                  ? 'Ejecuta un mapeo sigiloso o agresivo para visualizar los dispositivos de la red.'
                  : 'Run a quiet or aggressive topology scan to visualize discovered devices.'}
              </p>
            </div>
          )}

          {/* Accessible Zoom Controls */}
          <div
            role="group"
            aria-label={lang === 'es' ? 'Controles de zoom' : 'Zoom controls'}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-panel/90 p-1 shadow-obsidian"
          >
            <button
              type="button"
              onClick={() => applyZoom(0.85)}
              title={lang === 'es' ? 'Alejar' : 'Zoom out'}
              aria-label={lang === 'es' ? 'Alejar' : 'Zoom out'}
              className="inline-flex min-h-[44px] min-w-[44px] lg:min-h-9 lg:min-w-9 items-center justify-center rounded text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
            >
              <ZoomOut size={14} aria-hidden="true" />
            </button>
            <span className="min-w-[44px] text-center font-mono text-[11px] text-obsidian-text">
              {zoomPct}%
            </span>
            <button
              type="button"
              onClick={() => applyZoom(1.18)}
              title={lang === 'es' ? 'Acercar' : 'Zoom in'}
              aria-label={lang === 'es' ? 'Acercar' : 'Zoom in'}
              className="inline-flex min-h-[44px] min-w-[44px] lg:min-h-9 lg:min-w-9 items-center justify-center rounded text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
            >
              <ZoomIn size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              title={lang === 'es' ? 'Restablecer vista' : 'Reset view'}
              aria-label={lang === 'es' ? 'Restablecer vista' : 'Reset view'}
              className="inline-flex min-h-[44px] min-w-[44px] lg:min-h-9 lg:min-w-9 items-center justify-center rounded text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right Column: Selected Node Details + Keyboard Accessible Node List */}
        <div className="flex flex-col gap-3">
          {selectedNode && selectedCfg && (
            <div className="rounded-xl border border-obsidian-gold/40 bg-obsidian-surface p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-obsidian-border pb-2.5">
                <div className="flex items-center gap-2">
                  <TopoTypeSvg type={selectedNode.type} color={selectedCfg.color} size={18} />
                  <div>
                    <div className="text-xs font-bold text-white">{t(selectedCfg.label)}</div>
                    {selectedNode.label && (
                      <div className="font-mono text-[11px] text-obsidian-gold">
                        {selectedNode.label}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    simRef.current.selectedId = null;
                    setSelectedNode(null);
                  }}
                  aria-label={lang === 'es' ? 'Cerrar detalle' : 'Close details'}
                  className="inline-flex min-h-[44px] min-w-[44px] lg:min-h-9 lg:min-w-9 items-center justify-center rounded-lg border border-obsidian-border bg-obsidian-panel text-obsidian-muted hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>

              <dl className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">IP</dt>
                  <dd className="font-mono text-white text-right">{selectedNode.ip || '-'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">Hostname</dt>
                  <dd className="font-mono text-white text-right break-all">
                    {selectedNode.hostname || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">MAC</dt>
                  <dd className="font-mono text-obsidian-text text-right">
                    {selectedNode.mac || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">{t('topo.f.vendor')}</dt>
                  <dd className="text-white text-right">{selectedNode.vendor || '-'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">{t('topo.f.os')}</dt>
                  <dd className="font-mono text-emerald-300 text-right">
                    {selectedNode.os
                      ? `${selectedNode.os}${selectedNode.ttl ? ` (TTL ${selectedNode.ttl})` : ''}`
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">{t('topo.f.ports')}</dt>
                  <dd className="font-mono text-obsidian-gold text-right">
                    {selectedNode.open_ports && selectedNode.open_ports.length > 0
                      ? selectedNode.open_ports.join(', ')
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-obsidian-muted">{t('topo.f.conf')}</dt>
                  <dd className="font-mono text-white text-right">
                    {selectedNode.confidence !== undefined ? `${selectedNode.confidence}%` : '-'}
                  </dd>
                </div>
                <div className="border-t border-obsidian-border/70 pt-1.5">
                  <dt className="text-obsidian-muted">{t('topo.f.evidence')}</dt>
                  <dd className="mt-1 font-mono text-[11px] text-obsidian-text">
                    {selectedNode.evidence && selectedNode.evidence.length > 0
                      ? selectedNode.evidence.join(', ')
                      : '-'}
                  </dd>
                </div>
              </dl>

              {selectedNode.ip && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-obsidian-border/70 pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      pinHostTarget(selectedNode.ip!);
                      showToast(t('hosts.targetSet', { ip: selectedNode.ip! }), 'info');
                    }}
                    className="inline-flex min-h-[44px] lg:min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 px-2.5 py-1 text-[11px] font-semibold text-white hover:border-obsidian-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                  >
                    <Crosshair size={12} aria-hidden="true" />
                    <span>{t('hosts.target')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scanHostPorts(selectedNode.ip!)}
                    className="inline-flex min-h-[44px] lg:min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 py-1 text-[11px] font-medium text-obsidian-text hover:border-obsidian-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                  >
                    <ScanSearch size={12} aria-hidden="true" />
                    <span>{t('hosts.ports')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Accessible Node Filter + Keyboard Fallback List */}
          <div className="flex flex-1 flex-col rounded-xl border border-obsidian-border bg-obsidian-surface/70 p-3">
            <label
              htmlFor="topo-node-filter"
              className="text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted"
            >
              {lang === 'es' ? 'Nodos descubiertos' : 'Discovered nodes'} (
              {filteredNodes.length})
            </label>
            <div className="relative mt-2">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-obsidian-muted"
                aria-hidden="true"
              />
              <input
                id="topo-node-filter"
                type="text"
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                placeholder={
                  lang === 'es' ? 'Filtrar IP, etiqueta, tipo...' : 'Filter IP, label, type...'
                }
                className="min-h-[44px] lg:min-h-[38px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel pl-8 pr-3 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
              />
            </div>

            <div className="mt-2.5 max-h-[260px] flex-1 space-y-1 overflow-y-auto pr-1">
              {filteredNodes.length === 0 ? (
                <p className="py-3 text-center text-xs text-obsidian-muted">
                  {lang === 'es' ? 'Sin nodos en la lista' : 'No matching nodes'}
                </p>
              ) : (
                filteredNodes.map((n) => {
                  const cfg = TOPO_TYPES[n.type] || TOPO_TYPES.unknown;
                  const active = selectedNode?.id === n.id;
                  const displayLabel =
                    n.type === 'self' ? t('topo.t.self') : n.label || n.ip || n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSelectNodeById(n)}
                      aria-pressed={active}
                      className={`flex min-h-[44px] lg:min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                        active
                          ? 'border-obsidian-gold bg-obsidian-gold/15 text-white'
                          : 'border-obsidian-border/60 bg-obsidian-panel/70 text-obsidian-text hover:border-obsidian-borderLight hover:text-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TopoTypeSvg type={n.type} color={cfg.color} size={15} />
                        <span className="truncate font-medium">{displayLabel}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-obsidian-muted">
                        {n.ip || t(cfg.label)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Plant / Network Legend */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface/60 p-3.5 md:grid-cols-2">
        {TOPO_GROUPS.map((group) => (
          <div key={group.titleKey}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-obsidian-gold">
              {t(group.titleKey)}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.types.map((typeKey) => {
                const cfg = TOPO_TYPES[typeKey];
                if (!cfg) return null;
                return (
                  <div
                    key={typeKey}
                    className="inline-flex items-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-panel px-2 py-1 text-[11px] text-obsidian-text"
                  >
                    <TopoTypeSvg type={typeKey} color={cfg.color} size={14} />
                    <span>{t(cfg.label)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
