import { type Role } from '@server/graph/model/graph.schema';
import clsx from 'clsx';
import { formatInteger } from '../model/format';
import { ROLE_CHIP_CLASS, ROLE_HINTS, ROLE_LABELS, ROLE_ORDER } from '../model/roles';

/**
 * Toggle chips that show or hide a role on the canvas, each with its count. They double as the
 * legend in role mode. A hidden role is shown by a hollow dot, a struck name and `aria-pressed`,
 * so the state is never carried by colour alone. This is view state, not data: nothing is written.
 */
export interface RoleFilterProps {
	counts: ReadonlyMap<Role, number>;
	hidden: ReadonlySet<Role>;
	onToggle: (role: Role) => void;
}

export function RoleFilter({ counts, hidden, onToggle }: RoleFilterProps) {
	return (
		<ul aria-label="Показывать роли" className="flex flex-wrap gap-1">
			{ROLE_ORDER.map((role) => {
				const shown = !hidden.has(role);

				return (
					<li key={role}>
						<button
							aria-pressed={shown}
							className={clsx(
								'inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] whitespace-nowrap transition-colors',
								shown
									? 'border-border-strong bg-surface-raised text-fg hover:bg-surface-hover'
									: 'border-border text-fg-subtle hover:text-fg-muted border-dashed bg-transparent',
							)}
							onClick={() => onToggle(role)}
							title={`${ROLE_LABELS[role]} (${formatInteger(counts.get(role) ?? 0)}): ${ROLE_HINTS[role]}. ${shown ? 'Скрыть' : 'Показать'} на графе.`}
							type="button"
						>
							{shown ? (
								<span aria-hidden className={clsx('size-2 shrink-0 rounded-full', ROLE_CHIP_CLASS[role])} />
							) : (
								<span aria-hidden className="border-fg-subtle size-2 shrink-0 rounded-full border" />
							)}
							<span className={clsx(!shown && 'line-through')}>{ROLE_LABELS[role]}</span>
							<span className="text-fg-muted tabular hidden 2xl:inline">
								{formatInteger(counts.get(role) ?? 0)}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
