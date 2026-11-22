// The phrases that only make sense to whoever made the material (or only this semester), found in the new texts.
import type { ReleaseText } from '@qv/schema/release';

/** Phrases that only make sense to whoever made the material, or only this semester: they warn, never block. */
export const PROCESS_RULES: readonly { id: string; label: string; pattern: RegExp }[] = [
  {
    id: 'deduced',
    label: 'cómo se dedujo algo',
    // Only of the material («se dedujo de la pauta»): «su sitio de acción se dedujo por exclusión» is content.
    pattern:
      /\bse (?:dedujo|dedujeron|infiri[óo]|infirieron) (?:de|desde|a partir de|por) (?:la|el|los|las) (?:pauta|guía|imagen|figura|foto|letra|metadatos|audio|grabación|transcripción|diapositiva)s?\b/i,
  },
  {
    id: 'copied',
    label: 'qué se copió',
    // «la cola poli-A no se copia del DNA» is content: only what was copied from a source of the material.
    pattern:
      /\b(?:no )?se copi(?:a|an|ó|aron) (?:tal cual|textual(?:mente)?|(?:de|desde) (?:la|el) (?:pauta|guía|libro|apunte|diapositiva|transcripción))\b/i,
  },
  {
    id: 'translated',
    label: 'qué se tradujo',
    // Translation of the material, not of an mRNA («la que se tradujo»).
    pattern:
      /\b(?:van|fueron|están) traducid[oa]s\b|\btraducid[oa]s? (?:aquí|del inglés|del latín)\b|\b(?:los rótulos|las leyendas|los números|la figura|las figuras) (?:se tradujo|se tradujeron)\b/i,
  },
  {
    id: 'edition',
    label: 'de qué edición es una figura',
    pattern: /\bde una edici[óo]n anterior\b/i,
  },
  {
    id: 'revision',
    label: 'una revisión o una corrección del material',
    pattern:
      /\b(?:revisi[óo]n de cero|se revis[óo] (?:el|la|este|esta)|(?:esta|la) versi[óo]n (?:anterior|nueva) del (?:apunte|art[íi]culo|test|mazo)|qu[ée] se cambi[óo])\b/i,
  },
  {
    id: 'tools',
    label: 'una herramienta con que se hizo',
    pattern: /\b(?:ChatGPT|NotebookLM|Whisper|agente (?:revisor|autor))\b/i,
  },
  {
    id: 'this-term',
    label: 'el calendario de este semestre',
    pattern: /\b(?:este|el pr[óo]ximo) (?:semestre|certamen|control)\b|\beste año\b/i,
  },
  {
    id: 'enters',
    label: 'qué entra en qué prueba',
    pattern:
      /\b(?:no )?entra(?:n)? en (?:el|este) (?:certamen|control|examen)\b|\bmateria del (?:certamen|control) \d/i,
  },
  {
    id: 'date',
    label: 'una fecha de este semestre',
    pattern:
      /\b\d{1,2}[-/]\d{1,2}[-/]20\d\d\b|\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de 20\d\d\b/i,
  },
];

export interface PhraseHit {
  key: string;
  assessmentId: string | null;
  label: string;
  rule: string;
  snippet: string;
}

export function findProcessPhrases(
  text: string,
): { rule: string; label: string; snippet: string }[] {
  const out: { rule: string; label: string; snippet: string }[] = [];
  for (const r of PROCESS_RULES) {
    const flags = `${r.pattern.flags.replace('g', '')}g`;
    for (const m of text.matchAll(new RegExp(r.pattern.source, flags))) {
      const at = m.index;
      const from = Math.max(0, at - 40);
      const to = Math.min(text.length, at + m[0].length + 40);
      out.push({
        rule: r.id,
        label: r.label,
        snippet: `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`,
      });
    }
  }
  return out;
}

export function processPhrases(texts: readonly ReleaseText[]): PhraseHit[] {
  return texts.flatMap((t) =>
    findProcessPhrases(t.text).map((h) => ({
      key: t.key,
      assessmentId: t.assessmentId,
      label: t.label,
      rule: h.rule,
      snippet: h.snippet,
    })),
  );
}
