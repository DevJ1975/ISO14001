/* ────────────────────────────────────────────────────────────
 * TRAINOVATE — Tailwind CSS Config (Angular integration)
 * Tokens + brand utilities for the ISO 45001 auditor's tool.
 * Preflight is disabled so Tailwind's reset does not fight Angular
 * Material or the existing component CSS; brand styling is applied
 * through CSS variables in src/styles.css and these utilities.
 * ──────────────────────────────────────────────────────────── */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],

  // Avoid clobbering Angular Material + existing global styles.
  corePlugins: { preflight: false },

  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',

      // Brand
      ink: '#0A0A0A',
      bone: '#F4F1EA',
      signal: '#FF3B30',

      cobalt: {
        DEFAULT: '#0046E6',
        50: '#F2F5FE',
        100: '#E5EBFC',
        200: '#C2CFF8',
        300: '#6A8FF0',
        400: '#3366EB',
        500: '#0046E6',
        600: '#003ECC',
        700: '#0036B5',
        800: '#002A8C',
        900: '#001E63',
      },

      neutral: {
        50: '#FAFAFA',
        100: '#F4F4F4',
        200: '#E5E5E5',
        300: '#D4D4D4',
        400: '#A3A3A3',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#171717',
        950: '#0A0A0A',
      },
    },

    fontFamily: {
      sans: ['"Inter Tight"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      display: ['"Inter Tight"', 'sans-serif'],
    },

    fontSize: {
      xs: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.06em' }],
      sm: ['0.8125rem', { lineHeight: '1.5' }],
      base: ['1rem', { lineHeight: '1.5' }],
      md: ['1.125rem', { lineHeight: '1.5' }],
      lg: ['1.5rem', { lineHeight: '1.2' }],
      xl: ['2rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
      '2xl': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      '3xl': ['4rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
      '4xl': ['5.5rem', { lineHeight: '1.0', letterSpacing: '-0.03em' }],
    },

    letterSpacing: {
      tighter: '-0.03em',
      tight: '-0.025em',
      snug: '-0.015em',
      normal: '0',
      wide: '0.04em',
      wider: '0.08em',
      widest: '0.16em',
    },

    extend: {
      borderRadius: {
        DEFAULT: '6px',
        sm: '3px',
        md: '10px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(10,10,10,0.06)',
        DEFAULT: '0 4px 12px rgba(10,10,10,0.08), 0 1px 2px rgba(10,10,10,0.04)',
        md: '0 12px 32px -8px rgba(10,10,10,0.14), 0 4px 8px rgba(10,10,10,0.04)',
        lg: '0 24px 48px -16px rgba(10,10,10,0.18), 0 8px 16px rgba(10,10,10,0.06)',
        cobalt: '0 8px 32px -8px rgba(0,70,230,0.35)',
        focus: '0 0 0 3px rgba(0,70,230,0.15)',
      },
      transitionTimingFunction: {
        emphasis: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '220ms',
        slow: '400ms',
      },
      maxWidth: {
        container: '1180px',
        'container-sm': '720px',
        'container-lg': '1440px',
      },
    },
  },

  plugins: [
    function ({ addBase, addComponents, theme }) {
      addBase({
        html: { fontFeatureSettings: '"cv11", "ss01"' },
        ':focus-visible': {
          outline: `2px solid ${theme('colors.cobalt.500')}`,
          outlineOffset: '2px',
        },
      });

      addComponents({
        '.btn': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme('spacing.2'),
          height: '44px',
          paddingLeft: theme('spacing.5'),
          paddingRight: theme('spacing.5'),
          fontWeight: '600',
          borderRadius: theme('borderRadius.DEFAULT'),
          transition: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
        },
        '.btn-primary': {
          backgroundColor: theme('colors.ink'),
          color: theme('colors.white'),
          '&:hover': { backgroundColor: theme('colors.cobalt.500') },
        },
        '.btn-cobalt': {
          backgroundColor: theme('colors.cobalt.500'),
          color: theme('colors.white'),
          '&:hover': { backgroundColor: theme('colors.cobalt.700') },
        },
        '.btn-secondary': {
          backgroundColor: 'transparent',
          color: theme('colors.ink'),
          border: `1px solid rgba(10,10,10,0.20)`,
          '&:hover': {
            backgroundColor: theme('colors.ink'),
            color: theme('colors.bone'),
          },
        },
        '.eyebrow': {
          fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          fontSize: theme('fontSize.xs')[0],
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'rgba(10,10,10,0.55)',
        },
        '.card': {
          backgroundColor: theme('colors.white'),
          border: '1px solid rgba(10,10,10,0.10)',
          borderRadius: theme('borderRadius.DEFAULT'),
          padding: theme('spacing.6'),
        },
        '.badge': {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          height: '22px',
          fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          fontSize: theme('fontSize.xs')[0],
          fontWeight: '500',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          border: '1px solid rgba(10,10,10,0.10)',
          borderRadius: theme('borderRadius.sm'),
          color: 'rgba(10,10,10,0.55)',
        },
      });
    },
  ],
};
