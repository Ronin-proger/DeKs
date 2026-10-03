import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

function linkColor(link) {
  if (link.linkType === 'semantic') return 'rgba(52, 211, 153, 0.8)';
  if (link.isNew) return 'rgba(129, 140, 248, 0.85)';
  return 'rgba(255, 255, 255, 0.2)';
}

function linkWidth(link) {
  if (link.linkType === 'semantic') return 0.8 + (link.strength || 0.5) * 1.2;
  if (link.isNew) return 1;
  return 0.35;
}

export default function KnowledgeGraph3D({ graph, onNodeClick, wordsSuffix = ' сл.' }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 420 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!graph?.nodes?.length) return { nodes: [], links: [] };

    const semanticIds = new Set();
    (graph.edges || []).forEach((edge) => {
      if (edge.linkType === 'semantic') {
        semanticIds.add(edge.source);
        semanticIds.add(edge.target);
      }
    });

    return {
      nodes: graph.nodes.map((node) => ({
        ...node,
        semantic: semanticIds.has(node.id),
      })),
      links: (graph.edges || []).map((edge) => ({ ...edge })),
    };
  }, [graph]);

  useEffect(() => {
    if (!fgRef.current || !graphData.nodes.length) return undefined;
    const distance = Math.max(320, Math.min(900, graphData.nodes.length * 42));
    const timer = window.setTimeout(() => {
      fgRef.current?.cameraPosition(
        { x: distance * 0.15, y: distance * 0.1, z: distance },
        { x: 0, y: 0, z: 0 },
        1000,
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [graphData]);

  if (!graphData.nodes.length) return null;

  return (
    <div ref={wrapRef} className="graph-3d-wrap">
      <ForceGraph3D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        controlType="orbit"
        enableNodeDrag
        showNavInfo={false}
        nodeLabel={(node) => `
          <div style="padding:4px 2px;font-family:Inter,sans-serif;font-size:12px;line-height:1.4">
            <strong>${node.label || node.id}</strong><br/>
            <span style="opacity:0.65">${node.wordCount || 0}${wordsSuffix} · ${node.domain || 'general'}</span>
          </div>
        `}
        nodeVal={(node) => 1.8 + Math.min(node.wordCount || 0, 200) / 30}
        nodeColor={(node) => (node.semantic ? '#34d399' : '#818cf8')}
        nodeOpacity={0.95}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.75}
        linkDirectionalParticles={(link) => (link.linkType === 'semantic' ? 3 : 0)}
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => '#6ee7b7'}
        onNodeClick={(node) => onNodeClick?.(node.id)}
        onNodeDragEnd={(node) => {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        }}
        cooldownTicks={150}
        warmupTicks={60}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
      />
    </div>
  );
}
