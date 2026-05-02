import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { TreeData, Person } from '../types';
import { ArrowUp, Home, ChevronRight, UserPlus, Users } from 'lucide-react';

interface TreeVisualizerProps {
  data: TreeData;
  onSelectPerson: (id: string) => void;
  onSetRoot: (id: string) => void;
}

const buildHierarchy = (data: TreeData): d3.HierarchyNode<any> | null => {
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
      attributes: {
        id: person.id,
        gender: person.gender,
        birthDate: person.birthDate,
        birthPlace: person.birthPlace,
        deathDate: person.deathDate,
        deathPlace: person.deathPlace,
        photo: person.photo,
      },
      children: [],
    };

    if (person.childrenIds && person.childrenIds.length > 0) {
      person.childrenIds.forEach(childId => {
        const childNode = buildNode(childId);
        if (childNode) node.children.push(childNode);
      });
    }
    return node;
  };

  const hierarchyData = buildNode(rootId);
  return hierarchyData ? d3.hierarchy(hierarchyData) : null;
};

export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ data, onSelectPerson, onSetRoot }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateDimensions = () => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    };
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rootPerson = data.people[data.rootId];

  // Reachable set from current root via childrenIds
  const reachable = useMemo(() => {
    const set = new Set<string>();
    if (!rootPerson) return set;
    const queue = [data.rootId];
    while (queue.length) {
      const id = queue.shift()!;
      if (set.has(id) || !data.people[id]) continue;
      set.add(id);
      for (const cid of data.people[id].childrenIds || []) queue.push(cid);
    }
    return set;
  }, [data, rootPerson]);

  // Disconnected members (anyone not reachable from current root)
  const disconnected: Person[] = useMemo(() => {
    return (Object.values(data.people) as Person[])
      .filter(p => !reachable.has(p.id))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [data, reachable]);

  // Parent of current root (for the "Up" button)
  const parentOfRoot = useMemo(() => {
    if (!rootPerson) return null;
    if (rootPerson.fatherId && data.people[rootPerson.fatherId]) return data.people[rootPerson.fatherId];
    if (rootPerson.motherId && data.people[rootPerson.motherId]) return data.people[rootPerson.motherId];
    return null;
  }, [data, rootPerson]);

  // Topmost ancestor (for the "Top" button)
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

  const { nodes, links } = useMemo(() => {
    const root = buildHierarchy(data);
    if (!root) return { nodes: [], links: [] };
    const treeLayout = d3.tree<any>().size([
      Math.max(100, dimensions.width - 100),
      Math.max(100, dimensions.height - 100),
    ]);
    treeLayout(root);
    return { nodes: root.descendants(), links: root.links() };
  }, [data, dimensions]);

  const showAtTop = topAncestor && topAncestor.id !== data.rootId;
  const totalPeople = Object.keys(data.people).length;

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Navigation header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
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
          <div className="flex items-center gap-1.5 text-sm text-slate-400 min-w-0 truncate">
            <ChevronRight size={14} className="text-slate-600 shrink-0" />
            <span className="text-slate-500 shrink-0">Root:</span>
            <span className="text-white font-medium truncate">
              {rootPerson ? `${rootPerson.firstName} ${rootPerson.lastName}` : '—'}
            </span>
          </div>
        </div>
        <div className="text-xs text-slate-500 shrink-0 hidden sm:block">
          {reachable.size} of {totalPeople} shown
        </div>
      </div>

      {/* Tree visualization */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative border border-slate-700 rounded-xl shadow-2xl">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Users size={40} className="opacity-30" />
            <p>No tree to display from the current root.</p>
            {disconnected.length > 0 && (
              <p className="text-xs text-slate-600">Pick a member below to start.</p>
            )}
          </div>
        ) : (
          <svg width={dimensions.width} height={dimensions.height} className="cursor-move">
            <defs>
              <clipPath id="circle-clip">
                <circle cx="0" cy="0" r="20" />
              </clipPath>
            </defs>
            <g transform={`translate(50, 50)`}>
              {links.map((link, i) => {
                const d = d3.linkVertical()
                  .x((d: any) => d.x)
                  .y((d: any) => d.y)(link as any);
                const parentName = (link.source.data as any).name;
                const childName = (link.target.data as any).name;
                return (
                  <g key={`link-${i}`}>
                    <path d={d || ''} fill="none" stroke="#475569" strokeWidth="2" className="transition-all duration-500" />
                    <title>Parent: {parentName} → Child: {childName}</title>
                  </g>
                );
              })}
              {nodes.map((node: any, i) => {
                const isMale = node.data.attributes.gender === 'Male';
                const { birthDate, birthPlace, deathDate, deathPlace, photo, id } = node.data.attributes;
                let tooltipText = node.data.name;
                if (birthDate || birthPlace) tooltipText += `\nBorn: ${birthDate || '?'} ${birthPlace ? `in ${birthPlace}` : ''}`;
                if (deathDate || deathPlace) tooltipText += `\nDied: ${deathDate || '?'} ${deathPlace ? `in ${deathPlace}` : ''}`;
                return (
                  <g
                    key={i}
                    transform={`translate(${node.x},${node.y})`}
                    className="group cursor-pointer"
                    onClick={() => onSelectPerson(id)}
                  >
                    <title>{tooltipText}</title>
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
                      <circle r="20" className="fill-slate-900 stroke-slate-800" />
                    )}
                    <text
                      dy="40"
                      textAnchor="middle"
                      className="fill-slate-300 text-xs font-medium pointer-events-none"
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                    >
                      {node.data.name}
                    </text>
                    <text dy="54" textAnchor="middle" className="fill-slate-500 text-[10px] pointer-events-none">
                      {birthDate?.split('-')[0] || '?'}
                    </text>
                  </g>
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
