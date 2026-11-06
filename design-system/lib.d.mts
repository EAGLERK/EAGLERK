export type Token = { $value: unknown; $type?: string; $description?: string; $extensions?: { mymoney?: Record<string, string> } };
export type Tokens = { primitive: Record<string, any>; semantic: Record<string, any> };
export interface SemanticColor { name: string; group: string; short: string; css?: string; description: string; light: string; dark: string; lightRef: string; darkRef: string }
export const TOKENS_PATH: string;
export function loadTokens(): Tokens;
export function resolve(T: Tokens, value: unknown): any;
export function semanticColors(T: Tokens): SemanticColor[];
export function shadowCss(layers: Array<{ color: string; offsetX: string; offsetY: string; blur: string; spread: string }>): string;
export function norm(s: string): string;
export function parseColor(s: string): { r: number; g: number; b: number; a: number };
export function over(fg: string, bg: string): string;
export function luminance(hex: string): number;
export function contrast(fg: string, bg: string): number;
export function dimensionVars(T: Tokens): string[];
export const DERIVED: { light: string[]; dark: string[] };
export function buildCss(T: Tokens): string;
