import color from 'picocolors';

/** RapidKit CLI palette — minimal, distinct from Nuxt green. */
export const rk = {
  brand: (text: string) => color.cyan(text),
  accent: (text: string) => color.magenta(text),
  value: (text: string) => color.cyan(text),
  dim: (text: string) => color.gray(text),
  muted: (text: string) => color.dim(text),
  success: (text: string) => color.green(text),
  warn: (text: string) => color.yellow(text),
  error: (text: string) => color.red(text),
  white: (text: string) => color.white(text),
  bold: (text: string) => color.bold(text),
};

export const symbols = {
  diamond: '◇',
  diamondActive: '◆',
  bullet: '·',
} as const;
