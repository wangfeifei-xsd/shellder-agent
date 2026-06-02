'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

export type ErTableNodeData = {
  displayName: string;
  tableName: string;
  columns: {
    name: string;
    type: string;
    pk?: boolean;
    fk?: { table: string; column: string };
  }[];
  totalColumns: number;
};

export type ErTableFlowNode = Node<ErTableNodeData, 'erTable'>;

function ErTableNodeComponent({ data }: NodeProps<ErTableFlowNode>) {
  const shown = data.columns.slice(0, 6);
  const more = data.totalColumns - shown.length;

  return (
    <div className="er-table-node">
      <Handle type="target" position={Position.Left} className="er-table-handle er-table-handle-target" />
      <Handle type="source" position={Position.Right} className="er-table-handle er-table-handle-source" />
      <div className="er-table-node-header">
        <div className="er-table-node-title">{data.displayName}</div>
        <div className="er-table-node-subtitle">{data.tableName}</div>
      </div>
      <ul className="er-table-node-columns">
        {shown.map((c) => (
          <li key={c.name} className="er-table-node-col">
            <span className="er-table-node-col-icons">
              {c.pk ? <span className="er-badge er-badge-pk">PK</span> : null}
              {c.fk ? <span className="er-badge er-badge-fk">FK</span> : null}
            </span>
            <span className="er-table-node-col-name" title={c.name}>
              {c.name}
            </span>
            <span className="er-table-node-col-type">{c.type}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? <div className="er-table-node-more">还有 {more} 列…</div> : null}
    </div>
  );
}

export const ErTableNode = memo(ErTableNodeComponent);

export const erTableNodeTypes = { erTable: ErTableNode };
