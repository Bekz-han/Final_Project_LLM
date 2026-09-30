import { ANOMALY_THRESHOLDS, detectAnomalies } from '@server/graph/model/anomalies';
import { type NodeMetrics, type RawGraph, type RoleVerdict } from '@server/graph/model/graph.schema';
import 'server-only';

/** Every numeric constant used by the role rules; also exported into analysis.json. */
export const ROLE_THRESHOLDS: Record<string, number> = {
	...ANOMALY_THRESHOLDS,
	consolidatorMaxPassThrough: 0.5,
	consolidatorMinInDeg: 5,
	consolidatorSeedMinInDeg: 3,
	consolidatorSeedMinUpstream: 2,
	coordinatorBaseScore: 0.25,
	coordinatorMaxDepth: 1,
	coordinatorMaxHops: 2,
	coordinatorMinBranches: 3,
	coordinatorMinOutDeg: 3,
	coordinatorMinTargets: 15,
	distributorMinOutDeg: 10,
	distributorOutInRatio: 2.5,
	fastTransitFlagMinShare: 0.5,
	terminalMinInDeg: 2,
	terminalMinInKzt: 200_000,
	transitMaxDegree: 8,
	transitMaxPassThrough: 1.2,
	transitMinPassThrough: 0.8,
	truncatedMaxScore: 0.5,
	truncatedMinDepth: 4,
};

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function clearance(value: number, threshold: number): number {
	return value <= threshold ? 0 : (value - threshold) / (value + threshold);
}

function clearsConsolidatorInputs(metric: NodeMetrics): boolean {
	return (
		metric.inDeg >= ROLE_THRESHOLDS.consolidatorMinInDeg! ||
		(metric.inDeg >= ROLE_THRESHOLDS.consolidatorSeedMinInDeg! &&
			metric.seedsUpstream >= ROLE_THRESHOLDS.consolidatorSeedMinUpstream!)
	);
}

function isConsolidator(metric: NodeMetrics): boolean {
	return (
		clearsConsolidatorInputs(metric) &&
		metric.passThrough !== null &&
		metric.passThrough < ROLE_THRESHOLDS.consolidatorMaxPassThrough!
	);
}

function isDistributor(metric: NodeMetrics): boolean {
	return (
		metric.outDeg >= ROLE_THRESHOLDS.distributorMinOutDeg! &&
		metric.outDeg >= ROLE_THRESHOLDS.distributorOutInRatio! * metric.inDeg
	);
}

function flagsFor(metric: NodeMetrics): string[] {
	const flags: string[] = [];
	if (metric.isSeed) flags.push('seed');
	if (metric.fastTransitShare >= ROLE_THRESHOLDS.fastTransitFlagMinShare!) flags.push('fast_transit');
	if (metric.truncated) flags.push('truncated');
	return flags;
}

function buildOutgoing(raw: RawGraph): Map<string, Set<string>> {
	const outgoing = new Map<string, Set<string>>();
	for (const edge of raw.edges) {
		const neighbours = outgoing.get(edge.src) ?? new Set<string>();
		neighbours.add(edge.dst);
		outgoing.set(edge.src, neighbours);
	}
	return outgoing;
}

function coordinatorReach(
	outgoing: Map<string, Set<string>>,
	input: { gid: string; targets: Set<string> },
): { branches: number; targets: number } {
	const reached = new Set<string>();
	const successfulBranches = new Set<string>();

	for (const branch of outgoing.get(input.gid) ?? []) {
		const branchReached = new Set<string>();
		let frontier = [branch];

		for (let hop = 1; hop <= ROLE_THRESHOLDS.coordinatorMaxHops!; hop += 1) {
			const next: string[] = [];
			for (const current of frontier) {
				if (input.targets.has(current)) branchReached.add(current);
				if (hop < ROLE_THRESHOLDS.coordinatorMaxHops!) {
					for (const neighbour of outgoing.get(current) ?? []) next.push(neighbour);
				}
			}
			frontier = next;
		}

		if (branchReached.size > 0) successfulBranches.add(branch);
		for (const target of branchReached) reached.add(target);
	}

	return { branches: successfulBranches.size, targets: reached.size };
}

function percent(value: number | null): number {
	return Math.round((value ?? 0) * 100);
}

function formatKzt(value: number): string {
	return `${Math.round(value).toLocaleString('ru-RU')} KZT`;
}

