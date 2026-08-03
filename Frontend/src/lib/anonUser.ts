/**
 * Identidad anónima del visitante (Fase 2 — sistema de rating de cursos)
 *
 * Contexto (ver spec/00_sistema_rating_cursos.md, Decisión Arquitectural 1 y
 * spec/03_plan_frontend_ratings.md, Fase 2): el visitante anónimo se identifica
 * con un UUID v4 persistido en `localStorage`. Sin embargo, el backend
 * (`Backend/app/schemas/rating.py`) y `Frontend/src/types/rating.ts` exigen
 * `user_id: number` (entero positivo), en el que un UUID v4 (string) no cabe.
 *
 * Solución (sin tocar Backend): derivar de forma determinística un entero
 * positivo estable ("numericId") a partir del UUID mediante un hash FNV-1a de
 * 32 bits, y persistir ambos valores — el UUID original (para debug/futuro
 * merge con auth real) y el numericId derivado (el que consumen las llamadas
 * HTTP de `ratingsApi.ts`) — bajo una única clave de `localStorage`.
 */

const STORAGE_KEY = 'platziflix_anon_user';

/** Forma persistida en localStorage bajo STORAGE_KEY. */
export interface AnonUser {
  uuid: string;
  numericId: number;
}

/**
 * Hash FNV-1a (32 bits), determinístico y puro: la misma cadena de entrada
 * siempre produce la misma salida. Se exporta por separado para poder
 * testearlo de forma aislada.
 *
 * Devuelve un entero en el rango [1, 2^31 - 1] (positivo, seguro para
 * columnas `int` de Postgres / validación "must be positive integer" del
 * backend).
 */
export function fnv1aHashToPositiveInt(input: string): number {
  // Offset basis y prime de FNV-1a de 32 bits.
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), usando aritmética de 32 bits sin signo.
    hash = Math.imul(hash, 0x01000193);
  }

  // Math.imul devuelve un int32 con signo; se normaliza a unsigned de 32 bits.
  const unsigned = hash >>> 0;

  // Se acota a [1, 2^31 - 1]: evita 0 (para no colisionar con "sin id") y
  // evita el bit de signo de un int32 con signo (rango seguro para
  // cualquier consumidor que trate el id como `int` con signo, ej. Postgres).
  const positive = unsigned % 0x7fffffff; // 2^31 - 1
  return positive === 0 ? 1 : positive;
}

function isAnonUser(value: unknown): value is AnonUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.uuid === 'string' &&
    typeof candidate.numericId === 'number' &&
    Number.isInteger(candidate.numericId) &&
    candidate.numericId > 0
  );
}

function createAnonUser(): AnonUser {
  const uuid = crypto.randomUUID();
  const numericId = fnv1aHashToPositiveInt(uuid);
  return { uuid, numericId };
}

/**
 * Resuelve la identidad anónima del visitante actual, creándola y
 * persistiéndola en `localStorage` si es la primera visita.
 *
 * Client-only: en SSR (o si se importa por error desde un Server Component)
 * `window`/`localStorage` no existen, así que devuelve `null` en vez de
 * lanzar.
 */
export function getOrCreateAnonUserId(): AnonUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isAnonUser(parsed)) {
        return parsed;
      }
      // Valor corrupto/con forma inesperada: se regenera.
    }

    const anonUser = createAnonUser();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(anonUser));
    return anonUser;
  } catch {
    // localStorage puede no estar disponible (modo privado, cuotas, etc.)
    // o el JSON almacenado puede estar corrupto. En ese caso se genera un
    // id efímero para la sesión actual, sin romper la UI.
    return createAnonUser();
  }
}
