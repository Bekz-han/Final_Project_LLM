import { type RawGraph } from '@server/graph/model/graph.schema';
import 'server-only';

/** Thresholds of the anomaly flags; merged into ROLE_THRESHOLDS so they reach analysis.json. */
export const ANOMALY_THRESHOLDS: Record<string, number> = {
	burstMinRatio: 3,
	burstMinTransactions: 3,
	cycleMaxLength: 6,
	depthOutlierMinStratum: 20,
	depthOutlierQuantile: 0.95,
	repeatRouteMaxLagDays: 2,
	repeatRouteMinDates: 2,
	repeatRouteMinTx: 2,
	splitMaxSpread: 0.1,
	splitMinTransfers: 3,
	syncInflowMinPayers: 3,
};

type Transaction = RawGraph['transactions'][number];

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function groupBy(transactions: Transaction[], key: (tx: Transaction) => string): Map<string, Transaction[]> {
	const groups = new Map<string, Transaction[]>();
	for (const tx of transactions) {
		const k = key(tx);
		const group = groups.get(k) ?? [];
		group.push(tx);
		groups.set(k, group);
	}
	return groups;
}

function isSplitGroup(group: Transaction[]): boolean {
	if (group.length < ANOMALY_THRESHOLDS.splitMinTransfers!) return false;
	const amounts = group.map((tx) => tx.sumKzt);
	const center = median(amounts);
	if (center <= 0) return false;
	return amounts.every((amount) => Math.abs(amount - center) <= ANOMALY_THRESHOLDS.splitMaxSpread! * center);
}

/** Receivers that got ≥ 3 near-equal transfers from one sender on one date. */
function splitReceivers(raw: RawGraph): Set<string> {
	const receivers = new Set<string>();
	const groups = groupBy(raw.transactions, (tx) => `${tx.src}|${tx.dst}|${tx.date}`);
	for (const group of groups.values()) {
		if (isSplitGroup(group)) receivers.add(group[0]!.dst);
	}
	return receivers;
}

/** Receivers that got money from ≥ 3 distinct payers on one date. */
function syncInflowReceivers(raw: RawGraph): Set<string> {
	const receivers = new Set<string>();
	const groups = groupBy(raw.transactions, (tx) => `${tx.dst}|${tx.date}`);
	for (const group of groups.values()) {
		const payers = new Set(group.map((tx) => tx.src));
		if (payers.size >= ANOMALY_THRESHOLDS.syncInflowMinPayers!) receivers.add(group[0]!.dst);
	}
	return receivers;
}

function returnsWithin(outgoing: Map<string, Set<string>>, start: string): boolean {
	const seen = new Set<string>();
	let frontier = [...(outgoing.get(start) ?? [])].filter((gid) => gid !== start);
	for (let length = 2; length <= ANOMALY_THRESHOLDS.cycleMaxLength! && frontier.length > 0; length += 1) {
		const next: string[] = [];
		for (const current of frontier) {
			for (const neighbour of outgoing.get(current) ?? []) {
				if (neighbour === start) return true;
				if (!seen.has(neighbour)) {
					seen.add(neighbour);
					next.push(neighbour);
				}
			}
		}
		frontier = next;
	}
	return false;
}

/** Nodes on a directed cycle of length ≤ cycleMaxLength (self-loops ignored); bounded BFS per node. */
function cycleNodes(raw: RawGraph): Set<string> {
	const outgoing = new Map<string, Set<string>>();
	for (const edge of raw.edges) {
		if (edge.src !== edge.dst) {
			const neighbours = outgoing.get(edge.src) ?? new Set<string>();
			neighbours.add(edge.dst);
			outgoing.set(edge.src, neighbours);
		}
	}
	return new Set([...outgoing.keys()].filter((gid) => returnsWithin(outgoing, gid)));
}

const DAY_MS = 86_400_000;

