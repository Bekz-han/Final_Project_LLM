import { chatRequestSchema, chatResponseSchema } from '@server/agent/model/agent.schema';
import { runAgent } from '@server/agent/usecase/agent';
import { createCtx } from '@server/kernel/ctx';

/**
 * The only network call the interface makes.
 *
 * It validates on the way in and on the way out. The outbound parse looks redundant — we built
 * that object ourselves — but it is what stops a change in the usecase from reaching the browser
 * as `undefined` in the activity panel, which is the kind of thing nobody notices until it is on
 * a projector.
 *
 * Errors come back as a written sentence, not a status code. The interface shows what this says.
 */
const INVALID_REQUEST_MESSAGE = 'Не удалось прочитать сообщение. Попробуйте отправить его ещё раз.';
const SERVER_ERROR_MESSAGE = 'Ассистент сейчас недоступен. Попробуйте ещё раз через минуту.';

export async function POST(request: Request): Promise<Response> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
	}

	const parsedInput = chatRequestSchema.safeParse(body);

	if (!parsedInput.success) {
		return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
	}

	try {
		const result = await runAgent(createCtx(), parsedInput.data);

		return Response.json(chatResponseSchema.parse(result));
	} catch (error) {
		// The detail goes to the server log, never to the browser: a provider error message can
		// carry an endpoint, a model name or part of a key.
		process.stderr.write(`Chat request failed: ${error instanceof Error ? error.message : String(error)}\n`);

		return Response.json({ message: SERVER_ERROR_MESSAGE }, { status: 500 });
	}
}
