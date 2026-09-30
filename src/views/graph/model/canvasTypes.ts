/**
 * A "money path" as the canvas draws it: which nodes are how many hops upstream of the target, and
 * which transfers carry the money between them. The canvas reveals the path hop by hop — raising
 * `revealedHop` lights up the next ring of senders and flies the camera to fit them.
 */
export interface MoneyPathView {
	/** Transfer keys `"${src}|${dst}"` that belong to the path. */
	edges: ReadonlySet<string>;
	/** gid → hop number: 0 is the target node, 1 its direct senders, and so on. */
	hops: ReadonlyMap<string, number>;
	/** Nodes with `hop <= revealedHop` are shown; everything else recedes to dust. */
	revealedHop: number;
}

/** The key a path uses for the transfer from `src` to `dst`. */
export function pathEdgeKey(src: string, dst: string): string {
	return `${src}|${dst}`;
}
