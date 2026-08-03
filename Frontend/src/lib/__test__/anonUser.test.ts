import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOrCreateAnonUserId, fnv1aHashToPositiveInt } from '../anonUser';

const STORAGE_KEY = 'platziflix_anon_user';

describe('fnv1aHashToPositiveInt', () => {
  it('es determinístico: la misma entrada produce siempre la misma salida', () => {
    const uuid = '5f2e1a3b-4c6d-4e2a-9b0a-1234567890ab';

    const first = fnv1aHashToPositiveInt(uuid);
    const second = fnv1aHashToPositiveInt(uuid);
    const third = fnv1aHashToPositiveInt(uuid);

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('devuelve un entero positivo dentro de un rango seguro de int32', () => {
    const result = fnv1aHashToPositiveInt('00000000-0000-4000-8000-000000000000');

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(0x7fffffff);
  });

  it('entradas distintas tienden a producir salidas distintas', () => {
    const a = fnv1aHashToPositiveInt('uuid-a');
    const b = fnv1aHashToPositiveInt('uuid-b');

    expect(a).not.toBe(b);
  });
});

describe('getOrCreateAnonUserId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('en la primera llamada genera y persiste un nuevo id con numericId entero positivo', () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    const result = getOrCreateAnonUserId();

    expect(result).not.toBeNull();
    expect(typeof result?.uuid).toBe('string');
    expect(result?.uuid.length).toBeGreaterThan(0);
    expect(Number.isInteger(result?.numericId)).toBe(true);
    expect(result!.numericId).toBeGreaterThan(0);

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored as string);
    expect(parsed.uuid).toBe(result?.uuid);
    expect(parsed.numericId).toBe(result?.numericId);
  });

  it('en llamadas subsecuentes devuelve el mismo numericId (no regenera)', () => {
    const first = getOrCreateAnonUserId();
    const second = getOrCreateAnonUserId();
    const third = getOrCreateAnonUserId();

    expect(second?.numericId).toBe(first?.numericId);
    expect(second?.uuid).toBe(first?.uuid);
    expect(third?.numericId).toBe(first?.numericId);
  });

  it('el numericId derivado es determinístico frente al mismo uuid ya persistido', () => {
    const first = getOrCreateAnonUserId();
    expect(first).not.toBeNull();

    const recomputed = fnv1aHashToPositiveInt(first!.uuid);

    expect(recomputed).toBe(first!.numericId);
  });

  it('devuelve null si se ejecuta en un entorno sin window (guard SSR)', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error -- se simula un entorno SSR eliminando `window`.
    delete globalThis.window;

    try {
      const result = getOrCreateAnonUserId();
      expect(result).toBeNull();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('si el valor persistido está corrupto, regenera un id válido sin lanzar', () => {
    window.localStorage.setItem(STORAGE_KEY, 'no-es-json-valido');

    const result = getOrCreateAnonUserId();

    expect(result).not.toBeNull();
    expect(Number.isInteger(result?.numericId)).toBe(true);
    expect(result!.numericId).toBeGreaterThan(0);
  });
});
