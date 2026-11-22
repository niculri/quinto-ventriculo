// The color palettes of a test («tema» of the skill) and the custom ones a test.json can bring.
import type { QuizTheme } from '@qv/schema';

/** The skill's «tema» values with their palettes. */
export const QUIZ_THEMES: Record<string, QuizTheme> = {
  azul: {
    light: {
      ac: '#2E5C7E',
      'ac-b': '#D9E6EF',
      ac2: '#C9930A',
      'ac2-b': '#F7ECCF',
      'on-ac': '#FFFFFF',
      g1: '#2E5C7E',
      g2: '#E8B800',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#7EB2D4',
      'ac-b': '#1E3242',
      ac2: '#E3B64A',
      'ac2-b': '#3A2F16',
      'on-ac': '#0E1720',
      g1: '#6FA3C7',
      g2: '#E3B64A',
      g3: '#5CC3A0',
    },
  },
  teal: {
    light: {
      ac: '#1F6F75',
      'ac-b': '#D5EAEB',
      ac2: '#B8621F',
      'ac2-b': '#F6E3D2',
      'on-ac': '#FFFFFF',
      g1: '#1F6F75',
      g2: '#E08A3C',
      g3: '#5B6FB5',
    },
    dark: {
      ac: '#6CC3C8',
      'ac-b': '#163338',
      ac2: '#EBA06A',
      'ac2-b': '#3A2718',
      'on-ac': '#0E1720',
      g1: '#5DB8BD',
      g2: '#EBA06A',
      g3: '#93A3E0',
    },
  },
  morado: {
    light: {
      ac: '#5B4B9A',
      'ac-b': '#E4E0F3',
      ac2: '#B7791F',
      'ac2-b': '#F5E8D2',
      'on-ac': '#FFFFFF',
      g1: '#5B4B9A',
      g2: '#E0A030',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#AFA2E6',
      'ac-b': '#29243F',
      ac2: '#E6B062',
      'ac2-b': '#3A2D16',
      'on-ac': '#0E1720',
      g1: '#9D8FDB',
      g2: '#E6B062',
      g3: '#5CC3A0',
    },
  },
  bronce: {
    light: {
      ac: '#8A5A14',
      'ac-b': '#F3E6D0',
      ac2: '#2E5C7E',
      'ac2-b': '#D9E6EF',
      'on-ac': '#FFFFFF',
      g1: '#A86F1A',
      g2: '#2E5C7E',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#E0B060',
      'ac-b': '#372A14',
      ac2: '#7EB2D4',
      'ac2-b': '#1E3242',
      'on-ac': '#0E1720',
      g1: '#E0B060',
      g2: '#7EB2D4',
      g3: '#5CC3A0',
    },
  },
};

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

/** `{"claro": {…}, "oscuro": {…}}` with only the tokens that differ from «azul». */
export function customTheme(t: unknown): QuizTheme {
  const mode = isRecord(t) ? t : {};
  const tokens = (x: unknown) => (isRecord(x) ? x : {});
  return {
    light: { ...QUIZ_THEMES.azul!.light, ...tokens(mode.claro) },
    dark: { ...QUIZ_THEMES.azul!.dark, ...tokens(mode.oscuro) },
  };
}
