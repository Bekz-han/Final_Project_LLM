import { type Session, sessionSchema, type StoredTurn } from '@server/agent/model/agent.schema';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'server-only';

/**
 * Conversations on disk: one JSON file per session under `STATE_DIR/sessions`.
 *
 * Why files and not a database: one instance, a handful of analysts, and conversations that are
 * read whole and appended to. A file per session is all of that with nothing to install, and in
 * Docker the directory is a named volume, so it survives a restart and a rebuild of the image.
 * The starter's PostgreSQL layer was removed after the hackathon for the same reason. The limit is
 * named in the README: several instances behind a balancer would need a shared store.
 *
 * Writes go to a temporary file and are renamed into place. A rename is atomic on one filesystem,
 * so a crash mid-write leaves the previous version, never half a JSON document.
 *
 * The id is validated by `sessionIdSchema` before it reaches here — it becomes a file name.
 */

function sessionsDir(stateDir: string): string {
	return join(stateDir, 'sessions');
}

function fileFor(stateDir: string, id: string): string {
	return join(sessionsDir(stateDir), `${id}.json`);
}

/** `null` for a session never written. A corrupt file throws: that is a bug, not an empty state. */
export function readSession(stateDir: string, id: string): Session | null {
	const path = fileFor(stateDir, id);

	if (!existsSync(path)) return null;

	return sessionSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeSession(stateDir: string, session: Session): void {
	mkdirSync(sessionsDir(stateDir), { recursive: true });

	const path = fileFor(stateDir, session.id);
	const temporary = `${path}.${String(process.pid)}.tmp`;

	writeFileSync(temporary, `${JSON.stringify(sessionSchema.parse(session), null, '\t')}\n`, 'utf8');
	renameSync(temporary, path);
}

export type { Session, StoredTurn };
