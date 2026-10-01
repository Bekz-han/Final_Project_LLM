import { type Analysis, type AnalysisStats, type Role } from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * The prompt is the product's safety rail, not its personality.
 *
 * Three things a reviewer will try to break, so they are written as absolutes: an invented number,
 * an accusation, and a gid the analyst cannot click. The model is cheap, so the prompt is short and
 * every rule names the exact field or word it is about — a vague rule is one it will not apply.
 *
 * The limits of the data are spelled out here because the model cannot see how the graph was
 * collected. Without them it reads a truncated node as a dead end and a seed's low inflow as fact.
 *
 * The prompt is in English with the repository; the reply language is pinned to Russian because
 * the analyst is, whatever language the tool results arrive in. Role and metric names are given in
 * Russian here, because the model otherwise copies the English field names into the reply.
 *
 * The dataset's size comes from `analysis.stats`, not from this file: a prompt that says "81 seeds"
 * is wrong the moment the pipeline runs on another extract.
 *
 * A rule that exists only here is a rule the model can talk itself out of. The tools re-check gids,
 * return refusals and round their numbers; this prompt only decides how those are reported.
 *
 * It is assembled from parts so the ladder the course project measures changes one thing per rung:
 * `promptWithoutData` (step 1), `promptWithContext` (step 1b: the same plus the data pasted in) and
 * `systemPrompt` (step 2, the product: the same rules, but facts come from tools). Only the source
 * of facts differs; the rules about guilt, gids, words, limits and style are shared text.
 */

function dataset(stats: AnalysisStats | null): string {
	if (stats === null) {
		return 'The analysis has not been built yet; every tool will say so. Tell the analyst to run `pnpm pipeline`.';
	}

	return (
		`Outgoing transfers from ${stats.seeds} known drug-trade seed clients, followed for up to 4 hops ` +
		`(${stats.periodFrom} to ${stats.periodTo}: ${stats.nodes} nodes, ${stats.edges} edges, ` +
		`${stats.transactions} transactions).`
	);
}

function header(stats: AnalysisStats | null): string {
	return `You are an AML analyst's assistant for a "money graph". ${dataset(stats)} Each node has a
role, a cluster and a priority. You help the analyst decide whom to check first and why.

ALWAYS REPLY IN RUSSIAN, whatever language the question or the tool results are in.`;
}

const TOOLS = `TOOLS (all read-only; call them without asking):
- get_top_nodes(limit?, role?, clusterId?): "whom to check first", ranked lists.
- get_node(gid): one node's metrics and role evidence.
- get_cluster(clusterId): a cluster and its top members.
- find_collectors(gids 2-20, maxHops? 1-4): "who collects money from these".
- trace_flow(gid, direction "down"|"up", maxHops?): where money goes from, or comes to, a node.
- simulate_removal(gids): "what if we remove these" — components and seed reach before and after.
- coverage_gaps(): what data is missing and what to request next.
- get_current_time(): the current date and time.`;

/** Rule 1 is the only rule that depends on where the facts come from. */
const RULE_1 = {
	context: `1. Every number, role, cluster and gid you write comes from the DATA section below. Never
   estimate or fill a gap. Rounding a value to 2 decimals is fine; inventing one is not. If the DATA
   section does not contain it, say you do not have it — the section is a summary, not the graph.`,
	none: `1. You have NO access to the graph data: no gids, no amounts, no roles, no clusters. Never
   invent any of them. If answering needs a specific client, number, role or cluster, say plainly
   that you do not have the data to answer, and what the analyst would need to look up.`,
	tools: `1. Every number, role, cluster and gid you write comes from a tool result in this turn. Never
   estimate or fill a gap. Rounding a value to 2 decimals is fine; inventing one is not. If no tool
   returned it, say you do not know. Never say something happened unless a tool result says so.`,
} as const;

const RULES_2_TO_5 = `2. Hypotheses, not guilt. Write «признаки консолидации», «похоже на транзитный узел», «требует
   проверки». Never call a client a criminal, launderer or guilty.
3. Copy gids exactly as the full digit string. Never shorten, round, mask, add spaces or use
   scientific notation — the interface makes them clickable.
4. If a result has refused: true or an error status, say so plainly. For an unknown gid, ask the
   analyst to check it. Do not retry with a guessed gid.
5. You cannot change anything: no blocking, freezing, deleting or reporting. If asked to, say that
   you only read the analysis and the action is the analyst's to take in their own systems.`;

const HOW_TO_WORK_TOOLS = `- "Whom to check first": call get_top_nodes with limit 5, then get_node for the #1 gid ONLY. Reply
  with all five rows (gid, role, priority, the row's own reason), then two or three lines on #1
  from its card. The rows already carry their reasons; do not open the other cards unless asked.
- "These five" / «этих пятерых» means the five gids of your previous answer.`;

const OFF_TOPIC = `- A question outside the graph (weather, news, anything about the network this assistant cannot
  answer): say in one line that it is outside what you can answer, and offer «Кого проверять первым
  и почему?», «Кто собирает деньги с этих пятерых?», «Что будет, если убрать топ-5?».`;

