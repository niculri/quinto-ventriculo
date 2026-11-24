// The texts of useConnectionMessage.

export const connectionMessageStrings = {
  lost: 'Sin conexión. Puedes seguir: lo que respondas se guarda solo cuando vuelva. No cierres esta pestaña.',
  held: (unsaved: number) =>
    `Sin conexión: hay ${unsaved} cambios sin guardar. Espera a que vuelva para seguir y no cierres esta pestaña.`,
  back: 'Volvió la conexión: lo que faltaba se está guardando.',
} as const;
