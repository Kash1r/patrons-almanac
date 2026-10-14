import { defineConfig } from '@hey-api/openapi-ts';
import { applySpecPatches } from './openapi/patches';

const OPERATIONS = [
  'GET /v1/players/{account_id}/match-history',
  'GET /v1/assets/heroes',
  'GET /v1/assets/ranks',
  'GET /v1/players/{account_id}/rank',
  'GET /v1/players/steam',
  'GET /v1/matches/{match_id}/metadata',
  'GET /v1/assets/items/by-type/{type}',
  'GET /v1/players/steam-search',
  'GET /v1/leaderboard/{region}',
];

export default defineConfig({
  input: './openapi/spec.json',
  output: './src/generated',
  parser: {
    filters: { operations: { include: OPERATIONS } },
    patch: { input: applySpecPatches },
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    { name: 'zod', definitions: { types: { infer: true } } },
    { name: '@hey-api/sdk', validator: true },
  ],
});
