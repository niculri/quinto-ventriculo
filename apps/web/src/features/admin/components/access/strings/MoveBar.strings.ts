// The texts of MoveBar.

import { plural } from '../../../../../shared/lib/plural';

export const moveBarStrings = {
  title: 'Mover a otra lista',
  chosen: (n: number) =>
    n ? plural(n, 'persona elegida', 'personas elegidas') : 'Elige personas con las casillas',
  longestChosen: 'Elige personas con las casillas',
  help: 'Solo cambia la lista: el acceso, las sesiones y el avance quedan como están.',
  list: 'Lista de destino',
  newList: 'Lista nueva',
  newName: 'Nombre de la nueva lista de destino',
  newNameHint: 'Por ejemplo, Ayudantes',
  move: 'Mover',
  moving: 'Moviendo…',
  undo: 'Deshacer',
} as const;
