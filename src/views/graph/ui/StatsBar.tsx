import { type AnalysisStats } from '@server/graph/model/graph.schema';
import {
	formatInteger,
	formatKzt,
	formatKztCompact,
	formatPeriod,
	formatScore,
	HIGH_PRIORITY_CUT,
} from '../model/format';

/**
 * The size of what is on screen, as one thin line of four figures beside the page title: the graph
 * is the screen, so the numbers take a line, not a row of cards. The rest — links, clusters, seeds,
 * the period — sits in each figure's tooltip.
 *
 * Every figure is a count or a sum from the analysis itself. There are no period-over-period deltas,
 * because the case has one month and a delta would be invented.
 */
export interface StatsBarProps {
	clusters: number;
	highPriority: number;
	stats: AnalysisStats;
}

interface Kpi {
	accent?: boolean;
	label: string;
	title: string;
	value: string;
}

export function StatsBar({ clusters, highPriority, stats }: StatsBarProps) {
	const period = formatPeriod(stats.periodFrom, stats.periodTo);
	const items: Kpi[] = [
		{
			label: 'Узлов',
			title: `${formatInteger(stats.nodes)} участников, ${formatInteger(stats.edges)} связей, ${formatInteger(clusters)} кластеров, ${formatInteger(stats.seeds)} seed`,
			value: formatInteger(stats.nodes),
		},
		{ label: 'Операций', title: `Переводы за ${period}`, value: formatInteger(stats.transactions) },
		{ label: 'Оборот', title: `${formatKzt(stats.totalKzt)} за ${period}`, value: formatKztCompact(stats.totalKzt) },
		{
			accent: true,
			label: 'Приоритетных',
			title: `Узлы с приоритетом проверки не ниже ${formatScore(HIGH_PRIORITY_CUT)} из 1. Приоритет — очерёдность проверки, а не вывод о виновности.`,
			value: formatInteger(highPriority),
		},
	];

	return (
		<dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
			{items.map((item) => (
				<div className="flex items-baseline gap-1.5" key={item.label} title={item.title}>
					<dt className="text-fg-muted text-xs">{item.label}</dt>
					<dd
						className={
							item.accent === true
								? 'text-danger tabular text-sm font-semibold whitespace-nowrap'
								: 'text-fg tabular text-sm font-semibold whitespace-nowrap'
						}
					>
						{item.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
