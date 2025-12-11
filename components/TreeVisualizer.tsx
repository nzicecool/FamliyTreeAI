import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { TreeData, Person } from '../types';

interface TreeVisualizerProps {
  data: TreeData;
  onSelectPerson: (id: string) => void;
}

// Helper to convert flat relational data to D3 hierarchy
const buildHierarchy = (data: TreeData): d3.HierarchyNode<any> | null => {
  const { people, rootId } = data;
  const rootPerson = people[rootId];
  
  if (!rootPerson) return null;

  const buildNode = (personId: string): any => {
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

    // Recursively find children
    if (person.childrenIds && person.childrenIds.length > 0) {
      person.childrenIds.forEach(childId => {
        const childNode = buildNode(childId);
        if (childNode) {
          node.children.push(childNode);
        }
      });
    }
    
    return node;
  };

  const hierarchyData = buildNode(rootId);
  return d3.hierarchy(hierarchyData);
};

export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ data, onSelectPerson }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  React.useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    }
    
    const handleResize = () => {
       if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { nodes, links } = useMemo(() => {
    const root = buildHierarchy(data);
    if (!root) return { nodes: [], links: [] };

    // Create a tree layout
    const treeLayout = d3.tree().size([dimensions.width - 100, dimensions.height - 100]);
    treeLayout(root);

    return {
      nodes: root.descendants(),
      links: root.links(),
    };
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-900 overflow-hidden relative border border-slate-700 rounded-xl shadow-2xl">
      <div className="absolute top-4 right-4 bg-slate-800/80 backdrop-blur p-2 rounded text-xs text-slate-400">
        Start: {data.people[data.rootId]?.firstName} {data.people[data.rootId]?.lastName}
      </div>
      
      <svg width={dimensions.width} height={dimensions.height} className="cursor-move">
        <defs>
            {/* Standard clip path for images if needed */}
            <clipPath id="circle-clip">
                <circle cx="0" cy="0" r="20" />
            </clipPath>
        </defs>
        <g transform={`translate(50, 50)`}>
          {/* Links */}
          {links.map((link, i) => {
             // Generate a smooth cubic bezier curve
             const d = d3.linkVertical()
                .x((d: any) => d.x)
                .y((d: any) => d.y)
                (link as any);
             
             const parentName = (link.source.data as any).name;
             const childName = (link.target.data as any).name;

             return (
               <g key={`link-${i}`}>
                   <path
                     d={d || ""}
                     fill="none"
                     stroke="#475569"
                     strokeWidth="2"
                     className="transition-all duration-500"
                   />
                   <title>Parent: {parentName} → Child: {childName}</title>
               </g>
             );
          })}

          {/* Nodes */}
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
                 
                 {/* Outer Border / Gender Indicator */}
                 <circle
                   r="24"
                   fill={isMale ? '#0ea5e9' : '#ec4899'}
                   className="transition-all duration-300 shadow-lg"
                 />

                 {/* Photo or Default Circle */}
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
                        {/* Inner stroke for cleaner edge */}
                        <circle r="20" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
                    </g>
                 ) : (
                    <circle
                        r="20"
                        className="fill-slate-900 stroke-slate-800"
                    />
                 )}
                 
                 <text
                   dy="40"
                   textAnchor="middle"
                   className="fill-slate-300 text-xs font-medium bg-slate-900 pointer-events-none"
                   style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                 >
                   {node.data.name}
                 </text>
                 <text
                   dy="54"
                   textAnchor="middle"
                   className="fill-slate-500 text-[10px] pointer-events-none"
                 >
                   {birthDate?.split('-')[0] || '?'}
                 </text>
               </g>
             );
          })}
        </g>
      </svg>
    </div>
  );
};