/** How the canvas colours its nodes: by the role the rules assigned, or by Louvain community. */
export type ColorMode = 'cluster' | 'role';

/**
 * The node in focus. `seq` changes on every request, so searching for the gid already in focus
 * still flies the camera back to it after the analyst has panned away.
 */
export interface Focus {
	gid: string;
	seq: number;
}
