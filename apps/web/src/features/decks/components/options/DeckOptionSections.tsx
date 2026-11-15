// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The sections of a preset in «Configuración de mazos», in Anki's order, with its warnings.
import { CONFIG_RANGES, DEFAULT_CONFIG } from '@qv/srs';
import type { DeckConfig } from '@qv/srs';
import { NumberRow } from '../../../../shared/ui/form/NumberRow';
import { SelectRow } from '../../../../shared/ui/form/SelectRow';
import { StepsRow } from '../../../../shared/ui/form/StepsRow';
import { SwitchRow } from '../../../../shared/ui/form/SwitchRow';
import { GATHER, MIX, REVIEW, SORT } from '../../model/optionChoices';
import { OptionsSection as Section, Warning } from './OptionsParts';
import { ParamsRow } from './ParamsRow';

interface Props {
  config: DeckConfig;
  set: (patch: Partial<DeckConfig>) => void;
}

const steps = (s: number[]) => s.length > 0 && s.at(-1)! >= 1440;

export function DeckOptionSections(p: Props) {
  return (
    <>
      <DailyLimits {...p} />
      <NewCards {...p} />
      <Lapses {...p} />
      <DisplayOrder {...p} />
      <Fsrs {...p} />
      <Burying {...p} />
      <Timer {...p} />
      <Advanced {...p} />
    </>
  );
}

function DailyLimits({ config, set }: Props) {
  return (
    <Section title="Límites diarios">
      <NumberRow
        label="Tarjetas nuevas/día"
        value={config.newPerDay}
        range={CONFIG_RANGES.newPerDay}
        fallback={DEFAULT_CONFIG.newPerDay}
        onChange={(v) => set({ newPerDay: v })}
        help="Cuántas tarjetas nuevas se introducen como máximo en un día. Los submazos suman en el mazo de arriba."
      />
      <NumberRow
        label="Repasos máximos/día"
        value={config.reviewsPerDay}
        range={CONFIG_RANGES.reviewsPerDay}
        fallback={DEFAULT_CONFIG.reviewsPerDay}
        onChange={(v) => set({ reviewsPerDay: v })}
      />
      {Math.min(9999, config.newPerDay * 10) > config.reviewsPerDay ? (
        <Warning>
          Agregando {config.newPerDay} nuevas tarjetas cada día, su límite de revisión debe ser por
          lo menos {Math.min(9999, config.newPerDay * 10)}.
        </Warning>
      ) : null}
    </Section>
  );
}

function NewCards({ config, set }: Props) {
  return (
    <Section title="Tarjetas nuevas">
      <StepsRow
        label="Pasos en la etapa de aprendizaje"
        value={config.learnSteps}
        fallback={DEFAULT_CONFIG.learnSteps}
        onChange={(v) => set({ learnSteps: v })}
      />
      {steps(config.learnSteps) ? (
        <Warning>Cuando el FSRS está activado, no se recomiendan pasos de 1 día o más.</Warning>
      ) : null}
    </Section>
  );
}

function Lapses({ config, set }: Props) {
  return (
    <Section title="Olvidos">
      <StepsRow
        label="Pasos de reaprendizaje"
        value={config.relearnSteps}
        fallback={DEFAULT_CONFIG.relearnSteps}
        onChange={(v) => set({ relearnSteps: v })}
      />
      {steps(config.relearnSteps) ? (
        <Warning>Cuando el FSRS está activado, no se recomiendan pasos de 1 día o más.</Warning>
      ) : null}
      <NumberRow
        label="Umbral para olvidadas"
        value={config.leechThreshold}
        range={CONFIG_RANGES.leechThreshold}
        fallback={DEFAULT_CONFIG.leechThreshold}
        onChange={(v) => set({ leechThreshold: v })}
        help="Cuántas veces hay que presionar «Otra vez» en una tarjeta de repaso para que quede marcada como sanguijuela."
      />
      <SelectRow
        label="Acción para olvidadas"
        value={config.leechAction}
        fallback={DEFAULT_CONFIG.leechAction}
        choices={[
          ['suspend', 'Suspender tarjeta'],
          ['tagOnly', 'Solo etiquetar'],
        ]}
        onChange={(v) => set({ leechAction: v })}
      />
    </Section>
  );
}

