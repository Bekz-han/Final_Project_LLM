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
		const { checkTracing } = await import('@server/kernel/tracing');

		readEnv();

		// Wrong Langfuse keys lose every trace without a word, so the answer is printed at boot.
		// Not awaited and never fatal: the service starts either way, and /api/health repeats it.
		void checkTracing().then((status) => {
			const note = {
				disabled: 'tracing off (no LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY)',
				ok: 'tracing to Langfuse: connected',
				unauthorized: 'tracing to Langfuse: KEYS REJECTED — no traces will be recorded',
				unreachable: 'tracing to Langfuse: UNREACHABLE — traces will be lost until it answers',
			}[status];

			process.stdout.write(`${note}\n`);
		});
	}
}
