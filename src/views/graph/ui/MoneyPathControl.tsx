import { ArrowPathIcon, BanknotesIcon, StopIcon } from '@heroicons/react/24/outline';
import { Button } from '@shared/ui/Button';
import { formatKztCompact } from '../model/format';
import { type MoneyPath } from '../model/moneyPath';
import { type MoneyPathController } from '../model/useMoneyPath';

export interface MoneyPathControlProps {
	controller: MoneyPathController;
	gid: string;
}

/** 1 колено, 2 колена, 5 колен. */
function hopsWord(count: number): string {
	const tens = count % 100;
	const ones = count % 10;

	if (tens >= 11 && tens <= 14) return 'колен';
	if (ones === 1) return 'колено';
	if (ones >= 2 && ones <= 4) return 'колена';

	return 'колен';
}

function shortGid(gid: string): string {
	return `…${gid.slice(-6)}`;
}

function summary(path: MoneyPath): string {
	if (path.seedsReached.length === 0) {
		return 'Путь к seed в выгрузке не найден (обход начинался от seed; этот узел, возможно, получает деньги извне выборки).';
	}

	const shown = path.seedsReached.slice(0, 3).map(shortGid).join(', ');
	const rest = path.seedsReached.length - 3;
	const more = rest > 0 ? ` и ещё ${rest}` : '';

	return (
		`Деньги могли дойти за ${path.maxHop} ${hopsWord(path.maxHop)} от ${path.seedsReached.length} seed: ` +
		`${shown}${more}. На пути ${path.hops.size - 1} отправителей, в узел по этим связям — ` +
		`${formatKztCompact(path.totalKzt)}. Это гипотеза о маршруте, не вывод о виновности.`
	);
}

const LEGEND = ['0 — узел', '1 — прямые отправители', '2 — их отправители', '3–4 — дальше вверх, до seed'];

/** «Показать путь денег» for the node card: plays the path on the canvas, then says what it found. */
export function MoneyPathControl({ controller, gid }: MoneyPathControlProps) {
	const { path, playing, replay, start, stop, view } = controller;
	const isMine = path !== null && path.target === gid;

	if (!isMine) {
		return (
			<Button onClick={() => start(gid)} size="sm" variant="secondary">
				<BanknotesIcon aria-hidden className="size-4" />
				Показать путь денег
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{playing ? (
					<p aria-live="polite" className="text-fg text-sm tabular-nums">
						Колено {view?.revealedHop ?? 0} из {path.maxHop}
					</p>
				) : null}
				{playing ? null : (
					<Button onClick={replay} size="sm" variant="secondary">
						<ArrowPathIcon aria-hidden className="size-4" />
						Повторить
					</Button>
				)}
				<Button onClick={stop} size="sm" variant="ghost">
					<StopIcon aria-hidden className="size-4" />
					{playing ? 'Остановить' : 'Скрыть путь'}
				</Button>
			</div>
			{playing ? null : (
				<p aria-live="polite" className="text-fg text-sm">
					{summary(path)}
				</p>
			)}
			<ul className="text-fg-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
				{LEGEND.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}
