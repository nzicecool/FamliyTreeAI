import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { TreeData, Person } from '../types';
import { ArrowUp, ArrowDown, Home, ChevronRight, UserPlus, Users, ZoomIn, ZoomOut, Maximize2, RotateCcw, Search, X } from 'lucide-react';

type TreeDirection = 'descendants' | 'ancestors';

interface TreeVisualizerProps {
  data: TreeData;
  onSelectPerson: (id: string) => void;
  onSetRoot: (id: string) => void;
}

interface NodeAttrs {
  id: string;
  gender: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  photo?: string;
}

const personToAttrs = (p: Person): NodeAttrs => ({
  id: p.id,
  gender: p.gender,
  birthDate: p.birthDate,
  birthPlace: p.birthPlace,
  deathDate: p.deathDate,
  deathPlace: p.deathPlace,
  photo: p.photo,
});

const buildHierarchy = (data: TreeData, direction: TreeDirection): d3.HierarchyNode<any> | null => {
  const { people, rootId } = data;
  const rootPerson = people[rootId];
  if (!rootPerson) return null;

  const visited = new Set<string>();
  const buildNode = (personId: string): any => {
    if (visited.has(personId)) return null;
    visited.add(personId);
    const person = people[personId];
    if (!person) return null;
    const node: any = {
      name: `${person.firstName} ${person.lastName}`,
      attributes: personToAttrs(person),
      children: [],
    };
    const nextIds: string[] = direction === 'descendants'
      ? (person.childrenIds || [])
      : [person.fatherId, person.motherId].filter((x): x is string => !!x);
    nextIds.forEach(nextId => {
      const child = buildNode(nextId);
      if (child) node.children.push(child);
    });
    return node;
  };

  const hierarchyData = buildNode(rootId);
  return hierarchyData ? d3.hierarchy(hierarchyData) : null;
};

interface PersonNodeProps {
  x: number;
  y: number;
  name: string;
  attrs: NodeAttrs;
  onSelect: () => void;
  onDrag: (newX: number, newY: number) => void;
  getZoomScale: () => number;
}

const DRAG_THRESHOLD = 4;

