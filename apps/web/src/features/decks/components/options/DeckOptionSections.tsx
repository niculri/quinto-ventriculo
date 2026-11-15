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
import {
  GATHER_ORDER,
  LEECH_ORDER,
  MIX_ORDER,
  REVIEW_ORDER,
  SORT_ORDER,
} from '../../model/optionChoices';
import { OptionsSection as Section, Warning } from './OptionsParts';
import { ParamsRow } from './ParamsRow';
import { optionsStrings } from '../../options.strings';

interface Props {
  config: DeckConfig;
  set: (patch: Partial<DeckConfig>) => void;
}

const o = optionsStrings;
const t = o.sections;
const labelled = <T extends string>(order: readonly T[], labels: Record<T, string>) =>
  order.map((v) => [v, labels[v]] as const);
const LEECH = labelled(LEECH_ORDER, o.leech);
const GATHER = labelled(GATHER_ORDER, o.gather);
const SORT = labelled(SORT_ORDER, o.sort);
const REVIEW = labelled(REVIEW_ORDER, o.review);
const MIX = labelled(MIX_ORDER, o.mix);

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
    <Section title={t.daily}>
      <NumberRow
        label={t.newPerDay}
        value={config.newPerDay}
        range={CONFIG_RANGES.newPerDay}
        fallback={DEFAULT_CONFIG.newPerDay}
        onChange={(v) => set({ newPerDay: v })}
        help={t.newPerDayHelp}
      />
      <NumberRow
        label={t.reviewsPerDay}
        value={config.reviewsPerDay}
        range={CONFIG_RANGES.reviewsPerDay}
        fallback={DEFAULT_CONFIG.reviewsPerDay}
        onChange={(v) => set({ reviewsPerDay: v })}
      />
      {Math.min(9999, config.newPerDay * 10) > config.reviewsPerDay ? (
        <Warning>
          {t.reviewsTooLow(config.newPerDay, Math.min(9999, config.newPerDay * 10))}
        </Warning>
      ) : null}
    </Section>
  );
}

function NewCards({ config, set }: Props) {
  return (
    <Section title={t.newCards}>
      <StepsRow
        label={t.learnSteps}
        value={config.learnSteps}
        fallback={DEFAULT_CONFIG.learnSteps}
        onChange={(v) => set({ learnSteps: v })}
      />
      {steps(config.learnSteps) ? <Warning>{t.longSteps}</Warning> : null}
    </Section>
  );
}

function Lapses({ config, set }: Props) {
  return (
    <Section title={t.lapses}>
      <StepsRow
        label={t.relearnSteps}
        value={config.relearnSteps}
        fallback={DEFAULT_CONFIG.relearnSteps}
        onChange={(v) => set({ relearnSteps: v })}
      />
      {steps(config.relearnSteps) ? <Warning>{t.longSteps}</Warning> : null}
      <NumberRow
        label={t.leechThreshold}
        value={config.leechThreshold}
        range={CONFIG_RANGES.leechThreshold}
        fallback={DEFAULT_CONFIG.leechThreshold}
        onChange={(v) => set({ leechThreshold: v })}
        help={t.leechThresholdHelp}
      />
      <SelectRow
        label={t.leechAction}
        value={config.leechAction}
        fallback={DEFAULT_CONFIG.leechAction}
        choices={LEECH}
        onChange={(v) => set({ leechAction: v })}
      />
    </Section>
  );
}

function DisplayOrder({ config, set }: Props) {
  return (
    <Section title={t.order}>
      <SelectRow
        label={t.gather}
        value={config.newCardGatherPriority}
        fallback={DEFAULT_CONFIG.newCardGatherPriority}
        choices={GATHER}
        onChange={(v) => set({ newCardGatherPriority: v })}
      />
      <SelectRow
        label={t.sort}
        value={config.newCardSortOrder}
        fallback={DEFAULT_CONFIG.newCardSortOrder}
        choices={SORT}
        onChange={(v) => set({ newCardSortOrder: v })}
      />
      <SelectRow
        label={t.newMix}
        value={config.newMix}
        fallback={DEFAULT_CONFIG.newMix}
        choices={MIX}
        onChange={(v) => set({ newMix: v })}
      />
      <SelectRow
        label={t.interdayMix}
        value={config.interdayLearningMix}
        fallback={DEFAULT_CONFIG.interdayLearningMix}
        choices={MIX}
        onChange={(v) => set({ interdayLearningMix: v })}
      />
      <SelectRow
        label={t.reviewOrder}
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
    <Section title={t.fsrs}>
      <NumberRow
        label={t.retention}
        value={config.desiredRetention}
        range={CONFIG_RANGES.desiredRetention}
        fallback={DEFAULT_CONFIG.desiredRetention}
        step={0.01}
        onChange={(v) => set({ desiredRetention: v })}
        help={t.retentionHelp}
      />
      <ParamsRow value={config.fsrsParams} />
    </Section>
  );
}

function Burying({ config, set }: Props) {
  return (
    <Section title={t.burying}>
      <SwitchRow
        label={t.buryNew}
        value={config.buryNew}
        fallback={DEFAULT_CONFIG.buryNew}
        onChange={(v) => set({ buryNew: v })}
      />
      <SwitchRow
        label={t.buryReviews}
        value={config.buryReviews}
        fallback={DEFAULT_CONFIG.buryReviews}
        onChange={(v) => set({ buryReviews: v })}
      />
      <SwitchRow
        label={t.buryInterday}
        value={config.buryInterdayLearning}
        fallback={DEFAULT_CONFIG.buryInterdayLearning}
        onChange={(v) => set({ buryInterdayLearning: v })}
      />
    </Section>
  );
}

function Timer({ config, set }: Props) {
  return (
    <Section title={t.timer}>
      <NumberRow
        label={t.answerTime}
        value={config.capAnswerTimeToSecs}
        range={CONFIG_RANGES.capAnswerTimeToSecs}
        fallback={DEFAULT_CONFIG.capAnswerTimeToSecs}
        onChange={(v) => set({ capAnswerTimeToSecs: v })}
        help={t.answerTimeHelp}
      />
    </Section>
  );
}

function Advanced({ config, set }: Props) {
  return (
    <Section title={t.advanced}>
      <NumberRow
        label={t.maxInterval}
        value={config.maximumReviewInterval}
        range={CONFIG_RANGES.maximumReviewInterval}
        fallback={DEFAULT_CONFIG.maximumReviewInterval}
        onChange={(v) => set({ maximumReviewInterval: v })}
        help={t.maxIntervalHelp}
      />
      {config.maximumReviewInterval < 180 ? <Warning>{t.shortInterval}</Warning> : null}
    </Section>
  );
}
