import type { PaletteToken } from "./types";

export const STOCK_PALETTE: Record<PaletteToken, string> = {
  white: "#64748b",
  yellow: "#d97706",
  green: "#059669",
  blue: "#2563eb",
  purple: "#7c3aed",
  red: "#e11d48",
  orange: "#ea580c",
  black: "#334155",
};

export const STOCK_TINTS: Record<PaletteToken, string> = {
  white: "#ffffff",
  yellow: "#fffbeb",
  green: "#ecfdf5",
  blue: "#f0f7ff",
  purple: "#f5f3ff",
  red: "#fff1f2",
  orange: "#fff7ed",
  black: "#f8fafc",
};

export const STOCK_DARK_TINTS: Record<PaletteToken, string> = {
  white: "#18181b",
  yellow: "rgba(217, 119, 6, 0.14)",
  green: "rgba(5, 150, 105, 0.14)",
  blue: "rgba(37, 99, 235, 0.14)",
  purple: "rgba(124, 58, 237, 0.14)",
  red: "rgba(225, 29, 72, 0.14)",
  orange: "rgba(234, 88, 12, 0.14)",
  black: "#18181b",
};

export const STOCK_LAYER_BG: Record<PaletteToken, string> = {
  white: "rgba(255, 255, 255, 0.6)",
  yellow: "rgba(217, 119, 6, 0.05)",
  green: "rgba(5, 150, 105, 0.05)",
  blue: "rgba(37, 99, 235, 0.05)",
  purple: "rgba(124, 58, 237, 0.05)",
  red: "rgba(225, 29, 72, 0.05)",
  orange: "rgba(234, 88, 12, 0.05)",
  black: "rgba(51, 65, 85, 0.04)",
};

export const STOCK_DARK_LAYER_BG: Record<PaletteToken, string> = {
  white: "rgba(24, 24, 27, 0.6)",
  yellow: "rgba(217, 119, 6, 0.08)",
  green: "rgba(5, 150, 105, 0.08)",
  blue: "rgba(37, 99, 235, 0.08)",
  purple: "rgba(124, 58, 237, 0.08)",
  red: "rgba(225, 29, 72, 0.08)",
  orange: "rgba(234, 88, 12, 0.08)",
  black: "rgba(24, 24, 27, 0.7)",
};

export function resolveColor(tokenOrColor?: string, fallback = "#2563eb"): string {
  if (!tokenOrColor) return fallback;
  if (tokenOrColor in STOCK_PALETTE) {
    return STOCK_PALETTE[tokenOrColor as PaletteToken];
  }
  return tokenOrColor;
}

export function resolveTint(tokenOrColor?: string, fallback = "#ffffff", isDark = false): string {
  if (!tokenOrColor) return isDark ? "#18181b" : fallback;
  if (isDark && tokenOrColor in STOCK_DARK_TINTS) {
    return STOCK_DARK_TINTS[tokenOrColor as PaletteToken];
  }
  if (tokenOrColor in STOCK_TINTS) {
    return STOCK_TINTS[tokenOrColor as PaletteToken];
  }
  return fallback;
}

export function resolveLayerBg(tokenOrColor?: string, fallback = "rgba(0,0,0,0.03)", isDark = false): string {
  if (!tokenOrColor) return fallback;
  if (isDark && tokenOrColor in STOCK_DARK_LAYER_BG) {
    return STOCK_DARK_LAYER_BG[tokenOrColor as PaletteToken];
  }
  if (tokenOrColor in STOCK_LAYER_BG) {
    return STOCK_LAYER_BG[tokenOrColor as PaletteToken];
  }
  return fallback;
}