function DisplayOrder({ config, set }: Props) {
  return (
    <Section title="Orden de visualización">
      <SelectRow
        label="Nuevo orden de recolección de tarjetas"
        value={config.newCardGatherPriority}
        fallback={DEFAULT_CONFIG.newCardGatherPriority}
        choices={GATHER}
        onChange={(v) => set({ newCardGatherPriority: v })}
      />
      <SelectRow
        label="Nuevo orden de clasificación de tarjetas"
        value={config.newCardSortOrder}
        fallback={DEFAULT_CONFIG.newCardSortOrder}
        choices={SORT}
        onChange={(v) => set({ newCardSortOrder: v })}
      />
      <SelectRow
        label="Nuevos/revisiones (orden de estudio)"
        value={config.newMix}
        fallback={DEFAULT_CONFIG.newMix}
        choices={MIX}
        onChange={(v) => set({ newMix: v })}
      />
      <SelectRow
        label="Aprendizaje entre días/revisiones (orden de estudio)"
        value={config.interdayLearningMix}
        fallback={DEFAULT_CONFIG.interdayLearningMix}
        choices={MIX}
        onChange={(v) => set({ interdayLearningMix: v })}
      />
      <SelectRow
        label="Revisar orden de clasificación"
        value={config.reviewOrder}
        fallback={DEFAULT_CONFIG.reviewOrder}
        choices={REVIEW}
        onChange={(v) => set({ reviewOrder: v })}
      />
    </Section>
  );
}

function Fsrs({ config, set }: Props) {
  return (
    <Section title="FSRS">
      <NumberRow
        label="Retención deseada"
        value={config.desiredRetention}
        range={CONFIG_RANGES.desiredRetention}
        fallback={DEFAULT_CONFIG.desiredRetention}
        step={0.01}
        onChange={(v) => set({ desiredRetention: v })}
        help="La probabilidad de recordar una tarjeta cuando le toca el repaso. Más alta: más repasos."
      />
      <ParamsRow value={config.fsrsParams} />
    </Section>
  );
}

function Burying({ config, set }: Props) {
  return (
    <Section title="Enterrar">
      <SwitchRow
        label="Enterrar tarjetas hermanas nuevas (de la nota) hasta el día siguiente."
        value={config.buryNew}
        fallback={DEFAULT_CONFIG.buryNew}
        onChange={(v) => set({ buryNew: v })}
      />
      <SwitchRow
        label="Enterrar tarjetas hermanas (de la nota)."
        value={config.buryReviews}
        fallback={DEFAULT_CONFIG.buryReviews}
        onChange={(v) => set({ buryReviews: v })}
      />
      <SwitchRow
        label="Enterrar a las tarjetas hermanas (de la nota) de aprendizaje entre días."
        value={config.buryInterdayLearning}
        fallback={DEFAULT_CONFIG.buryInterdayLearning}
        onChange={(v) => set({ buryInterdayLearning: v })}
      />
    </Section>
  );
}

function Timer({ config, set }: Props) {
  return (
    <Section title="Temporizador">
      <NumberRow
        label="Tiempo máximo de respuesta en segundos"
        value={config.capAnswerTimeToSecs}
        range={CONFIG_RANGES.capAnswerTimeToSecs}
        fallback={DEFAULT_CONFIG.capAnswerTimeToSecs}
        onChange={(v) => set({ capAnswerTimeToSecs: v })}
        help="El tiempo que se guarda de cada respuesta no pasa de este máximo."
      />
    </Section>
  );
}

function Advanced({ config, set }: Props) {
  return (
    <Section title="Avanzado">
      <NumberRow
        label="Intervalo máximo"
        value={config.maximumReviewInterval}
        range={CONFIG_RANGES.maximumReviewInterval}
        fallback={DEFAULT_CONFIG.maximumReviewInterval}
        onChange={(v) => set({ maximumReviewInterval: v })}
        help="En días: ninguna tarjeta se programa más lejos."
      />
      {config.maximumReviewInterval < 180 ? (
        <Warning>Un intervalo máximo de menos de 6 meses no es recomendable.</Warning>
      ) : null}
    </Section>
  );
}
