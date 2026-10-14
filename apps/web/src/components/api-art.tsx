/** `alt` defaults to empty: most art sits beside a text label that already names it. */
export function ApiArt({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  return <img src={src} alt={alt} className={className} />;
}
