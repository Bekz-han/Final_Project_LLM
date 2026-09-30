import { type Usage } from '@server/agent/model/agent.schema';
import { readEnv } from '@server/kernel/env';
import 'server-only';

/**
 * Tokens and money for one turn, summed over its model calls.
 *
 * An agentic turn is several calls — the tool definitions and the growing conversation are resent
 * each time — so the cost of an answer is the sum, never the last call. The prices come from the
 * environment because they belong to the provider and change without our code changing.
 */
export class UsageMeter {
	private calls = 0;

	private input = 0;

	private output = 0;

	/** Either dialect's usage object; a provider that omits it counts as zero, not as a crash. */
	add(usage: { input?: number | undefined; output?: number | undefined } | undefined): void {
		this.calls += 1;
		this.input += usage?.input ?? 0;
		this.output += usage?.output ?? 0;
	}

	total(): Usage {
		const env = readEnv();
		const costUsd =
			(this.input / 1e6) * env.LLM_PRICE_INPUT_PER_MTOK + (this.output / 1e6) * env.LLM_PRICE_OUTPUT_PER_MTOK;

		return {
			costUsd: Math.round(costUsd * 1e8) / 1e8,
			inputTokens: this.input,
			modelCalls: this.calls,
			outputTokens: this.output,
		};
	}
}

export const NO_USAGE: Usage = { costUsd: 0, inputTokens: 0, modelCalls: 0, outputTokens: 0 };
