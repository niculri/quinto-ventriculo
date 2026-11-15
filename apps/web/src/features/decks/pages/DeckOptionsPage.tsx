// «Opciones» → «Configuración de mazos»: the presets of the decks, as in Anki («Modo avanzado» only).
import { AnkiOptions } from '../components/options/AnkiOptions';

export function DeckOptionsSettingsPage() {
  return <AnkiOptions mode="decks" />;
}
