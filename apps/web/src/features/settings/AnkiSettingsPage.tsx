// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// «Opciones» → «Anki general» and «Configuración de mazos», after Anki's deck options screen with FSRS on.
import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleDot, Settings2 } from 'lucide-react';
import { CONFIG_RANGES, DEFAULT_CONFIG, DEFAULT_PARAMETERS, defaultConfig } from '@qv/srs';
import type {
  DeckConfig,
  NewCardGatherPriority,
  NewCardSortOrder,
  ReviewCardOrder,
  ReviewMix,
} from '@qv/srs';
import { paths } from '../../shared/lib/paths';
import { useStudyRepository } from '../progress/api/context';
import { Loading } from '../../shared/ui/Loading';
import { ErrorWithRetry } from '../../shared/ui/Notice';
import { button, card } from '../../shared/ui/styles';
import { Select } from '../../shared/ui/Select';
import { NumberRow } from '../../shared/ui/form/NumberRow';
import { SelectRow } from '../../shared/ui/form/SelectRow';
import { StepsRow } from '../../shared/ui/form/StepsRow';
import { SwitchRow } from '../../shared/ui/form/SwitchRow';
import { presetParam } from '../progress/presets';
import { hasPage } from '../catalog/model/tree';
import { useAnkiTree } from '../catalog/hooks/useAnkiTree';
import type { AnkiTree, CourseDeckNode, DeckNode } from '../catalog/model/tree';
import { studyKeys, useDeckSettings, usePreferences, useUserPresets } from '../progress/queries';
import { defaultPreferences } from '../progress/api/repository';
import type { DeckSetting, StudyPreferences, UserPreset } from '../progress/api/repository';
import { presetChoices, presetOf, sameRef } from '@qv/study';
import type { PresetChoice, PresetRef } from '@qv/study';
import { PresetNameDialog, PresetNameField, RemovePresetDialog } from './PresetDialogs';
import { SettingsLayout } from './SettingsLayout';

type Mode = 'general' | 'decks';

export function AnkiGeneralSettingsPage() {
  const [params] = useSearchParams();
  if (params.has('preset') || params.has('deck')) {
    return <Navigate to={`${paths.deckOptions()}?${params.toString()}`} replace />;
  }
  return <AnkiSettingsPage mode="general" />;
}

export function DeckOptionsSettingsPage() {
  return <AnkiSettingsPage mode="decks" />;
}

function AnkiSettingsPage({ mode }: { mode: Mode }) {
  const { catalog, tree } = useAnkiTree();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const preferences = usePreferences();
  const parts = [catalog, presets, settings, preferences];
  if (mode === 'decks' && preferences.prefs && !preferences.prefs.fullAnki) {
    return <Navigate to={paths.ankiSettings} replace />;
  }
  const failed = parts.find((p) => p.isError);
  if (failed) {
    return (
      <SettingsLayout>
        <ErrorWithRetry
          error={failed.error}
          onRetry={() => parts.forEach((p) => p.isError && void p.refetch())}
        />
      </SettingsLayout>
    );
  }
  if (!catalog.data || !tree || !presets.data || !settings.data || !preferences.prefs) {
    return (
      <SettingsLayout>
        <Loading text="Cargando las opciones…" />
      </SettingsLayout>
    );
  }
  return (
    <SettingsLayout>
      <OptionsForm
        mode={mode}
        tree={tree}
        authorPresets={catalog.data.anki.presets}
        presets={presets.data}
        settings={settings.data}
        prefs={preferences.prefs}
      />
    </SettingsLayout>
  );
}

const refKey = (r: PresetRef) => (r.kind === 'author' ? `author:${r.name}` : `user:${r.id}`);

