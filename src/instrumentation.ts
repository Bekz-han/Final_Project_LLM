/**
 * Next.js calls this once, before the application serves anything.
 *
 * The import is dynamic and guarded because `register` also runs in the Edge runtime,
 * where `server-only` and the Node environment are not available. Nothing here belongs to
 * a request, so nothing here may assume one.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { readEnv } = await import('@server/kernel/env');

		readEnv();
	}
}
