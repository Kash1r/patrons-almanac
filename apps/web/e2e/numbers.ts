import type { Page } from '@playwright/test';

const MONO_STYLES = ['type-label', 'type-stat-xl', 'type-stat', 'type-table'];

/** Every visible or screen-reader text node with a digit, and whether a mono type style sets it. */
export async function numbersOn(page: Page): Promise<{ text: string; mono: boolean; family: string }[]> {
  return page.evaluate((monoStyles) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: { text: string; mono: boolean; family: string }[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent?.trim() ?? '';
      if (parent === null || ['SCRIPT', 'STYLE'].includes(parent.tagName) || !/\d/.test(text)) continue;
      const styled = parent.closest('[class*="type-"]');
      found.push({
        text,
        mono: styled !== null && monoStyles.some((style) => styled.classList.contains(style)),
        family: getComputedStyle(parent).fontFamily,
      });
    }
    return found;
  }, MONO_STYLES);
}

export const notMono = (n: { mono: boolean; family: string }) => !n.mono || !n.family.includes('IBM Plex Mono');
