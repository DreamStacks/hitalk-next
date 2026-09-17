// The upstream @types package targets markdown-it 14; 15 ships its own types.
// This is the plugin entrypoint used by Hitalk (default options only).
declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it'
  export function full(md: MarkdownIt): void
}
