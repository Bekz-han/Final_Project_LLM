import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { GraphScreen } from '@pages/graph';
import { type Analysis } from '@server/graph/model/graph.schema';
import { getAnalysis } from '@server/graph/usecase/getAnalysis';
import { createCtx } from '@server/kernel/ctx';
import { Callout } from '@shared/ui/Callout';
import { AppShell, type NavigationSection } from '@widgets/appShell';

/**
 * «Граф денег»: the network, and beside it the card, the priority list, the clusters and the
 * assistant — one screen, so a gid the assistant cites can be shown on the graph with one click.
 *
 * The analysis comes from `output/analysis.json`, written by `pnpm pipeline` (which `predev` and
 * `prebuild` run). A missing file is the screen's empty state; a broken one is an error that names
 * the problem, because re-running the pipeline only helps if the pipeline is what is broken.
 *
 * Sections are passed in rather than read from anywhere, because a widget may not import from
 * `src/server/`. Whoever renders the shell decides what this visitor sees.
 */
const SECTIONS: readonly NavigationSection[] = [
	{ href: '/', Icon: ChatBubbleLeftRightIcon, label: 'Граф и ассистент' },
];

type Loaded = { analysis: Analysis | null; kind: 'ok' } | { kind: 'error'; message: string };

function load(): Loaded {
	try {
		return { analysis: getAnalysis(createCtx()), kind: 'ok' };
	} catch (cause) {
		return { kind: 'error', message: cause instanceof Error ? cause.message : 'Неизвестная ошибка.' };
	}
}

export default function HomePage() {
	const loaded = load();

	return (
		<AppShell sections={SECTIONS} title="Граф денег">
			{loaded.kind === 'ok' ? (
				<GraphScreen analysis={loaded.analysis} />
			) : (
				<Callout tone="danger">
					<p className="font-medium">Файл анализа повреждён</p>
					<p>
						<code>output/analysis.json</code> не прошёл проверку: {loaded.message}
					</p>
					<p>
						Перезапустите <code>pnpm pipeline</code>; если ошибка повторится — это ошибка пайплайна.
					</p>
				</Callout>
			)}
		</AppShell>
	);
}
