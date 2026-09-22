import type { PaletteToken } from "./types";

export const STOCK_PALETTE: Record<PaletteToken, string> = {
  white: "#ffffff",
  yellow: "#d3d61e",
  green: "#30a050",
  blue: "#2866c4",
  purple: "#c43dcf",
  red: "#bd413a",
  orange: "#c38424",
  black: "#242424",
};

export const STOCK_TINTS: Record<PaletteToken, string> = {
  white: "#f8f9fa",
  yellow: "#fdfde7",
  green: "#eef9f2",
  blue: "#edf4fd",
  purple: "#fcf0fe",
  red: "#fdf2f1",
  orange: "#fdf8ee",
  black: "#f2f2f2",
};

export const STOCK_LAYER_BG: Record<PaletteToken, string> = {
  white: "rgba(255, 255, 255, 0.6)",
  yellow: "rgba(211, 214, 30, 0.08)",
  green: "rgba(48, 160, 80, 0.08)",
  blue: "rgba(40, 102, 196, 0.08)",
  purple: "rgba(196, 61, 207, 0.08)",
  red: "rgba(189, 65, 58, 0.08)",
  orange: "rgba(195, 132, 36, 0.08)",
  black: "rgba(36, 36, 36, 0.05)",
};

export function resolveColor(tokenOrColor?: string, fallback = "#242424"): string {
  if (!tokenOrColor) return fallback;
  if (tokenOrColor in STOCK_PALETTE) {
    return STOCK_PALETTE[tokenOrColor as PaletteToken];
  }
  return tokenOrColor;
}

export function resolveTint(tokenOrColor?: string, fallback = "#ffffff"): string {
  if (!tokenOrColor) return fallback;
  if (tokenOrColor in STOCK_TINTS) {
    return STOCK_TINTS[tokenOrColor as PaletteToken];
  }
  return fallback;
}

export function resolveLayerBg(tokenOrColor?: string, fallback = "rgba(0,0,0,0.03)"): string {
  if (!tokenOrColor) return fallback;
  if (tokenOrColor in STOCK_LAYER_BG) {
    return STOCK_LAYER_BG[tokenOrColor as PaletteToken];
  }
  return fallback;
}
