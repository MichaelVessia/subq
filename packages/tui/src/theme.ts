// Catppuccin Mocha color palette
// https://catppuccin.com/palette

export const mocha = {
  // Base colors
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',

  // Surface colors
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',

  // Overlay colors
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  overlay2: '#9399b2',

  // Text colors
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',

  // Accent colors
  lavender: '#b4befe',
  blue: '#89b4fa',
  sapphire: '#74c7ec',
  sky: '#89dceb',
  teal: '#94e2d5',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  maroon: '#eba0ac',
  red: '#f38ba8',
  mauve: '#cba6f7',
  pink: '#f5c2e7',
  flamingo: '#f2cdcd',
  rosewater: '#f5e0dc',
} as const

// Semantic color mappings for the TUI
export const theme = {
  // Backgrounds
  bg: mocha.base,
  bgSecondary: mocha.mantle,
  bgTertiary: mocha.crust,
  bgSurface: mocha.surface0,
  bgSurfaceHover: mocha.surface1,
  bgSelected: mocha.surface2,

  // Text
  text: mocha.text,
  textMuted: mocha.subtext0,
  textSubtle: mocha.overlay1,

  // Borders
  border: mocha.surface1,
  borderFocused: mocha.lavender,

  // Accents
  accent: mocha.lavender,
  accentSecondary: mocha.mauve,

  // Status colors
  success: mocha.green,
  warning: mocha.yellow,
  error: mocha.red,
  info: mocha.blue,

  // Tab colors (for section navigation)
  tab1: mocha.blue, // Injections
  tab2: mocha.green, // Inventory
  tab3: mocha.peach, // Weight
} as const
