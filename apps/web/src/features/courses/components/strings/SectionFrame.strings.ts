// The texts of SectionFrame.

export const sectionFrameStrings = {
  home: 'Inicio',
  tabTitle: (title: string, course: string, assessment: string) =>
    `${title} · ${course} · ${assessment}`,
} as const;
