import { ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { type ReactNode } from 'react';

/**
 * Something the person needs to read before carrying on.
 *
 * Each tone carries an icon as well as a colour, per `docs/design-system.md` §9: status is
 * never colour alone. Roughly one in twelve men cannot tell the danger tone from the warning
 * one, and both of them mean something different from info.
 */

const TONES = {
	danger: { className: 'bg-danger-subtle text-danger', Icon: XCircleIcon },
	info: { className: 'bg-info-subtle text-info', Icon: InformationCircleIcon },
	warning: { className: 'bg-warning-subtle text-warning', Icon: ExclamationTriangleIcon },
} as const;

export interface CalloutProps {
	children: ReactNode;
	tone?: keyof typeof TONES;
}

export function Callout({ children, tone = 'info' }: CalloutProps) {
	const { className, Icon } = TONES[tone];

	return (
		<div
			className={clsx('flex items-start gap-2 rounded-md px-3 py-2.5 text-sm', className)}
			role={tone === 'danger' ? 'alert' : 'status'}
		>
			<Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
			<div>{children}</div>
		</div>
	);
}
