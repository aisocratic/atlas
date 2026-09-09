"use client";

import { ResponsiveContainer, Sankey, Tooltip, type SankeyNodeProps, type SankeyLinkProps } from "recharts";
import type { BreakdownRow } from "./breakdown-chart";
import { ChartValueTooltip } from "./chart-tooltip";
import { visitorFlowData } from "./sankey-data";

type FlowNodeData = ReturnType<typeof visitorFlowData>["nodes"][number];

function FlowNode({ x, y, width, height, payload }: SankeyNodeProps) {
  const node = payload as typeof payload & FlowNodeData;
  const end = node.stage === 2;
  return <g>
    <rect className="sankey-flow-node" x={x} y={y} width={width} height={height} rx={3} fill={node.color} />
    <text x={end ? x - 7 : x + width + 7} y={y + height / 2} textAnchor={end ? "end" : "start"} dominantBaseline="central" fill="var(--foreground)" fontSize={11} stroke="var(--card)" strokeWidth={3} paintOrder="stroke" pointerEvents="none">{payload.name}</text>
  </g>;
}

function FlowLink({ sourceX, sourceY, targetX, targetY, sourceControlX, targetControlX, linkWidth, payload }: SankeyLinkProps) {
  return <path className="sankey-flow-link" d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} fill="none" stroke={(payload.source as typeof payload.source & FlowNodeData).color} strokeWidth={linkWidth} strokeOpacity={.35} />;
}

export function VisitorFlowChart({ rows, hasData }: { rows: BreakdownRow[]; hasData: boolean }) {
  const data = visitorFlowData(rows);
  if (!hasData) return <p className="analytics-empty">No sample measurements in this date range.</p>;
  if (!data.links.length) return <p className="analytics-empty">No visible measurements. Select a source below.</p>;
  return <>
    <div className="sankey-stages" aria-hidden="true"><span>Source</span><span>Landing page</span><span>Outcome</span></div>
    <div className="analytics-plot sankey-plot">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <Sankey data={data} node={FlowNode} link={FlowLink} nodeWidth={10} nodePadding={24} sort={false} margin={{ top: 10, right: 8, bottom: 10, left: 8 }} accessibilityLayer title="Visitor flow Sankey diagram" desc="Visits flow from sources through landing pages to outcomes. Link widths represent visit counts. Use arrow keys to explore values.">
          <Tooltip content={<ChartValueTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
    <p className="sankey-note">Synthetic journeys · flow width represents visits in the selected range.</p>
  </>;
}
