import { extendTheme, ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "light",
  useSystemColorMode: false,
};

// Paleta original respetada — solo se afinan los extremos
const defaultBrand = {
  50: "#e3f6ec",
  100: "#b8e4cc",
  200: "#8dd3ad",
  300: "#62c18e",
  400: "#37b06f",
  500: "#00662b", // color principal urdecon
  600: "#005024",
  700: "#003a1b",
  800: "#002413",
  900: "#000e08",
};

// Sistema de sombras más refinado y moderno
const shadows = {
  xs: "0 1px 2px 0 rgba(0, 102, 43, 0.05)",
  sm: "0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -4px rgba(0, 0, 0, 0.04)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
  brand:
    "0 4px 14px 0 rgba(0, 102, 43, 0.25), 0 1px 3px 0 rgba(0, 102, 43, 0.12)",
  "brand-sm": "0 2px 8px 0 rgba(0, 102, 43, 0.18)",
  inset: "inset 0 1px 3px 0 rgba(0, 0, 0, 0.08)",
};

const components = {
  Button: {
    baseStyle: {
      borderRadius: "7px",
      fontWeight: "600",
      letterSpacing: "0.01em",
      transition: "all 0.18s ease",
      _focusVisible: {
        outline: "2px solid",
        outlineColor: "brand.400",
        outlineOffset: "2px",
      },
    },
    sizes: {
      xs: {
        fontSize: "xs",
        h: "7",
        px: "3",
      },
      sm: {
        fontSize: "sm",
        h: "9",
        px: "4",
      },
      md: {
        fontSize: "sm",
        h: "10",
        px: "5",
      },
      lg: {
        fontSize: "md",
        h: "12",
        px: "6",
      },
    },
    variants: {
      solid: {
        bg: "brand.500",
        color: "white",
        boxShadow: "brand-sm",
        _hover: {
          bg: "brand.600",
          boxShadow: "brand",
          transform: "translateY(-1px)",
          _disabled: { transform: "none", boxShadow: "none" },
        },
        _active: {
          bg: "brand.700",
          transform: "translateY(0)",
          boxShadow: "none",
        },
      },
      ghost: {
        color: "gray.700",
        _hover: {
          bg: "gray.50",
          color: "gray.900",
        },
        _active: {
          bg: "gray.100",
        },
      },
      outline: {
        borderColor: "brand.500",
        borderWidth: "1.5px",
        color: "brand.600",
        _hover: {
          bg: "brand.50",
          borderColor: "brand.600",
        },
        _active: {
          bg: "brand.100",
        },
      },
      // Nueva variante: superficie neutra con acento
      subtle: {
        bg: "brand.50",
        color: "brand.700",
        _hover: {
          bg: "brand.100",
        },
        _active: {
          bg: "brand.200",
        },
      },
      // Nueva variante: peligro / secundario destructivo
      danger: {
        bg: "red.500",
        color: "white",
        _hover: {
          bg: "red.600",
          transform: "translateY(-1px)",
        },
        _active: {
          bg: "red.700",
          transform: "translateY(0)",
        },
      },
    },
    defaultProps: {
      variant: "solid",
      size: "md",
    },
  },

  Input: {
    baseStyle: {
      field: {
        transition: "all 0.15s ease",
        _placeholder: {
          color: "gray.400",
          fontSize: "sm",
        },
      },
    },
    sizes: {
      sm: {
        field: {
          h: "9",
          borderRadius: "7px",
          fontSize: "sm",
        },
      },
      md: {
        field: {
          h: "10",
          borderRadius: "7px",
          fontSize: "sm",
        },
      },
    },
    variants: {
      outline: {
        field: {
          borderColor: "gray.200",
          bg: "white",
          boxShadow: "inset",
          _hover: {
            borderColor: "gray.300",
          },
          _focus: {
            borderColor: "brand.400",
            boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.12)",
          },
          _invalid: {
            borderColor: "red.400",
            boxShadow: "0 0 0 3px rgba(229, 62, 62, 0.10)",
          },
        },
      },
      filled: {
        field: {
          bg: "gray.50",
          borderColor: "transparent",
          _hover: {
            bg: "gray.100",
          },
          _focus: {
            bg: "white",
            borderColor: "brand.400",
            boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.12)",
          },
        },
      },
    },
    defaultProps: {
      size: "sm",
      variant: "outline",
    },
  },

  Select: {
    baseStyle: {
      field: {
        transition: "all 0.15s ease",
      },
    },
    sizes: {
      sm: {
        field: {
          h: "9",
          borderRadius: "7px",
          fontSize: "sm",
        },
        icon: {
          color: "gray.500",
        },
      },
      md: {
        field: {
          h: "10",
          borderRadius: "7px",
          fontSize: "sm",
        },
      },
    },
    variants: {
      outline: {
        field: {
          borderColor: "gray.200",
          bg: "white",
          boxShadow: "inset",
          _hover: {
            borderColor: "gray.300",
          },
          _focus: {
            borderColor: "brand.400",
            boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.12)",
          },
        },
      },
    },
    defaultProps: {
      size: "sm",
      variant: "outline",
    },
  },

  Textarea: {
    baseStyle: {
      borderRadius: "7px",
      transition: "all 0.15s ease",
      _placeholder: {
        color: "gray.400",
        fontSize: "sm",
      },
    },
    variants: {
      outline: {
        borderColor: "gray.200",
        boxShadow: "inset",
        _hover: {
          borderColor: "gray.300",
        },
        _focus: {
          borderColor: "brand.400",
          boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.12)",
        },
      },
    },
    defaultProps: {
      size: "sm",
      variant: "outline",
    },
  },

  Card: {
    baseStyle: {
      container: {
        borderRadius: "10px",
        boxShadow: "sm",
        borderWidth: "1px",
        borderColor: "gray.100",
        bg: "white",
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
      },
      header: {
        px: "6",
        pt: "5",
        pb: "3",
      },
      body: {
        px: "6",
        py: "4",
      },
      footer: {
        px: "6",
        pb: "5",
        pt: "3",
        borderTopWidth: "1px",
        borderColor: "gray.100",
      },
    },
    variants: {
      elevated: {
        container: {
          boxShadow: "md",
          borderWidth: "0",
          _hover: {
            boxShadow: "lg",
          },
        },
      },
      outline: {
        container: {
          boxShadow: "none",
          borderWidth: "1.5px",
          borderColor: "gray.200",
        },
      },
      filled: {
        container: {
          boxShadow: "none",
          borderWidth: "0",
          bg: "gray.50",
        },
      },
    },
    defaultProps: {
      variant: "outline",
    },
  },

  Badge: {
    baseStyle: {
      borderRadius: "5px",
      fontWeight: "600",
      letterSpacing: "0.02em",
      px: "2.5",
      py: "0.5",
      fontSize: "xs",
    },
    variants: {
      solid: {
        bg: "brand.500",
        color: "white",
      },
      subtle: {
        bg: "brand.50",
        color: "brand.700",
      },
      outline: {
        boxShadow: "inset 0 0 0 1.5px",
        color: "brand.600",
      },
    },
  },

  Table: {
    variants: {
      simple: {
        th: {
          fontSize: "xs",
          fontWeight: "600",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "gray.500",
          borderColor: "gray.100",
          bg: "gray.50",
          py: "3",
        },
        td: {
          fontSize: "sm",
          borderColor: "gray.100",
          py: "3.5",
        },
        tbody: {
          tr: {
            _hover: {
              bg: "gray.50",
              transition: "background 0.12s ease",
            },
          },
        },
      },
    },
  },

  Tabs: {
    variants: {
      line: {
        tab: {
          fontWeight: "500",
          fontSize: "sm",
          color: "gray.500",
          _selected: {
            color: "brand.600",
            fontWeight: "600",
            borderColor: "brand.500",
          },
          _hover: {
            color: "gray.700",
          },
        },
      },
      "soft-rounded": {
        tab: {
          borderRadius: "7px",
          fontWeight: "500",
          fontSize: "sm",
          color: "gray.500",
          _selected: {
            bg: "brand.50",
            color: "brand.700",
            fontWeight: "600",
          },
        },
      },
    },
  },

  Checkbox: {
    baseStyle: {
      control: {
        borderRadius: "4px",
        borderColor: "gray.300",
        _checked: {
          bg: "brand.500",
          borderColor: "brand.500",
          _hover: {
            bg: "brand.600",
            borderColor: "brand.600",
          },
        },
        _focusVisible: {
          boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.18)",
        },
      },
    },
  },

  Switch: {
    baseStyle: {
      track: {
        _checked: {
          bg: "brand.500",
        },
        _focusVisible: {
          boxShadow: "0 0 0 3px rgba(0, 102, 43, 0.18)",
        },
      },
    },
  },

  Modal: {
    baseStyle: {
      dialog: {
        borderRadius: "12px",
        boxShadow: "xl",
      },
      header: {
        fontSize: "lg",
        fontWeight: "600",
        pb: "2",
      },
      footer: {
        borderTopWidth: "1px",
        borderColor: "gray.100",
        pt: "4",
      },
      overlay: {
        backdropFilter: "blur(4px)",
        bg: "blackAlpha.400",
      },
    },
  },

  Tooltip: {
    baseStyle: {
      bg: "gray.900",
      color: "white",
      fontSize: "xs",
      fontWeight: "500",
      borderRadius: "6px",
      px: "3",
      py: "1.5",
      boxShadow: "lg",
    },
  },

  Alert: {
    baseStyle: {
      container: {
        borderRadius: "8px",
        px: "4",
        py: "3",
        alignItems: "flex-start",
      },
    },
    variants: {
      subtle: {
        container: {
          // info / default usa azul neutro, success usa brand
        },
      },
    },
  },

  Divider: {
    baseStyle: {
      borderColor: "gray.100",
    },
  },

  Menu: {
    baseStyle: {
      list: {
        borderRadius: "9px",
        boxShadow: "lg",
        borderColor: "gray.100",
        py: "1.5",
        minW: "180px",
      },
      item: {
        fontSize: "sm",
        fontWeight: "400",
        px: "3",
        py: "2",
        borderRadius: "6px",
        mx: "1",
        w: "calc(100% - 8px)",
        _hover: {
          bg: "gray.50",
        },
        _focus: {
          bg: "gray.50",
        },
      },
      groupTitle: {
        fontSize: "xs",
        fontWeight: "600",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "gray.400",
        px: "4",
        pt: "2",
        pb: "1",
      },
    },
  },

  FormLabel: {
    baseStyle: {
      fontSize: "sm",
      fontWeight: "500",
      color: "gray.700",
      mb: "1.5",
    },
  },

  FormError: {
    baseStyle: {
      text: {
        fontSize: "xs",
        color: "red.500",
        mt: "1",
      },
    },
  },

  Heading: {
    baseStyle: {
      fontWeight: "700",
      letterSpacing: "-0.02em",
      color: "gray.900",
    },
  },
};

