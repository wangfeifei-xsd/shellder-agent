'use client';

import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import './er-diagram-flow.css';
import { erTableNodeTypes } from './ErTableNode';

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
};

const fitViewOpts = { padding: 0.12, maxZoom: 1.15 };

function FitViewOnFullscreen() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const refit = () => {
      window.setTimeout(() => {
        void fitView(fitViewOpts);
      }, 120);
    };
    document.addEventListener('fullscreenchange', refit);
    return () => document.removeEventListener('fullscreenchange', refit);
  }, [fitView]);

  return null;
}

export function ErDiagramFlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
        await el.requestFullscreen();
      }
    } catch {
      // 浏览器策略或用户取消
    }
  }, []);

  return (
    <div ref={wrapRef} className="er-flow-wrap">
      <Tooltip title={fullscreen ? '退出全屏' : '全屏'}>
        <Button
          className="er-flow-fullscreen-btn"
          size="small"
          type="default"
          icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? '退出全屏' : '全屏'}
        />
      </Tooltip>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={erTableNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={fitViewOpts}
        minZoom={0.15}
        maxZoom={1.25}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <FitViewOnFullscreen />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => (n.type === 'erTable' ? '#1677ff' : '#94a3b8')}
          maskColor="rgb(15 23 42 / 8%)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
