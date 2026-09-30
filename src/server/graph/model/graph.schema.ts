import { z } from 'zod';

/**
 * The contract for the "money graph" case. Frozen at 15:10 — see `docs/plan.md`.
 *
 * Every lane builds against this file: the analytics owner's pure functions produce these shapes, the agent owner's
 * pipeline writes them to CSV and `output/analysis.json`, and the screen renders them. A change here
 * is announced once, by the lead, rather than absorbed quietly by whoever notices it first.
 *
 * Two representation rules that are easy to break:
 *
 * - A gid is a STRING. The values are around 1e17, above `Number.MAX_SAFE_INTEGER`; passing one
 *   through `Number` silently merges two different clients. hyparquet returns them as `bigint`, so
 *   convert with `String()` at read time and never again.
 * - A date is a `'YYYY-MM-DD'` string. hyparquet returns UTC-midnight `Date`s; converting them to
 *   local time moves every transaction to the previous day west of Greenwich.
 */

export const gidSchema = z.string().regex(/^\d+$/, 'A gid is a string of digits.');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD.');

/** Exactly the ТЗ's dictionary. Truncation by the 4th hop is a flag, not a seventh role. */
export const ROLES = ['consolidator', 'transit', 'distributor', 'terminal', 'coordinator', 'peripheral'] as const;
export const roleSchema = z.enum(ROLES);

// --- raw input, as read from the three parquet files ---------------------------------------------

export const rawNodeSchema = z.object({
	/** Minimum hop at which the client first appeared; 0 is a seed. */
	depth: z.number().int().min(0).max(4),
	gid: gidSchema,
	isSeed: z.boolean(),
});

export const rawEdgeSchema = z.object({
	/** Hop of the traversal at which this edge was found, 1–4. */
	depth: z.number().int().min(1).max(4),
	dst: gidSchema,
	nTx: z.number().int().positive(),
	src: gidSchema,
	sumKzt: z.number().nonnegative(),
});

export const rawTransactionSchema = z.object({
	date: isoDateSchema,
	dst: gidSchema,
	src: gidSchema,
	sumKzt: z.number().nonnegative(),
});

export const rawGraphSchema = z.object({
	edges: z.array(rawEdgeSchema),
	nodes: z.array(rawNodeSchema),
	transactions: z.array(rawTransactionSchema),
});

// --- derived, per node --------------------------------------------------------------------------

export const nodeMetricsSchema = z.object({
	/** HITS authority: receives from good hubs. */
	authority: z.number(),
	/** Brandes, directed, unweighted, normalised by (n-1)(n-2) as networkx does. */
	betweenness: z.number(),
	depth: z.number().int().min(0).max(4),
	/** Share of outgoing KZT sent within 2 days of an incoming transfer, 0–1. */
	fastTransitShare: z.number().min(0).max(1),
	gid: gidSchema,
	/** HITS hub: sends to good authorities. */
	hub: z.number(),
	inDeg: z.number().int().nonnegative(),
	inKzt: z.number().nonnegative(),
	inTx: z.number().int().nonnegative(),
	isSeed: z.boolean(),
	outDeg: z.number().int().nonnegative(),
	outKzt: z.number().nonnegative(),
	outTx: z.number().int().nonnegative(),
	/** Weighted by sumKzt, alpha 0.85, dangling mass spread uniformly — networkx semantics. */
	pagerank: z.number(),
	/** outKzt / inKzt; null when nothing came in. Unreliable for seeds by construction. */
	passThrough: z.number().nullable(),
	/** Number of distinct seeds from which this node is reachable along directed edges. */
	seedsUpstream: z.number().int().nonnegative(),
	/** depth 4 and no outgoing edges: the traversal stopped here, the money did not. */
	truncated: z.boolean(),
});

export const roleVerdictSchema = z.object({
	/** Russian, human-readable, carries numbers, at most 200 characters. */
	evidence: z.string().min(1).max(200),
	/** Machine-readable markers, for example 'truncated', 'seed', 'fast_transit'. */
	flags: z.array(z.string()),
	role: roleSchema,
	roleScore: z.number().min(0).max(1),
});

export const nodeRowSchema = nodeMetricsSchema.extend(roleVerdictSchema.shape).extend({
	clusterId: z.number().int().nonnegative(),
	priorityScore: z.number().min(0).max(1),
	/** Precomputed layout, so the picture is identical on every run. */
	x: z.number(),
	y: z.number(),
});

export const edgeRowSchema = rawEdgeSchema.extend({
	firstDate: isoDateSchema,
	lastDate: isoDateSchema,
});

export const clusterRowSchema = z.object({
	clusterId: z.number().int().nonnegative(),
	/** Russian, phrased as a hypothesis to check, never as a conclusion. */
	hypothesis: z.string().min(1),
	nNodes: z.number().int().positive(),
	nSeed: z.number().int().nonnegative(),
	/** Sum of edges whose both ends are inside the cluster. */
	sumKztInternal: z.number().nonnegative(),
	topGids: z.array(gidSchema),
});

