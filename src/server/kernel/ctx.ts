import 'server-only';

/**
 * The first argument to every domain operation.
 *
 * `now` is injected rather than read, so a rule that depends on the clock — an expiry, a notice
 * period, "upcoming" — can be tested without waiting for a Tuesday. `createCtx` is the one place
 * in the application allowed to call `new Date()`.
 *
 * Add to it as the product needs: a `userId` once there is authentication, a `requestId` once
 * there are logs worth correlating. Keep it small and serialisable.
 */
export interface Ctx {
	now: Date;
}

export function createCtx(overrides: Partial<Ctx> = {}): Ctx {
	return { now: new Date(), ...overrides };
}
