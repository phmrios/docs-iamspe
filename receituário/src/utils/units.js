// Conversão de unidades. A composição trabalha em "px lógicos" (96 por polegada),
// com valores fracionários; a conversão para pontos tipográficos acontece só no PDF.
export const PX_PER_MM = 96 / 25.4;
export const PX_PER_PT = 96 / 72;

export const mm = (value) => value * PX_PER_MM;
export const pt = (value) => value * PX_PER_PT;
export const pxToPt = (value) => value / PX_PER_PT;
export const pxToMm = (value) => value / PX_PER_MM;

/** Arredonda apenas para serialização (CSS, chaves de cache); nunca para compor. */
export const round3 = (value) => Math.round(value * 1000) / 1000;
