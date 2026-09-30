import { type ClusterRow, type NodeRow, type Role } from '@server/graph/model/graph.schema';
import { type ColorMode } from '../model/focus';
import { formatInteger } from '../model/format';
import { clusterSlot, ROLE_HINTS, ROLE_ORDER } from '../model/roles';
import { RoleTag } from './RoleTag';

/**
 * What the colours on the canvas mean, with how many nodes carry each.
 *
 * Status is never colour alone (`docs/design-system.md` §9): every chip has its word beside it.
 * In cluster mode the eight colours repeat across dozens of clusters, so the legend says so rather
 * than implying a colour identifies one cluster.
 */
export interface LegendProps {
	clusters: readonly ClusterRow[];
	colorMode: ColorMode;
	nodes: readonly NodeRow[];
}

const CLUSTERS_SHOWN = 8;

export function Legend({ clusters, colorMode, nodes }: LegendProps) {
	if (colorMode === 'cluster') {
		const largest = [...clusters].sort((a, b) => b.nNodes - a.nNodes).slice(0, CLUSTERS_SHOWN);

		return (
			<div aria-label="Легенда: кластеры" className="flex flex-col gap-2" role="group">
				<ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
					{largest.map((cluster) => (
						<li className="text-fg-muted inline-flex items-center gap-1.5" key={cluster.clusterId}>
							<span
								aria-hidden
								className="size-2.5 rounded-full"
								style={{ backgroundColor: `var(--color-cluster-${clusterSlot(cluster.clusterId)})` }}
							/>
							<span className="text-fg">Кластер {cluster.clusterId}</span>
							<span className="tabular">{formatInteger(cluster.nNodes)} узл.</span>
						</li>
					))}
				</ul>
				{clusters.length > CLUSTERS_SHOWN && (
					<p className="text-fg-subtle text-xs">
						Показаны {CLUSTERS_SHOWN} крупнейших из {clusters.length}; цвета повторяются каждые 8 кластеров.
					</p>
				)}
			</div>
		);
	}

	const counts = new Map<Role, number>();

	for (const node of nodes) counts.set(node.role, (counts.get(node.role) ?? 0) + 1);

	return (
		<ul aria-label="Легенда: роли" className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
			{ROLE_ORDER.map((role) => (
				<li className="flex min-w-0 flex-wrap items-baseline gap-x-1.5" key={role}>
					<RoleTag className="text-fg" role={role} />
					<span className="text-fg-muted tabular">{formatInteger(counts.get(role) ?? 0)}</span>
					<span className="text-fg-subtle">· {ROLE_HINTS[role]}</span>
				</li>
			))}
		</ul>
	);
}
