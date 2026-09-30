import { type Counterparty, type NodeRow } from '@server/graph/model/graph.schema';
import { Badge } from '@shared/ui/Badge';
import { Button } from '@shared/ui/Button';
import { Callout } from '@shared/ui/Callout';
import clsx from 'clsx';
import { type ReactNode } from 'react';
import { formatInteger, formatKzt, formatScore, formatShare, PRIORITY_TEXT_CLASS, priorityTone } from '../model/format';
import { flagMeta } from '../model/roles';
import { type MoneyPathController } from '../model/useMoneyPath';
import { MoneyPathControl } from './MoneyPathControl';
import { GidButton, RoleTag } from './RoleTag';

/**
 * Everything needed to defend one node's role in a minute: the verdict, the evidence in words, the
 * metrics the rule looked at, and the five biggest counterparties each way.
 *
 * The evaluation is "the jury names a gid and the team explains its role from its own metrics", so
 * the evidence sits at the top and the numbers it cites sit right under it.
 */
export interface NodeCardProps {
	/** Drives «Показать путь денег»; absent, the card has no path control. */
	moneyPath?: MoneyPathController;
	node: NodeRow;
	/** Puts a question about this node into the assistant's draft. */
	onAsk?: (gid: string) => void;
	onSelect: (gid: string) => void;
	topIn: readonly Counterparty[];
	topOut: readonly Counterparty[];
}

function Metric({ hint, label, value }: { hint?: string; label: string; value: ReactNode }) {
	return (
		<div className="bg-surface-sunken flex min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-1.5" title={hint}>
			<dt className="text-fg-muted truncate text-[11px]">{label}</dt>
			<dd className="text-fg tabular truncate text-sm font-medium">{value}</dd>
		</div>
	);
}

/** role_score as a small meter: the word says the role, the bar says how strongly the rule fired. */
function RoleMeter({ score }: { score: number }) {
	return (
		<span
			className="text-fg-muted inline-flex items-center gap-2 text-xs"
			title="Сила срабатывания правила роли, 0–1"
		>
			сила правила
			<span aria-hidden className="bg-surface-sunken h-1.5 w-16 overflow-hidden rounded-full">
				<span className="bg-accent block h-full rounded-full" style={{ width: `${Math.round(score * 100)}%` }} />
			</span>
			<span className="text-fg tabular">{formatScore(score)}</span>
		</span>
	);
}

function CounterpartyList(props: {
	empty: string;
	onSelect: (gid: string) => void;
	rows: readonly Counterparty[];
	title: string;
}) {
	const { empty, onSelect, rows, title } = props;

	return (
		<section aria-label={title} className="flex flex-col gap-1.5">
			<h3 className="text-fg-muted text-xs font-medium">{title}</h3>
			{rows.length === 0 ? (
				<p className="text-fg-subtle text-xs">{empty}</p>
			) : (
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li className="border-border flex flex-col gap-0.5 border-b py-1.5 last:border-0" key={row.gid}>
							<GidButton gid={row.gid} onSelect={onSelect} />
							<span className="flex items-center gap-2">
								<RoleTag className="text-fg-muted text-[11px]" role={row.role} />
								<span className="text-fg tabular ml-auto text-xs whitespace-nowrap">
									{formatKzt(row.sumKzt)} · {formatInteger(row.nTx)} тр.
								</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function NodeCard({ moneyPath, node, onAsk, onSelect, topIn, topOut }: NodeCardProps) {
	return (
		<article aria-label={`Узел ${node.gid}`} className="flex flex-col gap-4">
			<header className="flex flex-col gap-2">
				<div className="flex items-start justify-between gap-3">
					<p className="text-fg tabular font-mono text-sm font-medium break-all">{node.gid}</p>
					<span
						className={clsx(
							'tabular shrink-0 text-lg leading-none font-semibold',
							PRIORITY_TEXT_CLASS[priorityTone(node.priorityScore)],
						)}
						title="Приоритет проверки, 0–1: очерёдность, а не вывод о виновности"
					>
						<span className="sr-only">Приоритет </span>
						{formatScore(node.priorityScore)}
					</span>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<RoleTag
						className="border-border-strong text-fg rounded-full border px-2.5 py-0.5 text-sm font-semibold"
						role={node.role}
					/>
					<RoleMeter score={node.roleScore} />
				</div>
				{node.flags.length > 0 && (
					<ul aria-label="Флаги" className="flex flex-wrap gap-1.5">
						{node.flags.map((flag) => {
							const meta = flagMeta(flag);

							return (
								<li key={flag}>
									<Badge tone={meta.tone}>{meta.label}</Badge>
								</li>
							);
						})}
					</ul>
				)}
			</header>

			<Callout tone="info">
				<p className="font-medium">Почему такая роль (гипотеза)</p>
				<p>{node.evidence}</p>
			</Callout>

			<div className="flex flex-wrap items-center gap-2">
				{onAsk !== undefined && (
					<Button onClick={() => onAsk(node.gid)} variant="secondary">
						Спросить ассистента
					</Button>
				)}
			</div>

			{moneyPath !== undefined && <MoneyPathControl controller={moneyPath} gid={node.gid} />}

			<dl className="grid grid-cols-2 gap-1.5">
				<Metric label="Кластер" value={node.clusterId} />
				<Metric hint="Минимальное колено обхода от seed; 0 — сам seed" label="Колено обхода" value={node.depth} />
				<Metric label="Входящих связей" value={formatInteger(node.inDeg)} />
				<Metric label="Исходящих связей" value={formatInteger(node.outDeg)} />
				<Metric label="Получено" value={formatKzt(node.inKzt)} />
				<Metric label="Отправлено" value={formatKzt(node.outKzt)} />
				<Metric
					hint="Отправлено / получено"
					label="Пропуск (out/in)"
					value={node.passThrough === null ? '—' : formatShare(node.passThrough)}
				/>
				<Metric label="Seed выше по потоку" value={formatInteger(node.seedsUpstream)} />
				<Metric label="Seed" value={node.isSeed ? 'да' : 'нет'} />
				<Metric
					hint="Доля исходящих ₸, ушедших в течение 2 дней после входящего перевода"
					label="Быстрый транзит"
					value={formatShare(node.fastTransitShare)}
				/>
			</dl>

			<CounterpartyList
				empty="Входящих переводов нет в выгрузке."
				onSelect={onSelect}
				rows={topIn}
				title="Крупнейшие отправители"
			/>
			<CounterpartyList
				empty={
					node.truncated ? 'Обход остановлен на 4-м колене: исходящие неизвестны.' : 'Исходящих переводов нет.'
				}
				onSelect={onSelect}
				rows={topOut}
				title="Крупнейшие получатели"
			/>
		</article>
	);
}
