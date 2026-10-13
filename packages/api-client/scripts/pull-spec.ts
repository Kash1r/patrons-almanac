import { writeFile } from 'node:fs/promises';

const SPEC_URL = 'https://api.deadlock-api.com/openapi.json';
const SNAPSHOT = new URL('../openapi/spec.json', import.meta.url);

async function pullSpec(): Promise<void> {
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`spec pull failed: ${res.status}`);
  await writeFile(SNAPSHOT, JSON.stringify(await res.json(), null, 2) + '\n');
}

await pullSpec();
