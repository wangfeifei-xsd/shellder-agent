import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { ErDiagram, ErRelationship } from '@/lib/connector';
import type { ErTableNodeData } from './ErTableNode';

const NODE_W = 240;
const NODE_H = 168;
const COL_GAP = 16;
const GAP_X = NODE_W + COL_GAP;
/** 同列表卡最小间距（略大以便连线标签露出） */
const GAP_Y = 32;
const MAX_COLS_PER_ROW = 5;
const ROW_GAP_Y = 48;
const BARYCENTER_PASSES = 6;

function assignLayersBfs(names: string[], rels: ErRelationship[]): Map<string, number> {
  const layer = new Map<string, number>();
  for (const n of names) layer.set(n, 0);

  const childrenOf = new Map<string, string[]>();
  for (const n of names) childrenOf.set(n, []);
  for (const r of rels) {
    childrenOf.get(r.to)?.push(r.from);
  }

  const asFrom = new Set(rels.map((r) => r.from));
  const queue = names.filter((n) => !asFrom.has(n));
  const visited = new Set<string>();
  for (const n of queue) {
    visited.add(n);
    layer.set(n, 0);
  }
  if (!queue.length) {
    for (const n of names) {
      queue.push(n);
      visited.add(n);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = layer.get(cur) ?? 0;
    for (const child of childrenOf.get(cur) ?? []) {
      const nextDepth = d + 1;
      if ((layer.get(child) ?? 0) < nextDepth) layer.set(child, nextDepth);
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  for (const n of names) {
    if (visited.has(n)) continue;
    let depth = 0;
    for (const r of rels) {
      if (r.from === n) depth = Math.max(depth, (layer.get(r.to) ?? 0) + 1);
    }
    layer.set(n, depth);
  }

  return layer;
}

/** 无关系时用紧凑网格，避免单列过长 */
function computeGridPositions(names: string[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cols = Math.min(MAX_COLS_PER_ROW, Math.max(1, Math.ceil(Math.sqrt(names.length))));
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  sorted.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(name, {
      x: col * GAP_X,
      y: row * (NODE_H + GAP_Y),
    });
  });
  return positions;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 根据相邻列已连接表的中心 Y，计算本表优先 top */
function preferredYTop(
  table: string,
  layerIdx: number,
  rels: ErRelationship[],
  tableToLayerIdx: Map<string, number>,
  yTop: Map<string, number>,
): number | undefined {
  const centers: number[] = [];
  for (const r of rels) {
    let other: string | undefined;
    if (r.from === table) other = r.to;
    else if (r.to === table) other = r.from;
    else continue;
    const otherIdx = tableToLayerIdx.get(other);
    if (otherIdx === undefined || Math.abs(otherIdx - layerIdx) !== 1) continue;
    const top = yTop.get(other);
    if (top !== undefined) centers.push(top + NODE_H / 2);
  }
  const med = median(centers);
  return med !== undefined ? med - NODE_H / 2 : undefined;
}

/** 同列内按关联对齐排序并错开 Y，避免表卡整齐一排挡住连线 */
function placeColumnStaggered(
  tables: string[],
  layerIdx: number,
  rels: ErRelationship[],
  tableToLayerIdx: Map<string, number>,
  yTop: Map<string, number>,
): void {
  const ordered = [...tables].sort((a, b) => {
    const ya =
      preferredYTop(a, layerIdx, rels, tableToLayerIdx, yTop) ?? yTop.get(a) ?? 0;
    const yb =
      preferredYTop(b, layerIdx, rels, tableToLayerIdx, yTop) ?? yTop.get(b) ?? 0;
    return ya - yb || a.localeCompare(b);
  });

  let cursor = 0;
  ordered.forEach((name, i) => {
    const pref = preferredYTop(name, layerIdx, rels, tableToLayerIdx, yTop);
    if (pref !== undefined) cursor = Math.max(cursor, pref);
    else cursor += i % 2 === 0 ? 0 : NODE_H * 0.12;
    yTop.set(name, cursor);
    cursor += NODE_H + GAP_Y;
  });
}

function assignStaggeredY(
  sortedLayers: number[],
  byLayer: Map<number, string[]>,
  rels: ErRelationship[],
): Map<string, number> {
  const tableToLayerIdx = new Map<string, number>();
  sortedLayers.forEach((L, idx) => {
    for (const t of byLayer.get(L) ?? []) tableToLayerIdx.set(t, idx);
  });

  const yTop = new Map<string, number>();
  for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
    const layerIndices =
      pass % 2 === 0
        ? sortedLayers.map((_, i) => i)
        : sortedLayers.map((_, i) => sortedLayers.length - 1 - i);
    for (const layerIdx of layerIndices) {
      const L = sortedLayers[layerIdx];
      placeColumnStaggered(
        byLayer.get(L) ?? [],
        layerIdx,
        rels,
        tableToLayerIdx,
        yTop,
      );
    }
  }
  return yTop;
}

function computeLayerPositions(diagram: ErDiagram): Map<string, { x: number; y: number }> {
  const names = diagram.tables.map((t) => t.name);
  const rels = diagram.relationships ?? [];
  if (!rels.length) return computeGridPositions(names);

  const layer = assignLayersBfs(names, rels);
  const byLayer = new Map<number, string[]>();
  for (const n of names) {
    const L = layer.get(n) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L)!.push(n);
  }

  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  const yTop = assignStaggeredY(sortedLayers, byLayer, rels);

  const rowTops: number[] = [0];
  const positions = new Map<string, { x: number; y: number }>();

  for (let i = 0; i < sortedLayers.length; i++) {
    const L = sortedLayers[i];
    const col = i % MAX_COLS_PER_ROW;
    const row = Math.floor(i / MAX_COLS_PER_ROW);

    if (col === 0 && row > 0) {
      let prevRowMaxBottom = 0;
      for (let c = 0; c < MAX_COLS_PER_ROW; c++) {
        const idx = (row - 1) * MAX_COLS_PER_ROW + c;
        if (idx >= sortedLayers.length) break;
        const prevL = sortedLayers[idx];
        for (const t of byLayer.get(prevL) ?? []) {
          prevRowMaxBottom = Math.max(prevRowMaxBottom, (yTop.get(t) ?? 0) + NODE_H);
        }
      }
      rowTops[row] = prevRowMaxBottom + ROW_GAP_Y;
    }

    const x = col * GAP_X;
    const rowBase = rowTops[row] ?? 0;
    for (const name of byLayer.get(L) ?? []) {
      positions.set(name, { x, y: rowBase + (yTop.get(name) ?? 0) });
    }
  }

  return positions;
}

function formatEdgeLabel(r: ErRelationship, groupSize: number): string {
  if (groupSize > 1) return `${groupSize} 条 · ${r.cardinality}`;
  const cols =
    r.fromColumns?.length && r.toColumns?.length
      ? ` ${r.fromColumns.join(',')}→${r.toColumns.join(',')}`
      : '';
  return r.inferred ? `${r.cardinality} · 推断${cols}` : `${r.cardinality}${cols}`;
}

function buildEdges(diagram: ErDiagram): Edge[] {
  const rels = diagram.relationships ?? [];
  const pairGroups = new Map<string, ErRelationship[]>();
  for (const r of rels) {
    const key = `${r.from}\0${r.to}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key)!.push(r);
  }

  return rels.map((r) => {
    const key = `${r.from}\0${r.to}`;
    const group = pairGroups.get(key) ?? [r];
    const isFirstInPair = group[0]?.id === r.id;
    return {
      id: r.id,
      source: r.from,
      target: r.to,
      type: 'smoothstep',
      label: isFirstInPair ? formatEdgeLabel(r, group.length) : undefined,
      className: r.inferred ? 'er-edge-inferred' : 'er-edge-confirmed',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: r.inferred ? '#d48806' : '#1677ff',
      },
      style: {
        stroke: r.inferred ? '#d48806' : '#1677ff',
        strokeWidth: r.inferred ? 1.5 : 2,
      },
      labelStyle: { fontSize: 10, fill: '#475569' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.95 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      animated: r.inferred,
    };
  });
}

export function diagramToFlow(diagram: ErDiagram | null): { nodes: Node[]; edges: Edge[] } {
  if (!diagram?.tables?.length) return { nodes: [], edges: [] };

  const positions = computeLayerPositions(diagram);
  const nodes: Node[] = diagram.tables.map((t) => {
    const pos = positions.get(t.name) ?? { x: 0, y: 0 };
    const data: ErTableNodeData = {
      displayName: t.displayName || t.name,
      tableName: t.name,
      columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        type: c.type,
        pk: c.pk,
        fk: c.fk,
      })),
      totalColumns: t.columns?.length ?? 0,
    };
    return {
      id: t.name,
      type: 'erTable',
      position: pos,
      data,
      draggable: true,
    };
  });

  return { nodes, edges: buildEdges(diagram) };
}

export function flowToDiagram(nodes: Node[], edges: Edge[], base: ErDiagram | null): ErDiagram {
  const tableMap = new Map((base?.tables ?? []).map((t) => [t.name, t]));
  const tables = nodes.map((n) => {
    const prev = tableMap.get(n.id);
    return (
      prev ?? {
        name: n.id,
        displayName: n.id,
        columns: [],
      }
    );
  });
  const relationships = edges.map((e) => {
    const prev = base?.relationships?.find((r) => r.id === e.id);
    return (
      prev ?? {
        id: e.id,
        from: e.source,
        to: e.target,
        fromColumns: [],
        toColumns: [],
        cardinality: 'N:1' as const,
        inferred: true,
      }
    );
  });
  return {
    version: base?.version,
    tables,
    relationships,
  };
}
