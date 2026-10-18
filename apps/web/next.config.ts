import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@almanac/api-client'],
  // CLAUDE.md is the agent guide for this repo; without this, `next dev` writes an AGENTS.md beside it.
  agentRules: false,
};

export default config;