// Anki's choices, with its Spanish texts (ts/routes/deck-options/choices.ts).
const GATHER: [NewCardGatherPriority, string][] = [
  ['deck', 'Mazo'],
  ['deckThenRandomNotes', 'Mazo, luego notas aleatorias'],
  ['lowestPosition', 'Posición ascendente'],
  ['highestPosition', 'Posición descendente'],
  ['randomNotes', 'Notas aleatorias'],
  ['randomCards', 'Tarjeta aleatoria'],
];
const SORT: [NewCardSortOrder, string][] = [
  ['template', 'Plantilla de tarjeta'],
  ['noSort', 'Orden de recolección'],
  ['templateThenRandom', 'Plantilla de tarjeta, luego aleatoria'],
  ['randomNoteThenTemplate', 'Nota aleatoria, luego plantilla de tarjeta'],
  ['randomCard', 'Aleatorio'],
];
const REVIEW: [ReviewCardOrder, string][] = [
  ['day', 'Fecha de revisión, luego aleatorio'],
  ['dayThenDeck', 'Fecha de revisión, luego mazo'],
  ['deckThenDay', 'Mazo, luego fecha de revisión'],
  ['intervalsAscending', 'Intervalos ascendentes'],
  ['intervalsDescending', 'Intervalos descendentes'],
  // With FSRS, the ease orders are by difficulty.
  ['easeAscending', 'Tarjetas difíciles primero'],
  ['easeDescending', 'Tarjetas fáciles primero'],
  ['retrievabilityAscending', 'Recordabilidad ascendente'],
  ['retrievabilityDescending', 'Recordabilidad descendente'],
  ['random', 'Aleatorio'],
  ['added', 'Orden añadido'],
  ['reverseAdded', 'Últimas añadidas primero'],
];
const MIX: [ReviewMix, string][] = [
  ['mixWithReviews', 'Mezclar con las tarjetas para revisar'],
  ['afterReviews', 'Mostrar después de las tarjetas para revisar'],
  ['beforeReviews', 'Mostrar antes de las tarjetas para revisar'],
];

function initialRef(
  params: URLSearchParams,
  choices: PresetChoice[],
  tree: AnkiTree,
  settings: DeckSetting[],
): PresetRef {
  const wanted = params.get('preset');
  const byParam = wanted
    ? choices.find((c) => (c.ref.kind === 'user' ? c.ref.id : c.ref.name) === wanted)
    : undefined;
  if (byParam) return byParam.ref;
  const deck = tree.byId.get(params.get('deck') ?? '') ?? tree.root;
  if (deck) return presetOf(deck.id, deck.preset, choices, settings).ref;
  return choices[0]?.ref ?? { kind: 'author', name: 'Default' };
}

