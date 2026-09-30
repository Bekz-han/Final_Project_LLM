import { type Role } from '@server/graph/model/graph.schema';
import clsx from 'clsx';
import { ROLE_CHIP_CLASS, ROLE_LABELS } from '../model/roles';

/** A role as a coloured dot and its name. The name is the signal; the dot matches the canvas. */
export function RoleTag({ className, role }: { className?: string; role: Role }) {
	return (
		<span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
			<span aria-hidden className={clsx('size-2.5 shrink-0 rounded-full', ROLE_CHIP_CLASS[role])} />
			{ROLE_LABELS[role]}
		</span>
	);
}

/**
 * A gid the analyst can click to put that node in focus.
 *
 * A real button, so it is reachable by keyboard and announced as an action. Monospaced and
 * tabular, because an 18-digit number is read digit by digit and compared against another one.
 */
export function GidButton({ gid, onSelect }: { gid: string; onSelect: (gid: string) => void }) {
	return (
		<button
			aria-label={`Показать узел ${gid} на графе`}
			className="text-accent-fg tabular self-start rounded-sm text-left font-mono text-xs hover:underline"
			onClick={() => onSelect(gid)}
			type="button"
		>
			{gid}
		</button>
	);
}
