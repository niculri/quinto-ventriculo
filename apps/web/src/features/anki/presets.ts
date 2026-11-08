import type { PresetRef } from '../study/scheduler';

/** A preset in the URL of «Configuración de mazos». */
export const presetParam = (ref: PresetRef) => (ref.kind === 'author' ? ref.name : ref.id);