/** After Anki's ts/routes/deck-options. */
function OptionsForm({
  mode,
  tree,
  authorPresets,
  presets,
  settings,
  prefs: savedPrefs,
}: {
  mode: Mode;
  tree: AnkiTree;
  authorPresets: { name: string; config: Record<string, unknown> }[];
  presets: UserPreset[];
  settings: DeckSetting[];
  prefs: StudyPreferences;
}) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const choices = useMemo(() => presetChoices(authorPresets, presets), [authorPresets, presets]);

  const [selected, setSelected] = useState<PresetRef>(() =>
    initialRef(params, choices, tree, settings),
  );
  const [drafts, setDrafts] = useState<Map<string, DeckConfig>>(new Map());
  const [prefs, setPrefs] = useState<StudyPreferences>(savedPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const choice: PresetChoice = choices.find((c) => sameRef(c.ref, selected)) ?? choices[0]!;
  const config = drafts.get(refKey(choice.ref)) ?? choice.config;
  const set = (patch: Partial<DeckConfig>) => {
    setSaved(false);
    setDrafts((d) => new Map(d).set(refKey(choice.ref), { ...config, ...patch }));
  };
  const changePrefs = (p: StudyPreferences) => {
    setSaved(false);
    setPrefs(p);
  };

  const param = presetParam(choice.ref);
  useEffect(() => {
    if (mode !== 'decks') return;
    if (params.get('preset') === param && !params.has('deck')) return;
    const next = new URLSearchParams(params);
    next.delete('deck');
    next.set('preset', param);
    setParams(next, { replace: true });
  }, [mode, param, params, setParams]);

  useEffect(() => {
    document.title = `${mode === 'general' ? 'Anki general' : 'Configuración de mazos'} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [mode]);

  // The decks above the courses (the root, the semesters) are not studied on the web.
  const users = tree.nodes.filter(
    (n): n is CourseDeckNode =>
      hasPage(n) && sameRef(presetOf(n.id, n.preset, choices, settings).ref, choice.ref),
  );

  const refresh = () => client.invalidateQueries({ queryKey: studyKeys.all });
  const run = async (what: () => Promise<unknown>) => {
    setError(null);
    try {
      await what();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  };

  const [naming, setNaming] = useState<{
    title: string;
    initial: string;
    from: DeckConfig;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const checkName = (name: string) =>
    !name
      ? 'Ponle un nombre.'
      : choices.some((c) => c.name === name && !sameRef(c.ref, choice.ref))
        ? 'Ya hay una configuración con ese nombre.'
        : null;
  const addPreset = (name: string, from: DeckConfig) => {
    setNaming(null);
    void run(async () => {
      const p = await study.savePreset({ name, replaces: null, config: { ...from } });
      setSelected({ kind: 'user', id: p.id });
    });
  };
  const renamePreset = (name: string) => {
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const row = choice.row;
    void run(() => study.savePreset({ id: row.id, name, replaces: null, config: row.config }));
  };
  const removePreset = () => {
    setRemoving(false);
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await study.deletePreset(id);
      setSelected(choices[0]!.ref);
    });
  };
  const backToAuthor = () => {
    if (choice.ref.kind !== 'author' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await study.deletePreset(id);
      setDrafts((d) => {
        const next = new Map(d);
        next.delete(refKey(choice.ref));
        return next;
      });
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const [key, draft] of drafts) {
        const c = choices.find((x) => refKey(x.ref) === key);
        if (!c || JSON.stringify(draft) === JSON.stringify(c.config)) continue;
        const stored = { ...draft } as unknown as Record<string, unknown>;
        if (c.ref.kind === 'user') {
          await study.savePreset({ id: c.ref.id, name: c.name, replaces: null, config: stored });
        } else {
          await study.savePreset({
            ...(c.row ? { id: c.row.id } : {}),
            name: c.name,
            replaces: c.name,
            config: stored,
          });
        }
      }
      if (JSON.stringify(prefs) !== JSON.stringify(savedPrefs)) await study.savePreferences(prefs);
      await refresh();
      setDrafts(new Map());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const steps = (s: number[]) => s.length > 0 && s.at(-1)! >= 1440;
  const reviewsTooLow = Math.min(9999, config.newPerDay * 10) > config.reviewsPerDay;
  const menuItem =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';

  const dirty =
    JSON.stringify(prefs) !== JSON.stringify(savedPrefs) ||
    [...drafts].some(([key, draft]) => {
      const c = choices.find((x) => refKey(x.ref) === key);
      return !!c && JSON.stringify(draft) !== JSON.stringify(c.config);
    });
  const saveControls = (
    <SaveControls dirty={dirty} saved={saved} saving={saving} onSave={() => void save()} />
  );
  const failure = error ? (
    <p role="alert" className="mt-3 text-sm text-state-learn">
      No se pudo guardar: {error}
    </p>
  ) : null;

  if (mode === 'general') {
    return (
      <div>
        <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-bg px-1 py-2">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Anki general</h2>
          {saveControls}
        </div>
        {failure}
        <p className="mt-1 text-sm text-muted">
          Valen para todos los mazos.
          {savedPrefs.fullAnki ? (
            <>
              {' '}
              Lo de cada tipo de mazo está en{' '}
              <Link
                to={paths.deckOptions()}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                Configuración de mazos
              </Link>
              .
            </>
          ) : null}
        </p>
        <section aria-label="Modo avanzado" className={`${card} mt-6 px-4 py-2 sm:px-6`}>
          <SwitchRow
            label="Modo avanzado"
            value={prefs.fullAnki}
            fallback={prefs.fullAnki}
            onChange={(v) => changePrefs({ ...prefs, fullAnki: v })}
            help="Las páginas de los mazos no cambian: agrega opciones, como una configuración para cada mazo, las banderas y la tabla de tarjetas con la búsqueda de Anki."
          />
        </section>
        <Section title="General">
          <SwitchRow
            label="Mostrar los 4 botones"
            value={prefs.fourButtons}
            fallback={false}
            onChange={(v) => changePrefs({ ...prefs, fourButtons: v })}
            help="Agrega «Difícil» y «Fácil» a «Otra vez» y «Bien» al responder."
          />
          <NumberRow
            label="El siguiente día empieza a las"
            value={prefs.dayStartsAt}
            range={[0, 23]}
            fallback={defaultPreferences().dayStartsAt}
            unit="h"
            onChange={(v) => changePrefs({ ...prefs, dayStartsAt: v })}
            help="Si estudias de madrugada, lo que respondas antes de esta hora cuenta para el día anterior."
          />
        </Section>
        {prefs.fullAnki ? (
          <Section title="Avanzado">
            <NumberRow
              label="Límite del estudio por adelantado"
              value={prefs.learnAheadMinutes}
              range={[0, 1440]}
              fallback={defaultPreferences().learnAheadMinutes}
              unit="min"
              onChange={(v) => changePrefs({ ...prefs, learnAheadMinutes: v })}
              help="Si no queda nada más, las tarjetas de aprendizaje que vencen dentro de este tiempo se muestran antes."
            />
            <SwitchRow
              label="Las tarjetas nuevas ignoran el límite de revisión"
              value={prefs.newCardsIgnoreReviewLimit}
              fallback={false}
              onChange={(v) => changePrefs({ ...prefs, newCardsIgnoreReviewLimit: v })}
            />
            <SwitchRow
              label="Límites empiezan desde arriba"
              value={prefs.applyAllParentLimits}
              fallback={false}
              onChange={(v) => changePrefs({ ...prefs, applyAllParentLimits: v })}
              help="Al estudiar un mazo, también cuentan los límites de los mazos de arriba (el certamen, el ramo…)."
            />
            <p className="py-3 text-xs text-muted">
              Zona horaria: {prefs.timeZone} (la de tu navegador).
            </p>
          </Section>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Configuración de mazos</h2>
      <p className="mt-1 text-sm text-muted">
        Cada configuración agrupa las opciones de un tipo de mazo, como en Anki. Lo que vale para
        todos los mazos está en{' '}
        <Link
          to={paths.ankiSettings}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          Anki general
        </Link>
        .
      </p>

      <div className={`${card} sticky top-20 z-10 mt-6 flex flex-wrap items-center gap-3 p-3`}>
        <div className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto sm:flex-1">
          <span className="font-medium">Configuración</span>
          <Select
            label="Configuración"
            value={refKey(choice.ref)}
            options={choices.map((c) => ({
              value: refKey(c.ref),
              label: `${c.name}${c.ref.kind === 'author' ? (c.row ? ' (del autor, cambiada)' : ' (del autor)') : ''}`,
            }))}
            onChange={(v) => setSelected(choices.find((c) => refKey(c.ref) === v)!.ref)}
            className="flex-1"
          />
        </div>
        <Menu.Root modal={false}>
          <Menu.Trigger
            className={`${button.base} ${button.secondary}`}
            aria-label="Acciones de la configuración"
          >
            <Settings2 className="size-4" aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={6}
              className="z-50 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
            >
              <Menu.Item
                className={menuItem}
                onSelect={() =>
                  setNaming({ title: 'Agregar configuración', initial: '', from: defaultConfig() })
                }
              >
                Agregar configuración
              </Menu.Item>
              <Menu.Item
                className={menuItem}
                onSelect={() =>
                  setNaming({
                    title: 'Clonar configuración',
                    initial: `Copia de ${choice.name}`,
                    from: config,
                  })
                }
              >
                Clonar configuración
              </Menu.Item>
              <Menu.Item
                className={menuItem}
                disabled={choice.ref.kind !== 'user'}
                onSelect={() => setRemoving(true)}
              >
                Remover configuración
              </Menu.Item>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item className={menuItem} onSelect={() => set(defaultConfig())}>
                Restablecer los valores predeterminados de Anki
              </Menu.Item>
              {choice.ref.kind === 'author' && choice.row ? (
                <Menu.Item className={menuItem} onSelect={backToAuthor}>
                  Volver a la configuración del autor
                </Menu.Item>
              ) : null}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        {saveControls}
      </div>
      {failure}
      <PresetNameField
        key={`${refKey(choice.ref)}|${choice.name}`}
        name={choice.name}
        editable={choice.ref.kind === 'user'}
        check={checkName}
        onRename={renamePreset}
      />
      {naming ? (
        <PresetNameDialog
          title={naming.title}
          initial={naming.initial}
          check={(name) =>
            !name
              ? 'Ponle un nombre.'
              : choices.some((c) => c.name === name)
                ? 'Ya hay una configuración con ese nombre.'
                : null
          }
          onCancel={() => setNaming(null)}
          onSubmit={(name) => addPreset(name, naming.from)}
        />
      ) : null}
      {removing ? (
        <RemovePresetDialog
          name={choice.name}
          users={users.length}
          onCancel={() => setRemoving(false)}
          onConfirm={removePreset}
        />
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Una configuración se comparte: cambiarla cambia todos los mazos que la usan, como en Anki.
        Qué configuración usa cada mazo se elige con el botón de configuración de ese mazo.
      </p>

      <DecksUsing decks={users} />

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
        {reviewsTooLow ? (
          <Warning>
            Agregando {config.newPerDay} nuevas tarjetas cada día, su límite de revisión debe ser
            por lo menos {Math.min(9999, config.newPerDay * 10)}.
          </Warning>
        ) : null}
      </Section>

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
    </div>
  );
}

function DecksUsing({ decks }: { decks: CourseDeckNode[] }) {
  const path = (n: DeckNode) => n.name.split('::').slice(1).join(' › ');
  return (
    <section aria-label="Mazos que la usan" className={`${card} mt-6 px-4 py-3 sm:px-6`}>
      <h3 className="text-sm font-semibold">
        {decks.length
          ? `La usan ${decks.length} ${decks.length === 1 ? 'mazo' : 'mazos'}`
          : 'Ningún mazo la usa'}
      </h3>
      {decks.length ? (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {decks.map((n) => (
            <li key={n.id}>
              <Link to={paths.deck(n.ref)} className="text-muted hover:text-ink">
                {path(n)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SaveControls({
  dirty,
  saved,
  saving,
  onSave,
}: {
  dirty: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span role="status" className="inline-flex w-24 justify-end text-xs font-medium">
        {dirty ? (
          <span className="inline-flex items-center gap-1 text-state-learn">
            <CircleDot className="size-3.5" aria-hidden="true" /> Sin guardar
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Check className="size-3.5" aria-hidden="true" /> Guardado
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={`${button.base} ${button.primary} disabled:opacity-50`}
      >
        Guardar
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} mt-6 px-4 py-2 sm:px-6`} aria-label={title}>
      <h2 className="border-b border-border py-3 text-lg font-semibold">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="py-2 text-sm text-[#b45309] dark:text-[#f2b67a]">
      {children}
    </p>
  );
}

function ParamsRow({ value }: { value: readonly number[] }) {
  const id = useId();
  const own = value.length > 0;
  return (
    <div className="py-3" role="group" aria-labelledby={id}>
      <p id={id} className="text-sm font-medium">
        Parámetros FSRS
      </p>
      <p
        aria-label={own ? 'Parámetros de esta configuración' : 'Parámetros predeterminados'}
        className={`mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-words ${own ? 'text-ink' : 'text-muted'}`}
      >
        {(own ? value : DEFAULT_PARAMETERS).join(', ')}
      </p>
      <p className="mt-1 text-xs text-muted">
        {own
          ? 'Los de esta configuración.'
          : 'Los predeterminados de FSRS-6, que usa esta configuración.'}{' '}
        El sitio los muestra, pero no deja cambiarlos: el manual de Anki pide no editarlos a mano ni
        copiarlos de otra persona, porque salen del historial de cada uno.
      </p>
    </div>
  );
}
