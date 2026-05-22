import type { BrandingResponse } from "@api/branding";

export type BrandingLike = Pick<
  BrandingResponse,
  "accent_color" | "color_palette"
> & {
  primary_color?: string | null;
};

const normalizeHex = (value?: string | null): string | null => {
  if (!value) return null;
  let hex = value.trim();
  if (!hex) return null;
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (hex.length !== 7) return null;
  return hex.toLowerCase();
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
};

const toHex = (value: number) => value.toString(16).padStart(2, "0");

const rgbToHex = (r: number, g: number, b: number) =>
  `#${toHex(r)}${toHex(g)}${toHex(b)}`;

const mix = (
  color: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  amount: number,
) => {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return rgbToHex(
    clamp(color.r + (target.r - color.r) * amount),
    clamp(color.g + (target.g - color.g) * amount),
    clamp(color.b + (target.b - color.b) * amount),
  );
};

const generateScale = (baseHex: string) => {
  const base = hexToRgb(baseHex);
  if (!base) return null;
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return {
    50: mix(base, white, 0.92),
    100: mix(base, white, 0.84),
    200: mix(base, white, 0.68),
    300: mix(base, white, 0.52),
    400: mix(base, white, 0.28),
    500: rgbToHex(base.r, base.g, base.b),
    600: mix(base, black, 0.12),
    700: mix(base, black, 0.28),
    800: mix(base, black, 0.44),
    900: mix(base, black, 0.6),
  } as Record<string, string>;
};

const resolveBaseColor = (branding?: BrandingLike | null) => {
  return (
    branding?.primary_color ??
    branding?.accent_color ??
    branding?.color_palette?.["500"] ??
    branding?.color_palette?.["600"] ??
    null
  );
};

export const buildThemeFromBranding = (branding?: BrandingLike | null) => {
  if (!branding) return {};
  const baseColor = resolveBaseColor(branding);
  const generated = baseColor ? generateScale(baseColor) : null;
  const palette = generated
    ? { ...generated, ...(branding.color_palette ?? {}) }
    : branding.color_palette ?? undefined;

  if (!palette) return {};

  return {
    colors: {
      brand: palette,
      green: palette,
    },
  };
};
