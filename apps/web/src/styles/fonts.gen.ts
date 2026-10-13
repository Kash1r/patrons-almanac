// Generated from docs/design/tokens.json by scripts/gen-tokens.ts. Do not edit; run `pnpm gen`.
import { Cormorant_Garamond, IBM_Plex_Mono, Poiret_One } from 'next/font/google';

const display = Poiret_One({ weight: ['400'], subsets: ['latin'], display: 'swap', variable: '--font-face-display' });
const serif = Cormorant_Garamond({ weight: ['500', '600'], subsets: ['latin'], display: 'swap', variable: '--font-face-serif' });
const mono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], display: 'swap', variable: '--font-face-mono' });

/** Put on <html> so the `--font-face-*` variables the token CSS reads are defined. */
export const fontVariables = [display.variable, serif.variable, mono.variable].join(' ');
