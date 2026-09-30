/**
 * What a Server Action answers, and how a rejected field finds its way back to its input.
 *
 * Before this, every action returned one sentence and every screen printed it in a red box at
 * the top. A form that says "Не удалось сохранить" above eight fields has told the person that
 * something is wrong and nothing about which thing — and the `Field` primitive had carried an
 * `error` slot, an `aria-invalid` and an `aria-describedby` from the day it was written, unused
 * in all thirty-six places it appeared.
 *
 * The client validates first, with the same schema the server enforces, so in practice a
 * `ZodError` rarely reaches here. It still has to be handled: the browser can be old, the
 * script can fail, and a Server Action is a public endpoint whether or not a form is in front
 * of it. When one does arrive, it arrives per field rather than as one sentence.
 */

/** A `ZodError`, recognised by shape rather than by `instanceof`. */
interface ZodIssueLike {
	message: string;
	path: readonly PropertyKey[];
}

function issuesOf(error: unknown): ZodIssueLike[] | null {
	// `instanceof ZodError` is a trap across a Server Action boundary: the error crosses a
	// module graph, and two copies of zod make one of them fail the check silently.
	const issues: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'issues') : undefined;

	if (!Array.isArray(issues)) {
		return null;
	}

	return issues.filter(
		(issue): issue is ZodIssueLike =>
			typeof issue === 'object' &&
			issue !== null &&
			typeof Reflect.get(issue, 'message') === 'string' &&
			Array.isArray(Reflect.get(issue, 'path')),
	);
}

/**
 * The first complaint about each field.
 *
 * First, not all of them: a person fixes one thing at a time, and three messages under one
 * input is a wall. The path is joined with dots so a nested field still finds its input.
 */
export function fieldErrors(error: unknown): Record<string, string> | undefined {
	const issues = issuesOf(error);

	if (issues === null || issues.length === 0) {
		return undefined;
	}

	const found: Record<string, string> = {};

	for (const issue of issues) {
		const key = issue.path.map((step) => String(step)).join('.');

		// A complaint with no path is about the object as a whole and has no field to sit under.
		if (key !== '' && !(key in found)) {
			found[key] = issue.message;
		}
	}

	return Object.keys(found).length === 0 ? undefined : found;
}

export interface ActionResult {
	/** Field name -> message, when the server rejected particular inputs. */
	fields?: Record<string, string>;
	/** What to say above the form when no single field is to blame. */
	message?: string;
	ok: boolean;
}

/**
 * Hands the server's complaints to the form, so each one lands under its own input.
 *
 * Typed against the one method it uses rather than against react-hook-form's generics: the
 * caller passes `form.setError`, and this file stays out of an argument about `TFieldValues`
 * that it has nothing to contribute to.
 */
export function applyFieldErrors(
	setError: (name: never, error: { message: string }) => void,
	fields: Record<string, string> | undefined,
): void {
	for (const [name, message] of Object.entries(fields ?? {})) {
		setError(name as never, { message });
	}
}
