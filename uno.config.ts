import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
} from 'unocss'
import transformerDirectives from '@unocss/transformer-directives'

export default defineConfig({
  // Tema personalizado con los nuevos colores y fuentes
  theme: {
    fontFamily: {
      'fira': ['Fira Mono', 'Consolas', 'Menlo', 'monospace'],
      'victor': ['Victor Mono', 'monospace'],
      'jetbrains': ['JetBrains Mono', 'monospace'],
    },
    colors: {
      'brand': {
        'green': '#66cc33', // Verde principal
        'green-light': '#99ff33', // Verde para hover/activo
      },
      'dark': {
        'main': '#222', // Fondo principal
        'light': '#2a2a2a', // Fondo de selectores
        'lighter': '#232323', // Fondo de botones
      },
      'light': {
        'main': '#fff', // Texto blanco
        'muted': '#b6b6b6', // Etiquetas grises
      },
      'accent': {
        'orange': '#f97316',
        'yellow': '#F39C12',
        'red': '#C0392B',
        'red-dark': '#A93226',
      },
      'interactive': {
        'blue': '#418dcc',
        'blue-hover': '#367bbd',
      },
      'indigo': '#4f46e5',
      'grey': '#3A3A3A',
      'bg-card': '#2a2a2a',
      'text-main': '#fff',
    },
    // Añadimos el efecto de brillo para el texto
    textShadow: {
      'glow': '0 0 6px rgba(153, 255, 51, 0.6)',
    },
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
})
