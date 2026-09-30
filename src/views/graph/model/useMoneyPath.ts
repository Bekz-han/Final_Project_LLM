import { type Analysis } from '@server/graph/model/graph.schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMoneyPath, type MoneyPath } from './moneyPath';

/** What the canvas draws: which nodes and edges are on the path, and how far it has unfolded. */
export interface MoneyPathView {
	edges: ReadonlySet<string>;
	hops: ReadonlyMap<string, number>;
	revealedHop: number;
}

export interface MoneyPathController {
	path: MoneyPath | null;
	playing: boolean;
	replay: () => void;
	start: (gid: string) => void;
	stop: () => void;
	view: MoneyPathView | null;
}

/** One hop per step: long enough to follow the money with the eye, short enough to not wait. */
const STEP_MS = 900;

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays a money path on the canvas: hop 0 first, then one more hop of senders every step.
 * With reduced motion the whole path appears at once.
 */
export function useMoneyPath(analysis: Pick<Analysis, 'edges' | 'nodes'>): MoneyPathController {
	const [path, setPath] = useState<MoneyPath | null>(null);
	const [revealedHop, setRevealedHop] = useState(0);
	const [playing, setPlaying] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clear = useCallback(() => {
		if (timer.current !== null) clearTimeout(timer.current);
		timer.current = null;
	}, []);

	const play = useCallback(
		(next: MoneyPath | null) => {
			clear();
			setPath(next);

			if (next === null || next.maxHop === 0 || prefersReducedMotion()) {
				setRevealedHop(next?.maxHop ?? 0);
				setPlaying(false);

				return;
			}

			setRevealedHop(0);
			setPlaying(true);

			const step = (hop: number) => {
				timer.current = setTimeout(() => {
					setRevealedHop(hop);

					if (hop < next.maxHop) step(hop + 1);
					else {
						timer.current = null;
						setPlaying(false);
					}
				}, STEP_MS);
			};

			step(1);
		},
		[clear],
	);

	const start = useCallback((gid: string) => play(buildMoneyPath(analysis, { gid })), [analysis, play]);

	const stop = useCallback(() => {
		clear();
		setPlaying(false);
		setPath(null);
	}, [clear]);

	const replay = useCallback(() => {
		if (path !== null) play(path);
	}, [path, play]);

	useEffect(() => clear, [clear]);

	// A new analysis invalidates the path: its gids may no longer exist.
	useEffect(() => stop, [analysis, stop]);

	const view = useMemo(
		() => (path === null ? null : { edges: path.edges, hops: path.hops, revealedHop }),
		[path, revealedHop],
	);

	return { path, playing, replay, start, stop, view };
}
