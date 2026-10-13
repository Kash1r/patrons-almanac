import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const TOKENS = new URL('../docs/design/tokens.json', import.meta.url);
const CSS_OUT = new URL('../apps/web/src/styles/tokens.gen.css', import.meta.url);
const FONTS_OUT = new URL('../apps/web/src/styles/fonts.gen.ts', import.meta.url);

const HEADER = 'Generated from docs/design/tokens.json by scripts/gen-tokens.ts. Do not edit; run `pnpm gen`.';

const zNamedValue = z.object({ name: z.string(), value: z.string(), usage: z.string() });

const zTheme = z.object({ id: z.string(), name: z.string() });

const zTypeStyle = z.object({
  name: z.string(),
  fontSize: z.string(),
  lineHeight: z.string(),
  fontWeight: z.int(),
  letterSpacing: z.string().optional(),
});

const zDesignTokens = z
  .object({
    color: z.object({
      themes: z.tuple([zTheme], zTheme),
      tokens: z.array(z.object({ name: z.string(), value: z.record(z.string(), z.string()), usage: z.string() })),
    }),
    type: z.object({
      families: z.record(z.string(), z.string()),
      groups: z.array(z.object({ name: z.string(), family: z.string(), styles: z.array(zTypeStyle) })),
    }),
    spacing: z.object({ tokens: z.array(zNamedValue) }),
    radius: z.object({ tokens: z.array(zNamedValue) }),
    corner: z.object({ tokens: z.array(zNamedValue) }),
  })
  .superRefine((tokens, ctx) => {
    tokens.color.tokens.forEach((token, i) => {
      for (const theme of tokens.color.themes) {
        if (token.value[theme.id] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['color', 'tokens', i, 'value', theme.id],
            message: `colour "${token.name}" has no value for theme "${theme.id}"`,
          });
        }
      }
    });
    tokens.type.groups.forEach((group, i) => {
      if (tokens.type.families[group.family] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['type', 'groups', i, 'family'],
          message: `type group "${group.name}" names unknown family "${group.family}"`,
        });
      }
    });
  });

type DesignTokens = z.infer<typeof zDesignTokens>;

function splitStack(stack: string): { google: string; fallbacks: string } {
  const [first = '', ...rest] = stack.split(',').map((part) => part.trim());
  return { google: first.replace(/^"|"$/g, ''), fallbacks: rest.join(', ') };
}

function weightsByFamily(tokens: DesignTokens): Map<string, string[]> {
  const weights = new Map<string, Set<number>>();
  for (const group of tokens.type.groups) {
    const set = weights.get(group.family) ?? new Set<number>();
    for (const style of group.styles) set.add(style.fontWeight);
    weights.set(group.family, set);
  }
  return new Map([...weights].map(([family, set]) => [family, [...set].sort((a, b) => a - b).map(String)]));
}

function renderTokensCss(tokens: DesignTokens): string {
  const [defaultTheme, ...otherThemes] = tokens.color.themes;
  const colours = (themeId: string) => tokens.color.tokens.map((t) => `  --color-${t.name}: ${t.value[themeId]};`);

  const theme = [
    '@theme {',
    '  --color-*: initial;',
    ...colours(defaultTheme.id),
    '',
    '  --font-*: initial;',
    ...Object.entries(tokens.type.families).map(
      ([family, stack]) => `  --font-${family}: var(--font-face-${family}), ${splitStack(stack).fallbacks};`,
    ),
    '  --default-font-family: var(--font-serif);',
    '  --default-mono-font-family: var(--font-mono);',
    '',
    '  --text-*: initial;',
    '',
    '  --spacing-*: initial;',
    ...tokens.spacing.tokens.map((t) => `  --spacing-${t.name.replace(/^space-/, '')}: ${t.value};`),
    '',
    '  --radius-*: initial;',
    ...tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`),
    '',
    ...tokens.corner.tokens.map((t) => `  --${t.name}: ${t.value};`),
    '}',
  ];

  const themeOverrides = otherThemes.flatMap((t) => ['', `[data-theme="${t.id}"] {`, ...colours(t.id), '}']);

  const typeUtilities = tokens.type.groups.flatMap((group) =>
    group.styles.flatMap((style) => [
      '',
      `@utility type-${style.name} {`,
      `  font-family: var(--font-${group.family});`,
      `  font-size: ${style.fontSize};`,
      `  line-height: ${style.lineHeight};`,
      `  font-weight: ${style.fontWeight};`,
      ...(style.letterSpacing === undefined ? [] : [`  letter-spacing: ${style.letterSpacing};`]),
      '}',
    ]),
  );

  return [`/* ${HEADER} */`, '', ...theme, ...themeOverrides, ...typeUtilities, ''].join('\n');
}

/** next/font needs literal arguments, which is why this is generated code and not a loop at runtime. */
function renderFontsModule(tokens: DesignTokens): string {
  const weights = weightsByFamily(tokens);
  const families = Object.entries(tokens.type.families).map(([family, stack]) => ({
    family,
    loader: splitStack(stack).google.replaceAll(' ', '_'),
    weights: weights.get(family) ?? [],
  }));
  const loaders = [...new Set(families.map((f) => f.loader))].sort();

  return [
    `// ${HEADER}`,
    `import { ${loaders.join(', ')} } from 'next/font/google';`,
    '',
    ...families.map(
      (f) =>
        `const ${f.family} = ${f.loader}({ weight: [${f.weights.map((w) => `'${w}'`).join(', ')}], ` +
        `subsets: ['latin'], display: 'swap', variable: '--font-face-${f.family}' });`,
    ),
    '',
    '/** Put on <html> so the `--font-face-*` variables the token CSS reads are defined. */',
    `export const fontVariables = [${families.map((f) => `${f.family}.variable`).join(', ')}].join(' ');`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const tokens = zDesignTokens.parse(JSON.parse(await readFile(TOKENS, 'utf8')));
  await writeFile(CSS_OUT, renderTokensCss(tokens));
  await writeFile(FONTS_OUT, renderFontsModule(tokens));
}

await main();
