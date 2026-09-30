import { type ClusterRow, type TopRow } from '@server/graph/model/graph.schema';
import { Button } from '@shared/ui/Button';
import clsx from 'clsx';
import {
	formatInteger,
	formatKzt,
	formatKztCompact,
	formatScore,
	PRIORITY_BAR_CLASS,
	PRIORITY_TEXT_CLASS,
	priorityTone,
} from '../model/format';
import { ROLE_LABELS } from '../model/roles';
import { RoleTag } from './RoleTag';

/**
 * The two lists beside the graph: whom to check first, and which groups the network splits into.
 *
 * A row is acted on through the button in its first cell rather than a click anywhere on the `<tr>`:
 * a button is reachable by keyboard and says what it does, a clickable row is neither.
 */

export interface TopListProps {
	/** Whether all rows are shown or only the first `collapsedCount`. */
	expanded: boolean;
	onSelect: (gid: string) => void;
	onToggleExpanded: () => void;
	rows: readonly TopRow[];
	selected: string | null;
}

const COLLAPSED_COUNT = 10;

/**
 * Whom to check first, compact: rank, gid, role and a priority bar. The reason (`why`) is the row's
 * tooltip and the card's evidence — the list is for choosing, the card is for defending.
 */
export function TopList({ expanded, onSelect, onToggleExpanded, rows, selected }: TopListProps) {
	if (rows.length === 0) {
		return <p className="text-fg-muted text-sm">Топ-лист пуст. Перезапустите `pnpm pipeline`.</p>;
	}

	const shown = expanded ? rows : rows.slice(0, COLLAPSED_COUNT);
	const max = Math.max(...rows.map((row) => row.priorityScore), 0.0001);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<ol aria-label="Топ-лист: кого проверять первым" className="flex min-h-0 flex-col overflow-y-auto">
				{shown.map((row) => {
					const tone = priorityTone(row.priorityScore);
					const active = row.gid === selected;

					return (
						<li key={row.gid}>
							<button
								aria-current={active ? 'true' : undefined}
								aria-label={`${row.rank}. Узел ${row.gid}, ${ROLE_LABELS[row.role]}, приоритет ${formatScore(row.priorityScore)}`}
								className={clsx(
									'hover:bg-surface-hover grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-1.5 py-1.5 text-left',
									active && 'bg-accent-subtle',
								)}
								onClick={() => onSelect(row.gid)}
								title={row.why}
								type="button"
							>
								<span className="text-fg-subtle tabular text-xs">{row.rank}</span>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-fg tabular truncate font-mono text-[11px]">{row.gid}</span>
									<RoleTag className="text-fg-muted text-[11px]" role={row.role} />
								</span>
								<span className="flex w-11 flex-col items-end gap-1">
									<span className={clsx('tabular text-sm font-semibold', PRIORITY_TEXT_CLASS[tone])}>
										{formatScore(row.priorityScore)}
									</span>
									<span aria-hidden className="bg-surface-sunken h-1 w-full overflow-hidden rounded-full">
										<span
											className={clsx('block h-full rounded-full', PRIORITY_BAR_CLASS[tone])}
											style={{ width: `${(row.priorityScore / max) * 100}%` }}
										/>
									</span>
								</span>
							</button>
						</li>
					);
				})}
			</ol>
			{rows.length > COLLAPSED_COUNT && (
				<Button className="self-center" onClick={onToggleExpanded} size="sm" variant="secondary">
					{expanded ? 'Свернуть' : `Показать ещё (${rows.length - COLLAPSED_COUNT})`}
				</Button>
			)}
		</div>
	);
}

export interface ClusterListProps {
	highlighted: number | null;
	onSelect: (clusterId: number) => void;
	rows: readonly ClusterRow[];
}

export function ClusterList({ highlighted, onSelect, rows }: ClusterListProps) {
	if (rows.length === 0) {
		return <p className="text-fg-muted text-sm">Кластеры не найдены. Перезапустите `pnpm pipeline`.</p>;
	}

	// A list, not a table: the side panel is ~22rem, and three columns pushed the amount out of view.
	return (
		<ul aria-label="Кластеры" className="flex flex-col gap-2">
			{rows.map((row) => {
				const active = row.clusterId === highlighted;

				return (
					<li
						className={clsx(
							'border-border flex flex-col gap-1.5 rounded-md border p-2.5',
							active && 'border-accent bg-accent-subtle',
						)}
						key={row.clusterId}
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Button
								aria-pressed={active}
								onClick={() => onSelect(row.clusterId)}
								size="sm"
								variant={active ? 'primary' : 'secondary'}
							>
								Кластер {row.clusterId}
							</Button>
							<span className="text-fg-muted tabular text-xs" title={formatKzt(row.sumKztInternal)}>
								{formatInteger(row.nNodes)} узл. · {formatInteger(row.nSeed)} seed ·{' '}
								<span className="text-fg font-medium">{formatKztCompact(row.sumKztInternal)}</span> внутри
							</span>
						</div>
						<p className="text-fg-muted text-xs">{row.hypothesis}</p>
					</li>
				);
			})}
		</ul>
	);
}
