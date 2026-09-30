'use client';

import { CheckCircleIcon, ChevronDownIcon, CpuChipIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { type ToolCall } from '@server/agent/model/agent.schema';
import { Badge } from '@shared/ui/Badge';
import clsx from 'clsx';
import { useId, useState } from 'react';
import { collectGids } from '../lib/gids';
import { GidButton, GidText } from './GidText';

/**
 * The panel that turns "chatbot" into "agent" for whoever is watching.
 *
 * It renders what the server reported it actually did — never what the interface guessed it would
 * do. A speculative row here would be a lie on a projector the one time a tool fails, and the
 * whole argument of the panel is that it is showing real work.
 *
 * Each row carries its own label from the tool registry, so adding a tool needs no change here.
 * Every gid the server put in a call's arguments or result is offered as a link to the graph.
 */

/** How many gid links a row shows before it says "and N more". */
const GID_LIMIT = 8;

/** A compact one-line rendering of whatever the tool returned. */
function summarise(result: unknown): string {
	if (result === null || result === undefined) return '—';
	if (typeof result === 'string') return result;
	if (typeof result === 'number' || typeof result === 'boolean') return String(result);

	if (Array.isArray(result)) {
		return result.length === 0 ? 'нет результатов' : `результатов: ${String(result.length)}`;
	}

	if (typeof result === 'object') {
		return Object.entries(result)
			.map(([key, value]) => {
				if (Array.isArray(value)) return `${key}: [${String(value.length)}]`;
				return `${key}: ${typeof value === 'object' && value !== null ? '…' : String(value)}`;
			})
			.join(' · ');
	}

	return JSON.stringify(result);
}

/** Pretty JSON. Gids are strings, so they print inside quotes and `GidText` finds them there. */
function pretty(value: unknown): string {
	// `JSON.stringify(undefined)` is `undefined` at runtime, whatever its type says.
	return value === undefined ? '—' : JSON.stringify(value, null, 2);
}

function ActivityRow({ call, onGidClick }: { call: ToolCall; onGidClick?: (gid: string) => void }) {
	const ok = call.status === 'ok';
	const Icon = ok ? CheckCircleIcon : XCircleIcon;
	const gids = onGidClick === undefined ? [] : collectGids([call.arguments, call.result]);
	const shown = gids.slice(0, GID_LIMIT);

	return (
		<li className="border-border flex items-start gap-2 border-b py-2.5 last:border-b-0">
			<Icon
				aria-hidden
				className={ok ? 'text-success mt-0.5 size-4 shrink-0' : 'text-danger mt-0.5 size-4 shrink-0'}
			/>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<code className="text-fg truncate text-xs font-medium">{call.name}</code>
					{/* Status is never colour alone: the icon and this word carry it too. */}
					<Badge tone={ok ? 'success' : 'danger'}>{ok ? 'ok' : 'ошибка'}</Badge>
					<span className="text-fg-subtle ml-auto text-xs whitespace-nowrap tabular-nums">
						{call.durationMs} мс
					</span>
				</div>

				<p className="text-fg-muted mt-0.5 text-xs">{call.label}</p>
				<p className="text-fg-subtle mt-1 truncate text-xs">{summarise(call.result)}</p>

				{onGidClick !== undefined && shown.length > 0 && (
					<p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
						{shown.map((gid) => (
							<GidButton gid={gid} key={gid} onGidClick={onGidClick} />
						))}
						{gids.length > shown.length && (
							<span className="text-fg-subtle">и ещё {gids.length - shown.length}</span>
						)}
					</p>
				)}

				<details className="mt-1 text-xs">
					<summary className="text-fg-muted hover:text-fg cursor-pointer select-none">Подробнее</summary>
					<p className="text-fg-subtle mt-1">Аргументы</p>
					<pre className="bg-surface-sunken text-fg-muted max-h-40 overflow-auto rounded-sm p-2 font-mono whitespace-pre-wrap">
						<GidText onGidClick={onGidClick} text={pretty(call.arguments)} />
					</pre>
					<p className="text-fg-subtle mt-1">Результат</p>
					<pre className="bg-surface-sunken text-fg-muted max-h-60 overflow-auto rounded-sm p-2 font-mono whitespace-pre-wrap">
						<GidText onGidClick={onGidClick} text={pretty(call.result)} />
					</pre>
				</details>
			</div>
		</li>
	);
}

/** Matches the real row: icon, title line, two lines of text — so nothing jumps on arrival. */
function ActivitySkeleton() {
	return (
		<li className="border-border flex items-start gap-2 border-b py-2.5 last:border-b-0">
			<div className="bg-surface-sunken mt-0.5 size-4 shrink-0 animate-pulse rounded-full" />

			<div className="flex-1">
				<div className="bg-surface-sunken h-3.5 w-32 animate-pulse rounded-sm" />
				<div className="bg-surface-sunken mt-1.5 h-3 w-24 animate-pulse rounded-sm" />
				<div className="bg-surface-sunken mt-1.5 h-3 w-40 animate-pulse rounded-sm" />
			</div>
		</li>
	);
}

export interface AgentActivityProps {
	className?: string;
	/** In a side panel the list folds away behind its header; full width it is always open. */
	collapsible?: boolean;
	onGidClick?: (gid: string) => void;
	pending: boolean;
	toolCalls: readonly ToolCall[];
}

export function AgentActivity({ className, collapsible = false, onGidClick, pending, toolCalls }: AgentActivityProps) {
	// Folded by default in a side panel: open, it took half the column and squeezed the conversation
	// to a few lines. The header keeps the call count, so the agent's work is one click away.
	const [open, setOpen] = useState(false);
	const titleId = useId();
	const bodyId = useId();
	const expanded = !collapsible || open;

	const heading = (
		<>
			<CpuChipIcon aria-hidden className="text-fg-subtle size-5 shrink-0" />
			<span className="min-w-0 flex-1 text-left">
				<span className="text-fg block font-semibold" id={titleId}>
					Действия ассистента
				</span>
				<span className="text-fg-muted block text-xs">
					{collapsible && !open ? 'Нажмите, чтобы увидеть вызовы инструментов' : 'Что он вызвал на последнем шаге'}
				</span>
			</span>
			{toolCalls.length > 0 && <Badge>{toolCalls.length}</Badge>}
		</>
	);

	return (
		<section
			aria-labelledby={titleId}
			className={clsx('border-border bg-surface flex min-h-0 flex-col gap-3 rounded-lg border p-4', className)}
		>
			{collapsible ? (
				<button
					aria-controls={bodyId}
					aria-expanded={open}
					className="hover:bg-surface-hover -m-1 flex items-center gap-2 rounded-md p-1"
					onClick={() => {
						setOpen((value) => !value);
					}}
					type="button"
				>
					{heading}
					<ChevronDownIcon
						aria-hidden
						className={clsx('text-fg-subtle size-4 shrink-0 transition-transform', open && 'rotate-180')}
					/>
				</button>
			) : (
				<div className="flex items-center gap-2">{heading}</div>
			)}

			{expanded && (
				<div className={clsx('min-h-0', collapsible && 'max-h-72 overflow-y-auto')} id={bodyId}>
					{toolCalls.length === 0 && !pending ? (
						<p className="text-fg-muted text-sm">
							Пока пусто. Задайте вопрос — здесь появятся инструменты, которые ассистент выбрал сам.
						</p>
					) : (
						<ul aria-busy={pending} aria-live="polite" className="flex flex-col">
							{toolCalls.map((call, index) => (
								<ActivityRow call={call} key={`${call.name}-${String(index)}`} onGidClick={onGidClick} />
							))}

							{pending && <ActivitySkeleton />}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}