export const buildTheme = (brandPalette?: Record<string, string>) =>
  extendTheme({
    config,
    colors: {
      brand: {
        ...defaultBrand,
        ...(brandPalette ?? {}),
      },
      green: {
        ...defaultBrand,
        ...(brandPalette ?? {}),
      },
    },
    semanticTokens: {
      colors: {
        "bg.canvas": {
          default: "gray.50",
          _dark: "gray.900",
        },
        "bg.surface": {
          default: "white",
          _dark: "gray.800",
        },
        "border.subtle": {
          default: "gray.200",
          _dark: "whiteAlpha.200",
        },
        "text.muted": {
          default: "gray.500",
          _dark: "gray.400",
        },
      },
    },
    shadows,
    components,
    fonts: {
      heading: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
      body: "'IBM Plex Sans', 'Space Grotesk', sans-serif",
    },
    fontSizes: {
      xs: "0.75rem",
      sm: "0.8125rem", // 13px — más refinado que 14px
      md: "0.9375rem", // 15px
      lg: "1.0625rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
    },
    space: {
      // Escala de espaciado sin cambios, pero documentada
    },
    radii: {
      // Escala coherente con los componentes
      none: "0",
      sm: "4px",
      md: "7px",
      lg: "10px",
      xl: "14px",
      "2xl": "18px",
      full: "9999px",
    },
    styles: {
      global: {
        "*, *::before, *::after": {
          borderColor: "gray.100",
        },
        body: {
          bg: "bg.canvas",
          color: "gray.800",
          lineHeight: "1.6",
          fontSize: "sm",
          fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        "h1, h2, h3, h4, h5, h6": {
          letterSpacing: "-0.02em",
        },
        // Scrollbar discreta
        "::-webkit-scrollbar": {
          width: "6px",
          height: "6px",
        },
        "::-webkit-scrollbar-track": {
          bg: "transparent",
        },
        "::-webkit-scrollbar-thumb": {
          bg: "gray.200",
          borderRadius: "full",
          _hover: {
            bg: "gray.300",
          },
        },
      },
    },
  });

export const theme = buildTheme();
