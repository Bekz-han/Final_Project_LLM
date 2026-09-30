import 'server-only';

/**
 * Errors the interface is allowed to see.
 *
 * `docs/architecture.md` names these `ConflictError`, `DuplicateError` and
 * `ValidationError` — three subclasses. They are one class with a `kind` discriminant
 * instead, for two reasons. `max-classes-per-file` is 1, so three subclasses would be three
 * files plus the barrel the server directory does not allow. And a Server Action's result
 * crosses a serialization boundary on its way to the browser, where `instanceof` has
 * already stopped being true and a string still is.
 *
 * Six categories are listed in that document. Four are here: the three a database
 * constraint can produce, and `forbidden`, which `requirePermission` raises. Policy rejection
 * and provider failure arrive with the tiers that raise them — a kind nothing throws is a
 * kind nobody maintains.
 */
export type DomainErrorKind = 'conflict' | 'duplicate' | 'forbidden' | 'validation';

interface DomainErrorOptions {
	cause?: unknown;
	/** The database constraint that refused. For logs, and for the UI to be specific. */
	constraint?: string;
	message?: string;
}

/**
 * Deliberately plain. The interface decides what a customer reads, from `kind` and from
 * what it was doing at the time; these are what is left when nobody does.
 */
const DEFAULT_MESSAGE: Record<DomainErrorKind, string> = {
	conflict: 'This overlaps something that already exists.',
	duplicate: 'A record with these values already exists.',
	forbidden: 'This account is not allowed to do that.',
	validation: 'The database rejected this value.',
};

export class DomainError extends Error {
	readonly constraint: string | undefined;

	readonly kind: DomainErrorKind;

	constructor(kind: DomainErrorKind, options: DomainErrorOptions = {}) {
		super(options.message ?? DEFAULT_MESSAGE[kind], { cause: options.cause });

		this.name = 'DomainError';
		this.kind = kind;
		this.constraint = options.constraint;
	}
}

export function isDomainError(error: unknown): error is DomainError {
	return error instanceof DomainError;
}