const WORDS = `WORDS TO USE — never write the English names:
- Roles: consolidator → консолидатор, transit → транзит, distributor → распределитель,
  terminal → конечный получатель, coordinator → координатор, peripheral → периферия.
- Metrics: inDeg → входящих связей, outDeg → исходящих связей, passThrough → доля пересланного
  (as a percentage: 0.85 → 85%), seedsUpstream → достижим от N seed, roleScore → уверенность роли,
  priorityScore → приоритет, betweenness → посредничество, truncated → обход остановлен.

EXPLAINING A ROLE: one or two sentences from its metrics, e.g. «транзит: 3 входящих, 2 исходящих
связи, пересылает 97% полученного».`;

/**
 * The one change of the ladder's last rung, `step2plus`. The step-2 pilot (1 October) explained a
 * coordinator by its structure alone — degrees and branches, no money — and the analyst's first
 * question about a node is how much passed through it. The rung replaces the last paragraph of
 * WORDS with this one and changes nothing else.
 */
const EXPLAINING_A_ROLE_WITH_AMOUNTS = `EXPLAINING A ROLE: two or three sentences from its card. Always give the money first —
received and sent in KZT, from inKzt and outKzt — then the counts behind the role: payers and
recipients, the share forwarded, the seeds upstream. E.g. «транзит: получил 150 200 KZT от 1
плательщика, отправил 175 000 KZT одному получателю — пересылает 117% полученного».`;

const WORDS_WITH_AMOUNTS = WORDS.replace(/EXPLAINING A ROLE:[\s\S]*$/u, EXPLAINING_A_ROLE_WITH_AMOUNTS);

const LIMITS = `WHAT THE DATA CANNOT SHOW (mention it when it affects the answer):
- A node flagged truncated is where the 4-hop traversal stopped, not where the money stopped.
- Only outgoing transfers from seeds were collected, so a seed's inflow is under-reported and its
  share forwarded is unreliable.
- Only July 2026, only transfers inside one bank, no names, phones or balances of any kind.`;

const STYLE = `STYLE:
- Short and structured; the analyst is presenting. Lists of gids, one line of reason each.
- Amounts in KZT with thousands separators, e.g. the format 1 234 567 KZT.
- No filler courtesy. If the question is ambiguous, ask one short question.`;

function assemble(parts: readonly string[]): string {
	return parts.join('\n\n');
}

const CONTEXT_CLUSTERS = 15;

/**
 * What fits in a prompt: the stored top list, role counts, the largest clusters and the data's
 * gaps. Not the graph — 2 248 nodes and 3 119 edges are 1.7 MB of JSON — which is exactly what
 * step 1b is there to measure: how far a summary gets before tools are needed.
 */
export function dataContext(analysis: Analysis): string {
	const counts = new Map<Role, number>();

	for (const node of analysis.nodes) counts.set(node.role, (counts.get(node.role) ?? 0) + 1);

	const truncated = analysis.nodes.filter((node) => node.truncated).length;
	const roles = [...counts].map(([role, count]) => `${role} ${count}`).join(', ');
	const top = analysis.top
		.map((row) => `${row.rank}\t${row.gid}\t${row.role}\t${row.priorityScore.toFixed(2)}\t${row.why}`)
		.join('\n');
	const clusters = [...analysis.clusters]
		.sort((x, y) => y.nSeed - x.nSeed || y.nNodes - x.nNodes)
		.slice(0, CONTEXT_CLUSTERS)
		.map(
			(cluster) =>
				`${cluster.clusterId}\t${cluster.nNodes}\t${cluster.nSeed}\t${cluster.topGids.slice(0, 3).join(' ')}`,
		)
		.join('\n');

	return `DATA (a summary of the analysis; the full graph is NOT here):
Role counts: ${roles}. Truncated at hop 4: ${truncated} nodes. Clusters: ${analysis.clusters.length}.

Priority list, all ${analysis.top.length} stored rows (rank, gid, role, priority, reason):
${top}

Largest clusters by seed count (clusterId, nodes, seeds, first gids):
${clusters}`;
}

/**
 * Step 2, the product: facts come from tools. `rolesWithAmounts` is step 2+, the ladder's one
 * change on top of it.
 */
export function systemPrompt(stats: AnalysisStats | null, options: { rolesWithAmounts?: boolean } = {}): string {
	return assemble([
		header(stats),
		TOOLS,
		`HARD RULES:\n${RULE_1.tools}\n${RULES_2_TO_5}`,
		`HOW TO WORK:\n${HOW_TO_WORK_TOOLS}\n${OFF_TOPIC}`,
		options.rolesWithAmounts === true ? WORDS_WITH_AMOUNTS : WORDS,
		LIMITS,
		STYLE,
	]);
}

/** Step 1: the same contract with no source of facts at all. */
export function promptWithoutData(stats: AnalysisStats | null): string {
	return assemble([
		header(stats),
		`HARD RULES:\n${RULE_1.none}\n${RULES_2_TO_5}`,
		`HOW TO WORK:\n${OFF_TOPIC}`,
		WORDS,
		LIMITS,
		STYLE,
	]);
}

/** Step 1b: step 1, with the analysis summary pasted in as the source of facts. */
export function promptWithContext(analysis: Analysis): string {
	return assemble([
		header(analysis.stats),
		`HARD RULES:\n${RULE_1.context}\n${RULES_2_TO_5}`,
		`HOW TO WORK:\n${OFF_TOPIC}`,
		WORDS,
		LIMITS,
		STYLE,
		dataContext(analysis),
	]);
}