export const topRowSchema = z.object({
	gid: gidSchema,
	priorityScore: z.number().min(0).max(1),
	rank: z.number().int().positive(),
	role: roleSchema,
	/** Russian; names the two or three terms that dominated the score, with their values. */
	why: z.string().min(1),
});

export const analysisStatsSchema = z.object({
	edges: z.number().int(),
	nodes: z.number().int(),
	periodFrom: isoDateSchema,
	periodTo: isoDateSchema,
	seeds: z.number().int(),
	totalKzt: z.number(),
	transactions: z.number().int(),
});

/** Everything the screen and the tools read. Written by the pipeline to `output/analysis.json`. */
export const analysisSchema = z.object({
	clusters: z.array(clusterRowSchema),
	edges: z.array(edgeRowSchema),
	nodes: z.array(nodeRowSchema),
	stats: analysisStatsSchema,
	/** Every threshold the role rules use, so the README and the screen show the real numbers. */
	thresholds: z.record(z.string(), z.number()),
	top: z.array(topRowSchema),
});

export const counterpartySchema = z.object({
	gid: gidSchema,
	nTx: z.number().int().positive(),
	role: roleSchema,
	sumKzt: z.number().nonnegative(),
});

export const nodeCardSchema = z.object({
	node: nodeRowSchema,
	/** Largest senders to this node by KZT, at most 5. */
	topIn: z.array(counterpartySchema),
	/** Largest receivers from this node by KZT, at most 5. */
	topOut: z.array(counterpartySchema),
});

// --- query results, returned by the agent's tools -----------------------------------------------

export const collectorSchema = z.object({
	gid: gidSchema,
	/** KZT arriving at the collector along paths that start at the given gids. */
	kztFromSources: z.number().nonnegative(),
	/** How many of the given gids reach this node within maxHops. */
	reachedFrom: z.number().int().positive(),
	role: roleSchema,
	sources: z.array(gidSchema),
});

export const flowSchema = z.object({
	direction: z.enum(['down', 'up']),
	edges: z.array(edgeRowSchema),
	gid: gidSchema,
	maxHops: z.number().int().min(1).max(4),
	nodes: z.array(z.object({ gid: gidSchema, hop: z.number().int().nonnegative(), role: roleSchema })),
});

export const collectorsInputSchema = z.object({
	gids: z.array(gidSchema).min(2).max(20),
	maxHops: z.number().int().min(1).max(4),
});

export const flowInputSchema = z.object({
	direction: z.enum(['down', 'up']),
	gid: gidSchema,
	maxHops: z.number().int().min(1).max(4),
});

/** The shape of the network at one moment, before or after removing nodes. */
export const networkSnapshotSchema = z.object({
	/** Weakly connected components, isolated nodes included. */
	components: z.number().int(),
	/** Size of the largest weakly connected component. */
	largest: z.number().int(),
	seedsInLargest: z.number().int(),
});

export const removalImpactSchema = z.object({
	after: networkSnapshotSchema,
	before: networkSnapshotSchema,
	removed: z.array(gidSchema),
});

export const coverageGapSchema = z.object({
	affectedNodes: z.number().int().nonnegative(),
	/** Russian: what is missing and what it prevents us from concluding. */
	gap: z.string(),
	/** Russian: the next data request that would close it. */
	nextRequest: z.string(),
});

export type AnalysisStats = z.infer<typeof analysisStatsSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type ClusterRow = z.infer<typeof clusterRowSchema>;
export type Collector = z.infer<typeof collectorSchema>;
export type CollectorsInput = z.infer<typeof collectorsInputSchema>;
export type FlowInput = z.infer<typeof flowInputSchema>;
export type NetworkSnapshot = z.infer<typeof networkSnapshotSchema>;
export type Counterparty = z.infer<typeof counterpartySchema>;
export type CoverageGap = z.infer<typeof coverageGapSchema>;
export type EdgeRow = z.infer<typeof edgeRowSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type NodeCard = z.infer<typeof nodeCardSchema>;
export type NodeMetrics = z.infer<typeof nodeMetricsSchema>;
export type NodeRow = z.infer<typeof nodeRowSchema>;
export type RawEdge = z.infer<typeof rawEdgeSchema>;
export type RawGraph = z.infer<typeof rawGraphSchema>;
export type RawNode = z.infer<typeof rawNodeSchema>;
export type RawTransaction = z.infer<typeof rawTransactionSchema>;
export type RemovalImpact = z.infer<typeof removalImpactSchema>;
export type Role = z.infer<typeof roleSchema>;
export type RoleVerdict = z.infer<typeof roleVerdictSchema>;
export type TopRow = z.infer<typeof topRowSchema>;
