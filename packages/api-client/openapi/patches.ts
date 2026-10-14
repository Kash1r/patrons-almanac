import type { OpenApi } from '@hey-api/openapi-ts';

export type OpenApiDocument = OpenApi.V2_0_X | OpenApi.V3_0_X | OpenApi.V3_1_X;

export interface SpecPatch {
  readonly id: string;
  readonly evidence: string;
  readonly apply: (spec: OpenApiDocument) => number;
}

export const SPEC_PATCHES: readonly SpecPatch[] = [
  {
    id: 'drop-integer-formats',
    evidence:
      'Schemas declare int32, but live hero item_id values exceed 2^31 and strict parsing rejects /v1/assets/heroes. ' +
      'int64 makes zod coerce to bigint while types.gen.ts says number. With no format every integer is z.int(), ' +
      'which accepts safe integers only. The account_id path parameter is int32 too, which caps the request ' +
      'validator at 2^31-1, while the API accepts account 4294967295 (200) and rejects 4294967296 (400). ' +
      'Measured: 898 matches and 65 heroes parse after the patch.',
    apply: dropIntegerFormats,
  },
  {
    id: 'item-property-value-number',
    evidence:
      'ItemProperty.value is typed string | null, and its own description says it preserves numeric and string ' +
      'bonuses ("14.5" vs 14.5). Live /v1/assets/items/by-type/upgrade sends numbers (AbilityCooldown.value), ' +
      'so every response failed validation. Measured: 250 upgrades parse after the patch.',
    apply: allowNumericItemPropertyValue,
  },
];

export function applySpecPatches(spec: OpenApiDocument): void {
  for (const patch of SPEC_PATCHES) patch.apply(spec);
}

function allowNumericItemPropertyValue(spec: OpenApiDocument): number {
  const value = (spec as OpenApi.V3_1_X).components?.schemas?.ItemProperty?.properties?.value;
  if (typeof value !== 'object' || !Array.isArray(value.type) || value.type.includes('number')) return 0;
  value.type = [...value.type, 'number'];
  return 1;
}

function dropIntegerFormats(node: unknown): number {
  if (typeof node !== 'object' || node === null) return 0;
  let changed = 0;
  if ('format' in node && (node.format === 'int32' || node.format === 'int64')) {
    Reflect.deleteProperty(node, 'format');
    changed += 1;
  }
  for (const child of Object.values(node)) changed += dropIntegerFormats(child);
  return changed;
}