function directSeedPayers(raw: RawGraph): Map<string, number> {
	const seeds = new Set(raw.nodes.filter((node) => node.isSeed).map((node) => node.gid));
	const payers = new Map<string, Set<string>>();

	for (const edge of raw.edges) {
		if (seeds.has(edge.src)) payers.set(edge.dst, new Set([...(payers.get(edge.dst) ?? []), edge.src]));
	}

	return new Map([...payers].map(([gid, directSeeds]) => [gid, directSeeds.size]));
}

/** Assigns the first matching explainable role from the ordered rules in docs/plan.md. */
/* eslint-disable no-continue -- Each continue encodes the documented first-match role decision table. */
export function assignRoles(raw: RawGraph, metrics: Map<string, NodeMetrics>): Map<string, RoleVerdict> {
	const verdicts = new Map<string, RoleVerdict>();
	const allMetrics = [...metrics.values()];
	const outgoing = buildOutgoing(raw);
	const seedPayers = directSeedPayers(raw);
	const candidateTargets = new Set(
		allMetrics.filter((metric) => isDistributor(metric) || isConsolidator(metric)).map((metric) => metric.gid),
	);

	for (const metric of allMetrics) {
		const flags = flagsFor(metric);

		if (metric.truncated || (metric.depth >= ROLE_THRESHOLDS.truncatedMinDepth! && metric.outDeg === 0)) {
			const role = clearsConsolidatorInputs(metric) ? 'consolidator' : 'peripheral';
			const inputScore = clamp(metric.inDeg / ROLE_THRESHOLDS.consolidatorMinInDeg!);
			verdicts.set(metric.gid, {
				evidence: `обход остановлен на 4-м колене; входящих ${metric.inDeg}, достижим от seed: ${metric.seedsUpstream}`,
				flags: flags.includes('truncated') ? flags : [...flags, 'truncated'],
				role,
				roleScore: Math.min(ROLE_THRESHOLDS.truncatedMaxScore!, inputScore),
			});
			continue;
		}

		const reach = coordinatorReach(outgoing, { gid: metric.gid, targets: candidateTargets });
		const early = metric.isSeed || metric.depth <= ROLE_THRESHOLDS.coordinatorMaxDepth!;
		const branchedReach =
			reach.targets >= ROLE_THRESHOLDS.coordinatorMinTargets! &&
			reach.branches >= ROLE_THRESHOLDS.coordinatorMinBranches!;
		const coordinator = early && metric.outDeg >= ROLE_THRESHOLDS.coordinatorMinOutDeg! && branchedReach;
		if (coordinator) {
			const structuralScore = Math.max(
				clearance(metric.outDeg, ROLE_THRESHOLDS.coordinatorMinOutDeg!),
				clearance(reach.targets, ROLE_THRESHOLDS.coordinatorMinTargets!),
				clearance(reach.branches, ROLE_THRESHOLDS.coordinatorMinBranches!),
			);
			verdicts.set(metric.gid, {
				evidence: `узлов сбора/раздачи за 2 шага: ${reach.targets}; прямых ветвей: ${reach.branches}; получателей: ${metric.outDeg}`,
				flags,
				role: 'coordinator',
				roleScore: Math.max(ROLE_THRESHOLDS.coordinatorBaseScore!, structuralScore),
			});
			continue;
		}

		if (isDistributor(metric)) {
			const fanoutScore = clearance(metric.outDeg, ROLE_THRESHOLDS.distributorMinOutDeg!);
			const ratioScore = clearance(
				metric.outDeg / Math.max(1, metric.inDeg),
				ROLE_THRESHOLDS.distributorOutInRatio!,
			);
			verdicts.set(metric.gid, {
				evidence: `получателей: ${metric.outDeg}; плательщиков: ${metric.inDeg}; исходящий поток: ${formatKzt(metric.outKzt)}`,
				flags,
				role: 'distributor',
				roleScore: clamp((fanoutScore + ratioScore) / 2),
			});
			continue;
		}

		if (isConsolidator(metric)) {
			const degreeScore = clearance(metric.inDeg, ROLE_THRESHOLDS.consolidatorMinInDeg!);
			const seedScore = clearance(metric.seedsUpstream, ROLE_THRESHOLDS.consolidatorSeedMinUpstream!);
			const retentionScore =
				(ROLE_THRESHOLDS.consolidatorMaxPassThrough! - metric.passThrough!) /
				(ROLE_THRESHOLDS.consolidatorMaxPassThrough! + metric.passThrough!);
			verdicts.set(metric.gid, {
				evidence: `плательщиков: ${metric.inDeg}, прямых seed: ${seedPayers.get(metric.gid) ?? 0}; дальше: ${percent(metric.passThrough)}% входящего`,
				flags,
				role: 'consolidator',
				roleScore: clamp((Math.max(degreeScore, seedScore) + retentionScore) / 2),
			});
			continue;
		}

		const transitDegree = metric.inDeg + metric.outDeg;
		const transit =
			!metric.isSeed &&
			metric.inDeg > 0 &&
			metric.outDeg > 0 &&
			metric.passThrough !== null &&
			metric.passThrough >= ROLE_THRESHOLDS.transitMinPassThrough! &&
			metric.passThrough <= ROLE_THRESHOLDS.transitMaxPassThrough! &&
			transitDegree <= ROLE_THRESHOLDS.transitMaxDegree!;
		if (transit) {
			const distanceFromEdge = Math.min(
				(metric.passThrough! - ROLE_THRESHOLDS.transitMinPassThrough!) /
					(1 - ROLE_THRESHOLDS.transitMinPassThrough!),
				(ROLE_THRESHOLDS.transitMaxPassThrough! - metric.passThrough!) /
					(ROLE_THRESHOLDS.transitMaxPassThrough! - 1),
			);
			verdicts.set(metric.gid, {
				evidence: `передаёт ${percent(metric.passThrough)}% входящего; ${percent(metric.fastTransitShare)}% исходящих — за 2 дня`,
				flags,
				role: 'transit',
				roleScore: clamp(0.6 + 0.2 * distanceFromEdge + 0.2 * metric.fastTransitShare),
			});
			continue;
		}

		const terminal =
			metric.outDeg === 0 &&
			metric.depth < ROLE_THRESHOLDS.truncatedMinDepth! &&
			(metric.inKzt >= ROLE_THRESHOLDS.terminalMinInKzt! || metric.inDeg >= ROLE_THRESHOLDS.terminalMinInDeg!);
		if (terminal) {
			const volumeScore = clearance(metric.inKzt, ROLE_THRESHOLDS.terminalMinInKzt!);
			const degreeScore = clearance(metric.inDeg, ROLE_THRESHOLDS.terminalMinInDeg!);
			verdicts.set(metric.gid, {
				evidence: `получено: ${formatKzt(metric.inKzt)}; плательщиков: ${metric.inDeg}; исходящих: 0`,
				flags,
				role: 'terminal',
				roleScore: clamp(Math.max(volumeScore, degreeScore)),
			});
			continue;
		}

		const isolatedSeed = metric.isSeed && metric.inDeg === 0 && metric.outDeg === 0;
		const belowTerminal =
			metric.outDeg === 0 &&
			metric.depth < ROLE_THRESHOLDS.truncatedMinDepth! &&
			metric.inDeg < ROLE_THRESHOLDS.terminalMinInDeg! &&
			metric.inKzt < ROLE_THRESHOLDS.terminalMinInKzt!;
		const evidence = isolatedSeed
			? 'seed без переводов в выборке: входящих 0, исходящих 0'
			: belowTerminal
				? `ниже порога конечного получателя: плательщиков ${metric.inDeg} (нужно ≥ ${ROLE_THRESHOLDS.terminalMinInDeg}), получено ${formatKzt(metric.inKzt)} (нужно ≥ ${formatKzt(ROLE_THRESHOLDS.terminalMinInKzt!)})`
				: `смешанные признаки: плательщиков ${metric.inDeg}, получателей ${metric.outDeg}, поток ${formatKzt(metric.inKzt + metric.outKzt)}`;
		verdicts.set(metric.gid, {
			evidence,
			flags: belowTerminal || isolatedSeed ? flags : [...flags, 'mixed_signals'],
			role: 'peripheral',
			roleScore: clearance(metric.inDeg + metric.outDeg, ROLE_THRESHOLDS.transitMaxDegree!),
		});
	}

	for (const [gid, anomalyFlags] of detectAnomalies(raw)) {
		const verdict = verdicts.get(gid);
		if (verdict) verdict.flags = [...new Set([...verdict.flags, ...anomalyFlags])];
	}

	return verdicts;
}
/* eslint-enable no-continue */
