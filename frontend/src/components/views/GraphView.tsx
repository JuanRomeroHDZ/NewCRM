import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Network, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, 
  ShieldAlert, Layers, Filter, Eye, Info 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { GraphData, GraphNode, GraphLink } from '../../types';

export const GraphView: React.FC = () => {
  const { openInspector, dataVersion } = useVault();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'emails' | 'platforms'>('all');
  const [highlightSPOF, setHighlightSPOF] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Transform state: pan & zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Simulation nodes state
  const simNodesRef = useRef<GraphNode[]>([]);
  const simLinksRef = useRef<GraphLink[]>([]);

  useEffect(() => {
    api.getGraph().then((data) => {
      setGraphData(data);

      // Initialize node positions in a radial / distributed layout
      const width = 1000;
      const height = 700;
      const emailNodes = data.nodes.filter(n => n.type === 'email');
      const platformNodes = data.nodes.filter(n => n.type === 'platform');
      const prospectNodes = data.nodes.filter(n => n.type === 'prospect');
      const paymentNodes = data.nodes.filter(n => n.type === 'payment');

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
      const emailPosMap = new Map(emailNodes.map(e => [e.id, { x: e.x || 0, y: e.y || 0 }]));
      const platformsPerEmail = new Map<string, number>();

      platformNodes.forEach((pNode) => {
        const parentLink = data.links.find(l => l.target === pNode.id && l.type === 'child');
        const parentId = parentLink?.source || emailNodes[0]?.id;
        const parentPos = emailPosMap.get(parentId) || { x: width / 2, y: height / 2 };

        const currentCount = platformsPerEmail.get(parentId) || 0;
        platformsPerEmail.set(parentId, currentCount + 1);

        const subAngle = (currentCount * 1.1) + Math.random() * 0.5;
        const subDist = 120 + Math.random() * 40;
        pNode.x = parentPos.x + Math.cos(subAngle) * subDist;
        pNode.y = parentPos.y + Math.sin(subAngle) * subDist;
        pNode.vx = 0;
        pNode.vy = 0;
      });

      // Place prospects radially around their parent email (or on right side if unlinked)
      const prospectsPerEmail = new Map<string, number>();
      prospectNodes.forEach((prNode, idx) => {
        const parentLink = data.links.find(l => l.target === prNode.id && l.type === 'prospect');
        const parentId = parentLink?.source;
        const parentPos = parentId ? emailPosMap.get(parentId) : undefined;

        if (parentPos && parentId) {
          const currentCount = prospectsPerEmail.get(parentId) || 0;
          prospectsPerEmail.set(parentId, currentCount + 1);
          const subAngle = Math.PI + (currentCount * 0.95) + 0.3;
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

      // Center initial canvas view
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        transformRef.current = {
          x: (rect.width - width) / 2,
          y: (rect.height - height) / 2,
          scale: 0.95
        };
      }
    });
  }, [dataVersion]);

  // Main Render Loop for HTML5 Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Pan & Zoom
    const { x, y, scale } = transformRef.current;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const nodes = simNodesRef.current;
    const links = simLinksRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 1. Draw Links
    links.forEach((link) => {
      const src = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!src || !tgt || src.x === undefined || tgt.x === undefined) return;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y!);
      ctx.lineTo(tgt.x, tgt.y!);

      if (link.type === 'recovery') {
        // Dotted recovery chain link
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
        // Solid child platform link
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw arrow on recovery link
      if (link.type === 'recovery') {
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y! + tgt.y!) / 2;
        ctx.beginPath();
        ctx.arc(midX, midY, 3, 0, Math.PI * 2);
        ctx.fillStyle = link.is_cycle ? '#f43f5e' : '#06b6d4';
        ctx.fill();
      }
    });

    // 2. Draw Nodes
    nodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isHovered = hoveredNode?.id === node.id;
      const isCritical = highlightSPOF && node.is_critical_failure_point;

      if (node.type === 'email') {
        // Prominent Root Email Node
        const radius = isCritical ? 28 : 24;

        // Outer glow if critical failure point
        if (isCritical) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
          ctx.fill();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#17191f';
        ctx.fill();
        ctx.lineWidth = isCritical ? 2.5 : 2;
        ctx.strokeStyle = isCritical ? '#f43f5e' : '#6366f1';
        ctx.stroke();

        // Node Label
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 16);

        // Subtitle badge
        ctx.font = '500 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(
          `${node.metrics.platforms_count || 0} hijos • ${node.sub_type}`,
          node.x,
          node.y + radius + 30
        );

        // Inside icon letter
        ctx.font = 'bold 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = isCritical ? '#f43f5e' : '#818cf8';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 5);

      } else if (node.type === 'platform') {
        // Child Platform Node
        const radius = 16;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#14161c';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = node.status === 'free_trial' ? '#f59e0b' : '#38bdf8';
        ctx.stroke();

        // Label
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 14);

        // Icon initial
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 4);

      } else if (node.type === 'prospect') {
        // Prospect / Demo Node
        const radius = 15;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#262a33' : '#1b1815';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = node.status === 'respondido'
          ? '#10b981'
          : node.status === 'tiempo_agotado'
          ? '#f43f5e'
          : '#f59e0b';
        ctx.stroke();

        // Label
        ctx.font = '500 10.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 13);

        // Icon initial
        ctx.font = 'bold 9.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = node.status === 'respondido' ? '#10b981' : '#f59e0b';
        ctx.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y + 3.5);

      } else {
        // Payment Node
        const radius = 14;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#10b98115';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();

        ctx.font = '500 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + radius + 12);
      }
    });

    ctx.restore();
  }, [hoveredNode, highlightSPOF]);

  // Handle Resize & Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Find node under mouse coords
  const getNodeAtCoords = (clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { x, y, scale } = transformRef.current;

    const mouseX = (clientX - rect.left - x) / scale;
    const mouseY = (clientY - rect.top - y) / scale;

    const nodes = simNodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.x === undefined || n.y === undefined) continue;
      const hitRadius = n.type === 'email' ? 32 : 20;
      const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
      if (dist <= hitRadius) {
        return n;
      }
    }
    return null;
  };

  // Mouse / Canvas Events
  const handleMouseDown = (e: React.MouseEvent) => {
    const clickedNode = getNodeAtCoords(e.clientX, e.clientY);
    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
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
      setHoveredNode(node);
      draw();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggedNodeRef.current) {
      // If barely moved, treat as click to open inspector
      const n = draggedNodeRef.current;
      draggedNodeRef.current = null;
      if (n.entity_id) {
        openInspector(n.type as any, n.entity_id);
      }
    }
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.3, Math.min(2.5, transformRef.current.scale * zoomFactor));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newScale / transformRef.current.scale);
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newScale / transformRef.current.scale);
    transformRef.current.scale = newScale;
    draw();
  };

  const handleResetZoom = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    transformRef.current = {
      x: canvas.width / 4,
      y: canvas.height / 5,
      scale: 0.95
    };
    draw();
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-obsidian-bg dot-grid-canvas overflow-hidden select-none">
      {/* Top Floating Controls */}
      <div className="absolute top-4 left-6 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-obsidian-panel/90 backdrop-blur-md border border-obsidian-border shadow-xl text-xs">
          <button
            type="button"
            onClick={() => setHighlightSPOF(!highlightSPOF)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              highlightSPOF
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-obsidian-muted hover:text-white'
            }`}
          >
            <ShieldAlert size={14} />
            <span>Puntos de Falla (SPOF)</span>
          </button>
        </div>

        {/* Cycles Alert Banner */}
        {graphData?.cycles_detected && graphData.cycles_detected.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs backdrop-blur-md">
            <AlertTriangle size={14} className="text-amber-400" />
            <span>Ciclo detectado en recuperación de correos</span>
          </div>
        )}
      </div>

      {/* Floating Zoom & Pan Controls */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-1.5 p-1.5 rounded-xl bg-obsidian-panel/90 backdrop-blur-md border border-obsidian-border shadow-xl text-obsidian-muted">
        <button
          type="button"
          onClick={() => {
            transformRef.current.scale = Math.min(2.5, transformRef.current.scale * 1.2);
            draw();
          }}
          title="Zoom in"
          className="p-2 hover:text-white hover:bg-obsidian-surface rounded-lg transition-colors"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            transformRef.current.scale = Math.max(0.3, transformRef.current.scale * 0.8);
            draw();
          }}
          title="Zoom out"
          className="p-2 hover:text-white hover:bg-obsidian-surface rounded-lg transition-colors"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title="Restablecer vista"
          className="p-2 hover:text-white hover:bg-obsidian-surface rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Legend Card */}
      <div className="absolute bottom-6 left-6 z-10 p-3 rounded-xl bg-obsidian-panel/90 backdrop-blur-md border border-obsidian-border shadow-xl text-[11px] space-y-1.5 text-obsidian-muted max-w-xs">
        <div className="font-semibold text-white text-xs mb-1">Leyenda del Grafo</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-indigo-500 bg-obsidian-card" />
          <span>Correo Raíz (Padre)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-cyan-400 bg-obsidian-card" />
          <span>Plataforma / Servicio (Hijo)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-amber-400 bg-obsidian-card" />
          <span>Prospecto / Demo (CRM)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 border-t border-dashed border-cyan-400" />
          <span>Cadena de Recuperación ($A \rightarrow B$)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-rose-500 bg-rose-500/20" />
          <span>Punto Único de Fallo (SPOF crítico)</span>
        </div>
      </div>

      {/* The HTML5 Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
