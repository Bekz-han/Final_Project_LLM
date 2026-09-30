/**
 * Loading states that copy the real layout, widths included (`docs/ui-patterns.md` §8), so nothing
 * jumps when the data or the WebGL bundle arrives.
 */

const BLOCK = 'bg-surface-sunken animate-pulse rounded-md';

/** Stands in for the canvas while sigma's bundle loads. Same box, same height. */
export function CanvasSkeleton() {
	return (
		<div aria-busy aria-label="Загружаем граф" className="flex h-full items-center justify-center" role="status">
			<div className={`${BLOCK} h-full w-full`} />
			<span className="sr-only">Загружаем граф…</span>
		</div>
	);
}

/** The whole screen: header stats, the canvas card and the side panel. */
export function GraphScreenSkeleton() {
	return (
		<div aria-busy aria-label="Загружаем анализ" className="flex flex-col gap-4" role="status">
			<div className="flex flex-col gap-1">
				<div className={`${BLOCK} h-7 w-48`} />
				<div className={`${BLOCK} h-4 w-96 max-w-full`} />
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
				{['nodes', 'tx', 'kzt', 'clusters', 'priority', 'seeds'].map((key) => (
					<div
						className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"
						key={key}
					>
						<div className={`${BLOCK} size-8`} />
						<div className="flex flex-col gap-1">
							<div className={`${BLOCK} h-3 w-16`} />
							<div className={`${BLOCK} h-5 w-20`} />
						</div>
					</div>
				))}
			</div>
			<div className="grid gap-3 xl:h-[calc(100dvh-14.25rem)] xl:grid-cols-[17rem_minmax(0,1fr)_21rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_26rem]">
				<div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3.5 max-xl:order-2">
					{[1, 2, 3, 4, 5, 6].map((key) => (
						<div className={`${BLOCK} h-10 w-full`} key={key} />
					))}
				</div>
				<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3.5 max-xl:order-1">
					<div className={`${BLOCK} h-9 w-full max-w-xl`} />
					<div className={`${BLOCK} h-[60dvh] w-full xl:h-auto xl:flex-1`} />
				</div>
				<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3.5 max-xl:order-3">
					<div className={`${BLOCK} h-9 w-full`} />
					<div className={`${BLOCK} h-40 w-full`} />
				</div>
			</div>
			<span className="sr-only">Загружаем анализ…</span>
		</div>
	);
}