function dayOf(date: string): number {
	return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function isBurst(perDate: Map<string, number>): boolean {
	if (perDate.size < 2) return false;
	const counts = [...perDate.values()];
	const mean = counts.reduce((total, count) => total + count, 0) / counts.length;
	return counts.some(
		(count) => count >= ANOMALY_THRESHOLDS.burstMinTransactions! && count >= ANOMALY_THRESHOLDS.burstMinRatio! * mean,
	);
}

/** Nodes whose transaction count on one date is ≥ 3 and ≥ 3× their mean over active dates (≥ 2 active dates). */
function burstNodes(raw: RawGraph): Set<string> {
	const perNode = new Map<string, Map<string, number>>();
	for (const tx of raw.transactions) {
		for (const gid of tx.src === tx.dst ? [tx.src] : [tx.src, tx.dst]) {
			const perDate = perNode.get(gid) ?? new Map<string, number>();
			perDate.set(tx.date, (perDate.get(tx.date) ?? 0) + 1);
			perNode.set(gid, perDate);
		}
	}
	return new Set([...perNode].filter(([, perDate]) => isBurst(perDate)).map(([gid]) => gid));
}

function stratumOutliers(stratum: [string, number][]): string[] {
	if (stratum.length < ANOMALY_THRESHOLDS.depthOutlierMinStratum!) return [];
	const sorted = stratum.map(([, value]) => value).sort((left, right) => left - right);
	const cut = sorted[Math.floor(ANOMALY_THRESHOLDS.depthOutlierQuantile! * (sorted.length - 1))]!;
	return stratum.filter(([, value]) => value >= 0 && value >= cut).map(([gid]) => gid);
}

/** Nodes at or above the 0.95 quantile of log1p(in+out KZT) within their own depth (strata of ≥ 20 nodes). */
function depthOutlierNodes(raw: RawGraph): Set<string> {
	const volume = new Map<string, number>();
	for (const edge of raw.edges) {
		volume.set(edge.src, (volume.get(edge.src) ?? 0) + edge.sumKzt);
		volume.set(edge.dst, (volume.get(edge.dst) ?? 0) + edge.sumKzt);
	}
	const strata = new Map<number, [string, number][]>();
	for (const node of raw.nodes) {
		const stratum = strata.get(node.depth) ?? [];
		stratum.push([node.gid, volume.has(node.gid) ? Math.log1p(volume.get(node.gid)!) : -1]);
		strata.set(node.depth, stratum);
	}
	return new Set([...strata.values()].flatMap((stratum) => stratumOutliers(stratum)));
}

function daysByPeer(transactions: Transaction[], peer: (tx: Transaction) => string): Map<string, number[]> {
	const result = new Map<string, number[]>();
	for (const tx of transactions) {
		const days = result.get(peer(tx)) ?? [];
		days.push(dayOf(tx.date));
		result.set(peer(tx), days);
	}
	return result;
}

function routeRepeats(received: number[], sent: number[]): boolean {
	const matched = new Set(
		sent.filter((day) =>
			received.some((got) => day - got >= 0 && day - got <= ANOMALY_THRESHOLDS.repeatRouteMaxLagDays!),
		),
	);
	return matched.size >= ANOMALY_THRESHOLDS.repeatRouteMinDates!;
}

function isRepeatHub(inbound: Map<string, number[]>, outbound: Map<string, number[]>): boolean {
	for (const [from, received] of inbound) {
		for (const [to, sent] of outbound) {
			if (from !== to && routeRepeats(received, sent)) return true;
		}
	}
	return false;
}

/** Middle nodes B of A→B→C (both edges nTx ≥ 2) that forwarded to C within 2 days of receiving from A on ≥ 2 dates. */
function repeatRouteNodes(raw: RawGraph): Set<string> {
	const strong = new Set(
		raw.edges
			.filter((edge) => edge.src !== edge.dst && edge.nTx >= ANOMALY_THRESHOLDS.repeatRouteMinTx!)
			.map((edge) => `${edge.src}|${edge.dst}`),
	);
	const routed = raw.transactions.filter((tx) => strong.has(`${tx.src}|${tx.dst}`));
	const inbound = groupBy(routed, (tx) => tx.dst);
	const outbound = groupBy(routed, (tx) => tx.src);
	const hubs = new Set<string>();
	for (const [gid, incoming] of inbound) {
		const outgoing = outbound.get(gid);
		if (
			outgoing &&
			isRepeatHub(
				daysByPeer(incoming, (tx) => tx.src),
				daysByPeer(outgoing, (tx) => tx.dst),
			)
		) {
			hubs.add(gid);
		}
	}
	return hubs;
}

/** Pure anomaly detection: gid → flags (split, sync_inflow, cycle, burst, depth_outlier, repeat_route). */
export function detectAnomalies(raw: RawGraph): Map<string, string[]> {
	const result = new Map<string, string[]>();
	const detected: [string, Set<string>][] = [
		['split', splitReceivers(raw)],
		['sync_inflow', syncInflowReceivers(raw)],
		['cycle', cycleNodes(raw)],
		['burst', burstNodes(raw)],
		['depth_outlier', depthOutlierNodes(raw)],
		['repeat_route', repeatRouteNodes(raw)],
	];
	for (const [flag, gids] of detected) {
		for (const gid of gids) result.set(gid, [...(result.get(gid) ?? []), flag]);
	}
	return result;
}
