// How «Configuración de mazos» names a preset in its URL: an author's by its name, the user's by its id.

import type { PresetRef } from '@qv/study';

export const presetParam = (ref: PresetRef) => (ref.kind === 'author' ? ref.name : ref.id);
