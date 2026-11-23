// The texts of WorkerRequests.

export const workerRequestsStrings = {
  title: 'Pedidos al Worker',
  help: (limit: number) =>
    `Lo que Cloudflare cuenta contra los ${limit.toLocaleString('es-CL')} pedidos diarios del plan gratis, sumando todos los Workers de la cuenta. Cada día va de medianoche a medianoche UTC (21:00 en Chile con horario de verano) y las cifras llegan con unos minutos de atraso. En naranjo, los días sobre el 80 %.`,
  unavailable: 'No se pudieron leer los pedidos. Intenta de nuevo en un rato.',
  day: 'Día (UTC)',
  requests: 'Pedidos',
  share: 'Del tope',
  today: 'Hoy, hasta ahora',
  percent: (share: number) =>
    share > 0 && share < 0.01 ? 'menos de 1 %' : `${Math.round(share * 100)} %`,
} as const;
