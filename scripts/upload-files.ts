/**
 * Puts a folder of documents behind the agent's `file_search` tool.
 *
 *   pnpm tsx scripts/upload-files.ts ./docs/corpus
 *
 * It creates a hosted vector store, uploads everything in the folder, waits for indexing and
 * prints the id. Put that id in `.env` as `OPENAI_VECTOR_STORE_ID` and the Responses adapter
 * offers the tool automatically — no embedding code, no vector database, no chunking of ours.
 *
 * OpenAI only. The Chat Completions adapter has no hosted tools, which is the trade for talking
 * to every other provider.
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import OpenAI from 'openai';

async function main(): Promise<void> {
	const folder = process.argv[2];

	if (folder === undefined) {
		throw new Error('Usage: pnpm tsx scripts/upload-files.ts <folder>');
	}

	const apiKey = process.env.LLM_API_KEY;

	if (apiKey === undefined || apiKey.length === 0) {
		throw new Error('LLM_API_KEY is not set. This script talks to OpenAI directly.');
	}

	// No baseURL: hosted tools are OpenAI's, so this deliberately ignores LLM_BASE_URL.
	const client = new OpenAI({ apiKey });
	const entries = await readdir(folder, { withFileTypes: true });
	const files = entries.filter((entry) => entry.isFile()).map((entry) => join(folder, entry.name));

	if (files.length === 0) {
		throw new Error(`No files in ${folder}.`);
	}

	const store = await client.vectorStores.create({ name: `${basename(folder)}-${Date.now().toString()}` });

	process.stdout.write(`Uploading ${files.length.toString()} file(s) to ${store.id}…\n`);

	await client.vectorStores.fileBatches.uploadAndPoll(store.id, {
		files: files.map((file) => createReadStream(file)),
	});

	process.stdout.write(`\nOPENAI_VECTOR_STORE_ID=${store.id}\n\nAdd that line to .env.\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
