import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_PATCHES } from '../openapi/patches';

const upstreamSpec = () => JSON.parse(readFileSync(new URL('../openapi/spec.json', import.meta.url), 'utf8'));

describe.each(SPEC_PATCHES.map((patch) => [patch.id, patch] as const))('%s', (_id, patch) => {
  it('still changes the upstream spec; when this fails, upstream fixed it, so delete the patch', () => {
    expect(patch.apply(upstreamSpec())).toBeGreaterThan(0);
  });

  it('changes nothing on an already-patched spec', () => {
    const spec = upstreamSpec();
    patch.apply(spec);
    expect(patch.apply(spec)).toBe(0);
  });
});

it('drop-integer-formats unbounds the two integers its evidence names', () => {
  const spec = upstreamSpec();
  const accountId = () =>
    spec.paths['/v1/players/{account_id}/match-history'].get.parameters.find((p: { name: string }) => p.name === 'account_id').schema;
  const itemId = () => spec.components.schemas.HeroPopularItem.properties.item_id;
  expect([accountId().format, itemId().format]).toEqual(['int32', 'int32']);

  SPEC_PATCHES.find((p) => p.id === 'drop-integer-formats')!.apply(spec);

  expect([accountId().format, itemId().format]).toEqual([undefined, undefined]);
});