const PersonNode: React.FC<PersonNodeProps> = ({ x, y, name, attrs, onSelect, onDrag, getZoomScale }) => {
  const isMale = attrs.gender === 'Male';
  const { birthDate, birthPlace, deathDate, deathPlace, photo, id } = attrs;
  const dragStateRef = React.useRef<{
    startScreenX: number;
    startScreenY: number;
    origX: number;
    origY: number;
    scale: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  let tooltip = name;
  if (birthDate || birthPlace) tooltip += `\nBorn: ${birthDate || '?'} ${birthPlace ? `in ${birthPlace}` : ''}`;
  if (deathDate || deathPlace) tooltip += `\nDied: ${deathDate || '?'} ${deathPlace ? `in ${deathPlace}` : ''}`;

  const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    // Stop d3-zoom from picking this up as a pan.
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      origX: x,
      origY: y,
      scale: getZoomScale() || 1,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const s = dragStateRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dxScreen = e.clientX - s.startScreenX;
    const dyScreen = e.clientY - s.startScreenY;
    if (!s.moved && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
    s.moved = true;
    onDrag(s.origX + dxScreen / s.scale, s.origY + dyScreen / s.scale);
  };

  const releaseCapture = (e: React.PointerEvent<SVGGElement>) => {
    const target = e.currentTarget;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const s = dragStateRef.current;
    releaseCapture(e);
    dragStateRef.current = null;
    if (s && !s.moved) onSelect();
  };

  const onPointerCancel = (e: React.PointerEvent<SVGGElement>) => {
    releaseCapture(e);
    dragStateRef.current = null;
  };

  return (
    <g
      data-node="person"
      transform={`translate(${x},${y})`}
      className="cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <title>{tooltip}</title>
      <circle r="24" fill={isMale ? '#0ea5e9' : '#ec4899'} className="transition-all duration-300 shadow-lg" />
      {photo ? (
        <g>
          <defs>
            <clipPath id={`clip-${id}`}>
              <circle r="20" />
            </clipPath>
          </defs>
          <image
            href={photo}
            x="-20"
            y="-20"
            width="40"
            height="40"
            clipPath={`url(#clip-${id})`}
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none"
          />
          <circle r="20" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        </g>
      ) : (
        <circle r="20" className="fill-slate-900 stroke-slate-800 pointer-events-none" />
      )}
      <text
        dy="40"
        textAnchor="middle"
        className="fill-slate-300 text-xs font-medium pointer-events-none"
        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
      >
        {name}
      </text>
      <text dy="54" textAnchor="middle" className="fill-slate-500 text-[10px] pointer-events-none">
        {birthDate?.split('-')[0] || '?'}
      </text>
    </g>
  );
};

export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ data, onSelectPerson, onSetRoot }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = React.useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomScaleRef = React.useRef(1);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const [viewTransform, setViewTransform] = React.useState<string>('translate(50,50) scale(1)');
  const [nodeOverrides, setNodeOverrides] = React.useState<Record<string, { x: number; y: number }>>({});
  const [direction, setDirection] = React.useState<TreeDirection>('descendants');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Reset per-node positions when the tree's root or layout direction changes.
  React.useEffect(() => {
    setNodeOverrides({});
  }, [data.rootId, direction]);

  // Close search dropdown on outside click.
  React.useEffect(() => {
    if (!searchOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!searchContainerRef.current) return;
      if (!searchContainerRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [searchOpen]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDimensions({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wire d3-zoom for pan + zoom on the SVG.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const selection = d3.select<SVGSVGElement, unknown>(svg);
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .filter((event: any) => {
        // Mirror d3-zoom's default guards (no ctrl unless wheel, primary button only).
        if (event.ctrlKey && event.type !== 'wheel') return false;
        if (event.button !== undefined && event.button !== 0) return false;
        const target = event.target as Element | null;
        // If the user pressed on a node, don't start a pan – let the node handler take over.
        if (target && target.closest('[data-node="person"]')) return false;
        return true;
      })
      .on('zoom', (event) => {
        const t = event.transform;
        zoomScaleRef.current = t.k;
        setViewTransform(`translate(${t.x},${t.y}) scale(${t.k})`);
      });
    zoomBehaviorRef.current = zoom;
    selection.call(zoom);
    selection.call(zoom.transform, d3.zoomIdentity.translate(50, 50).scale(1));
    return () => {
      selection.on('.zoom', null);
      zoomBehaviorRef.current = null;
    };
  }, []);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(200).call(zoom.scaleBy, factor);
  };

  const resetView = () => {
    const svg = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(250).call(zoom.transform, d3.zoomIdentity.translate(50, 50).scale(1));
  };

  const resetLayout = () => setNodeOverrides({});

  const rootPerson = data.people[data.rootId];

  // People reachable from current root in the chosen direction (descendants or ancestors).
  const descendants = useMemo(() => {
    const set = new Set<string>();
    if (!rootPerson) return set;
    const queue = [data.rootId];
    while (queue.length) {
      const id = queue.shift()!;
      if (set.has(id) || !data.people[id]) continue;
      set.add(id);
      const p = data.people[id];
      const nextIds: string[] = direction === 'descendants'
        ? (p.childrenIds || [])
        : [p.fatherId, p.motherId].filter((x): x is string => !!x);
      for (const nid of nextIds) queue.push(nid);
    }
    return set;
  }, [data, rootPerson, direction]);

  // Layout descendants with d3.tree, classify spouses, and produce base positions.
  const layout = useMemo(() => {
    const empty = {
      treeNodes: [] as Array<{ id: string; baseX: number; baseY: number; name: string; attrs: NodeAttrs }>,
      parentEdges: [] as Array<{ sourceId: string; targetId: string; sourceName: string; targetName: string }>,
      spousePairs: [] as Array<{ aId: string; bId: string }>,
      attachedSpouses: [] as Array<{ id: string; baseX: number; baseY: number; name: string; attrs: NodeAttrs; partnerIds: string[] }>,
      reachable: new Set<string>(descendants),
    };

    const root = buildHierarchy(data, direction);
    if (!root) return empty;

    const treeLayout = d3.tree<any>().size([
      Math.max(100, dimensions.width - 100),
      Math.max(100, dimensions.height - 100),
    ]);
    const laidOut = treeLayout(root);
    const d3Nodes = laidOut.descendants();
    const d3Links = laidOut.links();

    const treeNodes = d3Nodes.map(n => ({
      id: (n.data as any).attributes.id as string,
      baseX: n.x,
      baseY: n.y,
      name: (n.data as any).name as string,
      attrs: (n.data as any).attributes as NodeAttrs,
    }));

    const parentEdges = d3Links.map(link => ({
      sourceId: (link.source.data as any).attributes.id as string,
      targetId: (link.target.data as any).attributes.id as string,
      sourceName: (link.source.data as any).name as string,
      targetName: (link.target.data as any).name as string,
    }));

    const laidOutById = new Map(treeNodes.map(n => [n.id, n]));

    // Classify spouse relationships.
    const laidOutPairs = new Map<string, { aId: string; bId: string }>();
    const attachedPartners = new Map<string, string[]>();
    treeNodes.forEach(node => {
      const person = data.people[node.id];
      if (!person) return;
      for (const sid of person.spouseIds || []) {
        if (!data.people[sid]) continue;
        if (laidOutById.has(sid)) {
          const key = [node.id, sid].sort().join('|');
          if (!laidOutPairs.has(key)) laidOutPairs.set(key, { aId: node.id, bId: sid });
        } else {
          const partners = attachedPartners.get(sid) || [];
          if (!partners.includes(node.id)) partners.push(node.id);
          attachedPartners.set(sid, partners);
        }
      }
    });

    // Place each attached spouse near their first partner; clamp to viewport.
    const innerWidth = Math.max(100, dimensions.width - 100);
    const minX = 24;
    const maxX = innerWidth - 24;
    const usedSlotsByPartner = new Map<string, number>();
    const attachedSpouses: Array<{ id: string; baseX: number; baseY: number; name: string; attrs: NodeAttrs; partnerIds: string[] }> = [];
    const reachable = new Set<string>(descendants);

    attachedPartners.forEach((partnerIds, sid) => {
      const spouse = data.people[sid];
      if (!spouse) return;
      const anchor = laidOutById.get(partnerIds[0]);
      if (!anchor) return;
      const slot = usedSlotsByPartner.get(anchor.id) || 0;
      usedSlotsByPartner.set(anchor.id, slot + 1);
      const direction = slot % 2 === 0 ? 1 : -1;
      const distance = 70 + Math.floor(slot / 2) * 70;
      const rawX = anchor.baseX + direction * distance;
      const sx = Math.max(minX, Math.min(maxX, rawX));
      attachedSpouses.push({
        id: sid,
        baseX: sx,
        baseY: anchor.baseY,
        name: `${spouse.firstName} ${spouse.lastName}`,
        attrs: personToAttrs(spouse),
        partnerIds,
      });
      reachable.add(sid);
    });

    return {
      treeNodes,
      parentEdges,
      spousePairs: Array.from(laidOutPairs.values()),
      attachedSpouses,
      reachable,
    };
  }, [data, dimensions, descendants, direction]);

  // Effective positions (base ⊕ user overrides), and link path computations.
  const view = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    layout.treeNodes.forEach(n => {
      const o = nodeOverrides[n.id];
      positions.set(n.id, o ? { x: o.x, y: o.y } : { x: n.baseX, y: n.baseY });
    });
    layout.attachedSpouses.forEach(sp => {
      const o = nodeOverrides[sp.id];
      positions.set(sp.id, o ? { x: o.x, y: o.y } : { x: sp.baseX, y: sp.baseY });
    });

    const linkGen = d3.linkVertical<any, { x: number; y: number }>()
      .x(p => p.x)
      .y(p => p.y);

    const parentLinks = layout.parentEdges
      .map(edge => {
        const s = positions.get(edge.sourceId);
        const t = positions.get(edge.targetId);
        if (!s || !t) return null;
        return {
          d: linkGen({ source: s, target: t } as any) || '',
          parentName: edge.sourceName,
          childName: edge.targetName,
          key: `p-${edge.sourceId}-${edge.targetId}`,
        };
      })
      .filter(Boolean) as Array<{ d: string; parentName: string; childName: string; key: string }>;

    const spouseLinks: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
    layout.spousePairs.forEach(pair => {
      const a = positions.get(pair.aId);
      const b = positions.get(pair.bId);
      if (!a || !b) return;
      spouseLinks.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `sp-${pair.aId}-${pair.bId}` });
    });
    layout.attachedSpouses.forEach(sp => {
      const target = positions.get(sp.id);
      if (!target) return;
      sp.partnerIds.forEach(pid => {
        const src = positions.get(pid);
        if (!src) return;
        spouseLinks.push({ x1: src.x, y1: src.y, x2: target.x, y2: target.y, key: `sp-${pid}-${sp.id}` });
      });
    });

    return { positions, parentLinks, spouseLinks };
  }, [layout, nodeOverrides]);

  // Disconnected = anyone neither laid out nor attached as a spouse.
  const disconnected: Person[] = useMemo(() => {
    return (Object.values(data.people) as Person[])
      .filter(p => !layout.reachable.has(p.id))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [data, layout.reachable]);

  const parentOfRoot = useMemo(() => {
    if (!rootPerson) return null;
    if (rootPerson.fatherId && data.people[rootPerson.fatherId]) return data.people[rootPerson.fatherId];
    if (rootPerson.motherId && data.people[rootPerson.motherId]) return data.people[rootPerson.motherId];
    return null;
  }, [data, rootPerson]);

  const topAncestor = useMemo(() => {
    if (!rootPerson) return null;
    let cur: Person = rootPerson;
    const seen = new Set<string>();
    while (!seen.has(cur.id)) {
      seen.add(cur.id);
      const next: Person | undefined =
        (cur.fatherId && data.people[cur.fatherId]) ||
        (cur.motherId && data.people[cur.motherId]) ||
        undefined;
      if (!next) break;
      cur = next;
    }
    return cur;
  }, [data, rootPerson]);

  const showAtTop = topAncestor && topAncestor.id !== data.rootId;
  const totalPeople = Object.keys(data.people).length;
  const hasNodes = layout.treeNodes.length > 0;
  const hasOverrides = Object.keys(nodeOverrides).length > 0;

  // Search: case-insensitive match on first/last name; surface up to 8 results.
  const searchResults = useMemo<Person[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const all = Object.values(data.people) as Person[];
    return all
      .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
      .slice(0, 8);
  }, [searchQuery, data.people]);

  const pickSearchResult = (id: string) => {
    setSearchQuery('');
    setSearchOpen(false);
    onSetRoot(id);
  };

  const handleNodeDrag = (id: string, x: number, y: number) => {
    setNodeOverrides(prev => ({ ...prev, [id]: { x, y } }));
  };
  const getZoomScale = () => zoomScaleRef.current;

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Navigation header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            onClick={() => parentOfRoot && onSetRoot(parentOfRoot.id)}
            disabled={!parentOfRoot}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={parentOfRoot ? `Up to ${parentOfRoot.firstName} ${parentOfRoot.lastName}` : 'No parent recorded'}
          >
            <ArrowUp size={16} />
            Up
          </button>
          {showAtTop && topAncestor && (
            <button
              onClick={() => onSetRoot(topAncestor.id)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              title={`Show whole tree from ${topAncestor.firstName} ${topAncestor.lastName}`}
            >
              <Home size={16} />
              Top
            </button>
          )}

          {/* Direction toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 ml-1" role="group" aria-label="Tree direction">
            <button
              type="button"
              onClick={() => setDirection('descendants')}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors ${
                direction === 'descendants'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show descendants (children, grandchildren, …)"
            >
              <ArrowDown size={13} />
              Descendants
            </button>
            <button
              type="button"
              onClick={() => setDirection('ancestors')}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors ${
                direction === 'ancestors'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show ancestors (parents, grandparents, …)"
            >
              <ArrowUp size={13} />
              Ancestors
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-slate-400 min-w-0 truncate">
            <ChevronRight size={14} className="text-slate-600 shrink-0" />
            <span className="text-slate-500 shrink-0">Root:</span>
            <span className="text-white font-medium truncate">
              {rootPerson ? `${rootPerson.firstName} ${rootPerson.lastName}` : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Search */}
          <div ref={searchContainerRef} className="relative">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'Enter' && searchResults[0]) {
                    pickSearchResult(searchResults[0].id);
                  }
                }}
                placeholder="Search people…"
                className="w-44 sm:w-56 bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 p-0.5"
                  title="Clear"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {searchOpen && searchQuery.trim() && (
              <div className="absolute right-0 mt-1 w-72 max-h-72 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
                ) : (
                  searchResults.map(p => {
                    const isMale = p.gender === 'Male';
                    const year = p.birthDate?.split('-')[0];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickSearchResult(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: isMale ? '#0ea5e9' : '#ec4899' }}
                        />
                        <span className="text-sm text-slate-100 truncate flex-1">
                          {p.firstName} {p.lastName}
                        </span>
                        {year && <span className="text-xs text-slate-500 shrink-0">{year}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 hidden sm:block">
            {layout.reachable.size} of {totalPeople} shown
          </div>
        </div>
      </div>

      {/* Tree visualization */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative border border-slate-700 rounded-xl shadow-2xl">
        {hasNodes && (
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-lg p-1 shadow-lg">
            <button
              type="button"
              onClick={() => zoomBy(1.25)}
              className="p-1.5 text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(0.8)}
              className="p-1.5 text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-1.5 text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              <Maximize2 size={16} />
            </button>
            {hasOverrides && (
              <button
                type="button"
                onClick={resetLayout}
                className="p-1.5 text-slate-200 hover:bg-slate-700 rounded transition-colors border-t border-slate-700 mt-0.5 pt-1.5"
                title="Reset node positions"
                aria-label="Reset node positions"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        )}
        {hasNodes && (
          <div className="absolute bottom-3 left-3 z-10 text-[11px] text-slate-500 bg-slate-800/70 backdrop-blur px-2 py-1 rounded">
            Drag a node to move · Drag empty space to pan · Scroll to zoom
          </div>
        )}
        {!hasNodes ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Users size={40} className="opacity-30" />
            <p>No tree to display from the current root.</p>
            {disconnected.length > 0 && (
              <p className="text-xs text-slate-600">Pick a member below to start.</p>
            )}
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            <g transform={viewTransform}>
              {/* Parent → child links */}
              {view.parentLinks.map(link => (
                <g key={link.key}>
                  <path d={link.d} fill="none" stroke="#475569" strokeWidth="2" />
                  <title>Parent: {link.parentName} → Child: {link.childName}</title>
                </g>
              ))}

              {/* Spouse links */}
              {view.spouseLinks.map(s => (
                <g key={s.key}>
                  <line
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke="#ec4899"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    opacity={0.85}
                  />
                  <title>Spouses</title>
                </g>
              ))}

              {/* Laid-out tree nodes */}
              {layout.treeNodes.map(n => {
                const pos = view.positions.get(n.id) || { x: n.baseX, y: n.baseY };
                return (
                  <PersonNode
                    key={`n-${n.id}`}
                    x={pos.x}
                    y={pos.y}
                    name={n.name}
                    attrs={n.attrs}
                    onSelect={() => onSelectPerson(n.id)}
                    onDrag={(nx, ny) => handleNodeDrag(n.id, nx, ny)}
                    getZoomScale={getZoomScale}
                  />
                );
              })}

              {/* Attached spouse nodes */}
              {layout.attachedSpouses.map(sp => {
                const pos = view.positions.get(sp.id) || { x: sp.baseX, y: sp.baseY };
                return (
                  <PersonNode
                    key={`a-${sp.id}`}
                    x={pos.x}
                    y={pos.y}
                    name={sp.name}
                    attrs={sp.attrs}
                    onSelect={() => onSelectPerson(sp.id)}
                    onDrag={(nx, ny) => handleNodeDrag(sp.id, nx, ny)}
                    getZoomScale={getZoomScale}
                  />
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Disconnected members */}
      {disconnected.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shrink-0 max-h-44 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-slate-400">
            <UserPlus size={14} />
            Not connected to current tree ({disconnected.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {disconnected.map(p => {
              const isMale = p.gender === 'Male';
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg pl-2 pr-1 py-1"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: isMale ? '#0ea5e9' : '#ec4899' }}
                  />
                  <button
                    type="button"
                    onClick={() => onSelectPerson(p.id)}
                    className="text-sm text-slate-200 hover:text-white"
                    title="Edit"
                  >
                    {p.firstName} {p.lastName}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRoot(p.id)}
                    className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-brand-600 text-slate-200 hover:text-white transition-colors"
                    title="View this person's tree"
                  >
                    View
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
