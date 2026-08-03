# Plan de Implementación Frontend — Sistema de Rating de Cursos

**Referencia obligatoria**: [spec/00_sistema_rating_cursos.md](./00_sistema_rating_cursos.md) — este documento es la fuente de verdad arquitectural (Decisiones 1, 2, 3). Este plan detalla ÚNICAMENTE el trabajo de Frontend (Next.js), con el nivel de granularidad necesario para ejecutarlo sin re-derivar decisiones ya tomadas allí.

**Alcance**: Frontend/. No cubre Backend ni Mobile (ver spec/00 para esas pistas).

**Estado verificado de archivos relevantes** (leídos directamente, no solo el spec):
- `Frontend/src/components/StarRating/StarRating.tsx`: presentacional puro, props `rating/totalRatings/showCount/size/readonly/className`, ya soporta medias estrellas. No tiene `onHover`/`onSelect` todavía.
- `Frontend/src/components/CourseDetail/CourseDetail.tsx`: Server Component, recibe `course: CourseDetail`, no renderiza nada de rating hoy. No tiene carpeta `__test__` (a diferencia de `Course.tsx`, que sí la tiene) — hay que crearla.
- `Frontend/src/app/course/[slug]/page.tsx` → `getCourseData()`: hace `fetch(.../courses/{slug})` pero el tipo `CourseDetail` en `Frontend/src/types/index.ts` **no declara** `average_rating`/`total_ratings`/`rating_distribution` — solo hereda `average_rating?`/`total_ratings?` opcionales de `Course`, y `rating_distribution` no existe en ningún tipo todavía. Hay que ampliar el tipo antes de consumir esos campos con TypeScript strict.
- `Frontend/src/services/ratingsApi.ts`: cliente completo (`getRatingStats`, `getCourseRatings`, `getUserRating`, `createRating`, `updateRating`, `deleteRating`), ya maneja 404 como "sin dato" en vez de error.
- **Hallazgo que el spec no menciona y bloquea Fase 2/3**: `Frontend/src/types/rating.ts` tipa `user_id: number` (en `CourseRating` y `RatingRequest`), y el backend (`Backend/app/schemas/rating.py`) también exige `user_id: int` ("must be positive integer"). La Decisión Arquitectural 1 del spec dice "ID anónimo generado... UUID v4 en localStorage", pero un UUID v4 es un string, no cabe en `int`. Esto es una inconsistencia real entre la decisión de identidad y el contrato de backend ya existente — se resuelve explícitamente en la Fase 2 de este plan (ver más abajo), no se puede posponer sin bloquear todo Track B.

---

## Fase 1 — Track A: Rating de solo lectura en `CourseDetail` (sin dependencia de identidad)

**Objetivo**: mostrar `average_rating`/`total_ratings` en la página de detalle de curso, replicando el patrón readonly que ya funciona en `Course.tsx` (catálogo). Cero estado de cliente, cero cambio de patrón arquitectural.

**Pasos**:
1. `Frontend/src/types/index.ts`: extender `Course`/`CourseDetail` para que `rating_distribution?: Record<string, number>` (o el shape que devuelva realmente `GET /courses/{slug}`) quede tipado — hoy solo hay `average_rating?`/`total_ratings?` heredados de `Course`, faltaría `rating_distribution` si se quiere usar en esta fase o dejarlo preparado para Fase 3/futuro. Confirmar el shape real inspeccionando la respuesta de `GET /courses/{slug}` (Swagger en `http://localhost:8000/docs` o `curl`) antes de tipar a ciegas.
2. `Frontend/src/app/course/[slug]/page.tsx`: no requiere cambios de lógica (ya trae los campos en el JSON crudo), solo se beneficia del tipo ampliado del paso 1 para que TypeScript deje de tratarlos como "posiblemente ausentes de forma silenciosa".
3. `Frontend/src/components/CourseDetail/CourseDetail.tsx`: importar `StarRating` y renderizarlo junto a `courseInfo` (debajo de `description` o junto a `stats`, a definir con diseño), en modo `readonly`, `showCount`, `size="medium"` — mismo patrón que `Course.tsx` líneas 24-35 (guard `typeof average_rating === 'number'` antes de renderizar, para no romper cursos sin ratings todavía).
4. Revisar `Frontend/src/components/CourseDetail/CourseDetail.module.scss` para agregar la clase de contenedor del rating si hace falta (reutilizar tokens de `src/styles/vars.scss`, no hardcodear colores).

**Dependencias**: ninguna. Puede arrancar de inmediato.

**Paralelizable con**: Fase 2 (no comparten archivos ni lógica).

**Tests (Vitest + RTL)**:
- Crear `Frontend/src/components/CourseDetail/__test__/CourseDetail.test.tsx` (no existe hoy):
  - Renderiza `StarRating` cuando `course.average_rating` es un número.
  - No renderiza el bloque de rating cuando `average_rating` es `undefined` (curso sin ratings) — no debe lanzar ni mostrar "NaN".
  - Pasa `totalRatings` correctamente al componente hijo (se puede mockear `StarRating` con `vi.mock` y verificar props recibidas, o verificar el texto renderizado si no se mockea).
- No se toca `Course.test.tsx` en esta fase (su desactualización con props `teacher`/`duration` es deuda técnica preexistente y no forma parte de este plan — ver punto 5 de deuda técnica en `CLAUDE.md`).

---

## Fase 2 — Identidad anónima + resolución del mismatch `user_id`

**Objetivo**: tener una utilidad reutilizable que resuelva "quién es este visitante" para todas las llamadas de escritura de Fase 3, y cerrar la inconsistencia de tipos detectada arriba antes de que Fase 3 la arrastre a componentes de UI.

**Pasos**:
1. Decidir explícitamente cómo se concilia "UUID v4 en localStorage" (Decisión 1 del spec) con `user_id: int` exigido por backend y por `Frontend/src/types/rating.ts`. Este plan asume la opción de menor costo y sin tocar Backend (consistente con "Backend sin cambios" del spec): derivar un entero estable de 31 bits a partir del UUID v4 (ej. hash determinístico del UUID, ej. FNV-1a o similar, truncado a rango seguro de `int` positivo) y persistir **ambos** valores (UUID original + entero derivado) en `localStorage`, usando el entero derivado como `user_id` en las llamadas HTTP. Alternativa a validar con el equipo de Backend antes de implementar: relajar `user_id` a string en el schema Pydantic — pero esto sí es un cambio de contrato de Backend, fuera del alcance "Backend sin cambios" que asume el spec, así que no se elige por defecto en este plan.
2. Crear `Frontend/src/lib/anonUser.ts` (o `src/utils/anonUser.ts`, según convención existente en el proyecto — verificar si ya hay carpeta `lib/` o `utils/`): función `getOrCreateAnonUserId()` que:
   - Lee `localStorage.getItem('platziflix_anon_user')`.
   - Si no existe, genera UUID v4 (usar `crypto.randomUUID()`, ya disponible en navegadores modernos sin dependencia nueva), calcula el entero derivado, guarda un objeto `{ uuid, numericId }` serializado.
   - Devuelve el `numericId` (lo que consumirá `ratingsApi.ts`) y opcionalmente el `uuid` para debug/futuro merge con auth real (mencionado en el spec como camino de migración).
   - Debe ser client-only: usar guard `typeof window === 'undefined'` (nunca se ejecuta en SSR, pero conviene que no reviente si se importa por error en un Server Component).
3. Actualizar `Frontend/src/types/rating.ts` si se requiere algún ajuste de forma (por ejemplo, documentar con un comentario que `user_id` es un ID anónimo derivado, no una cuenta real) — sin romper la forma `number` ya usada por Backend.
4. No se toca `ratingsApi.ts` en esta fase (su firma ya acepta `userId: number`, compatible con el `numericId` derivado).

**Dependencias**: ninguna dependencia de Fase 1. Bloquea toda la Fase 3 (Track B) porque `StarRatingInteractive` necesita esta utilidad para saber "quién califica".

**Paralelizable con**: Fase 1 (no comparten archivos).

**Tests (Vitest)**:
- Crear `Frontend/src/lib/__test__/anonUser.test.ts` (o ruta equivalente a la elegida en el paso 2):
  - Mock de `localStorage` (jsdom lo trae vía `src/test/setup.ts`, confirmar que el entorno de test ya simula `localStorage`; si no, usar `vi.stubGlobal`).
  - Primera llamada sin valor previo: genera y persiste un nuevo ID, y el `numericId` es un entero positivo válido.
  - Llamada subsecuente: devuelve el mismo `numericId` que la primera vez (no regenera).
  - El `numericId` derivado del mismo UUID es determinístico (misma entrada → misma salida) — importante si se re-deriva en cada carga en vez de guardarlo ya calculado.

---

## Fase 3 — Track B: Rating interactivo en `CourseDetail`

**Objetivo**: permitir que el visitante anónimo califique un curso desde la página de detalle, con el primer Client Component del proyecto, ateniéndose estrictamente a la Decisión Arquitectural 3 del spec (la isla de cliente es solo `StarRatingInteractive`, todo lo demás sigue siendo Server Component).

**Depende de**: Fase 1 (el layout/contenedor de rating en `CourseDetail.tsx` ya debe existir) + Fase 2 (utilidad de identidad ya disponible).

**Pasos**:
1. `Frontend/src/components/StarRating/StarRating.tsx`: agregar props opcionales `onHover?: (star: number) => void` y `onSelect?: (star: number) => void`, invocados desde el `span` de cada estrella (`onMouseEnter`/`onClick`) solo cuando `readonly` es `false`. No cambia el comportamiento existente en modo `readonly` (Course.tsx y el uso de Fase 1 en CourseDetail siguen sin pasar estos props, por lo que no hay regresión).
2. Crear `Frontend/src/components/StarRatingInteractive/StarRatingInteractive.tsx` con `"use client"` en la primera línea:
   - Props de entrada: `courseId: number`, `initialAverageRating: number`, `initialTotalRatings: number` (estos tres vienen del Server Component padre, ya resueltos server-side — no se vuelven a pedir por fetch de cliente).
   - Al montar (`useEffect`): resolver `getOrCreateAnonUserId()` (Fase 2), luego `ratingsApi.getUserRating(courseId, numericId)` para saber si el visitante ya calificó antes; mientras resuelve, mostrar estado de carga o el `StarRating` en modo readonly con los valores iniciales (evita parpadeo/layout shift).
   - Estado local: `hoveredStar`, `selectedRating` (el propio, si existe), `submitState: 'idle' | 'loading' | 'success' | 'error'` (reutilizar el tipo `RatingState` ya definido en `Frontend/src/types/rating.ts`).
   - `onSelect`: si el usuario no tenía rating previo → `ratingsApi.createRating`; si ya tenía → `ratingsApi.updateRating`. Actualizar estado local de forma optimista o esperar respuesta, a decidir en implementación; en caso de error, revertir y mostrar mensaje (usar `ApiError` ya exportado por `ratingsApi.ts`).
   - Renderiza `StarRating` en modo NO readonly, pasando `onHover`/`onSelect`.
3. `Frontend/src/components/CourseDetail/CourseDetail.tsx`: reemplazar (o complementar) el `StarRating` readonly de Fase 1 por `StarRatingInteractive`, pasándole `course.id`, `course.average_rating`, `course.total_ratings`. Sigue siendo Server Component — solo agrega un `import` de un Client Component, patrón estándar de islas en App Router.
4. Manejo de estados de UI a cubrir explícitamente (siguiendo la convención del proyecto de loading/error/success): estado de carga inicial (mientras se resuelve "mi rating"), estado de envío en curso (deshabilitar estrellas o mostrar spinner), estado de error de red (usar `ApiError.message`), estado de éxito (confirmación visual breve, ej. cambio de color momentáneo).

**Tests (Vitest + RTL)**:
- Crear `Frontend/src/components/StarRating/__test__/StarRating.test.tsx` si no cubre ya el modo interactivo (revisar si existe test previo del componente; si no existe, crearlo): verificar que `onSelect`/`onHover` se disparan con el índice de estrella correcto y que en modo `readonly` no se registran listeners.
- Crear `Frontend/src/components/StarRatingInteractive/__test__/StarRatingInteractive.test.tsx`:
  - Mock completo de `Frontend/src/services/ratingsApi.ts` (`vi.mock`) y de la utilidad de Fase 2 (`getOrCreateAnonUserId`).
  - Al montar, llama a `getUserRating` con el `courseId` y el `numericId` mockeado.
  - Si `getUserRating` devuelve `null` (usuario nuevo) y el usuario hace click en la estrella N → llama a `createRating(courseId, { user_id, rating: N })`.
  - Si `getUserRating` devuelve un rating existente y el usuario cambia su selección → llama a `updateRating`, no a `createRating`.
  - Simula `ApiError` de red y verifica que se muestra el estado de error sin romper el render.
  - Verifica que mientras el fetch inicial está en curso no se muestra la UI interactiva prematuramente (evita doble submit).
- Actualizar/crear el test de `CourseDetail` de Fase 1 para reflejar que ahora renderiza `StarRatingInteractive` (mockeado) en vez de `StarRating` directo — mantener el test de Fase 1 enfocado en "se pasan los props iniciales correctos", no en la lógica interactiva (esa vive en el test de `StarRatingInteractive`).

**No paralelizable con Fase 1/2**: depende de ambas. Internamente, los pasos 1 (StarRating props) y el armazón de 2 (StarRatingInteractive) sí pueden avanzar en paralelo entre dos personas, pero el paso 3 (integración en CourseDetail) requiere que ambos estén terminados.

---

## Resumen de dependencias

```
Fase 1 (Track A, readonly)  ──┐
                               ├──> Fase 3 (Track B, interactivo)
Fase 2 (identidad anónima)  ──┘
```

- Fase 1 y Fase 2 son independientes entre sí y pueden ejecutarse en paralelo (o en cualquier orden).
- Fase 3 requiere ambas completas: el contenedor visual de Fase 1 y la utilidad de identidad de Fase 2.
- Antes de iniciar Fase 2 es recomendable validar con Backend el mismatch `user_id: int` vs. UUID v4 (ver hallazgo al inicio de este documento) — es una decisión de diseño que este plan resuelve del lado Frontend (hash a entero) para no bloquear el trabajo, pero conviene que quede confirmada explícitamente antes de escribir código, no descubierta a mitad de Fase 3.

## Estimación (alineada con spec/00, sin recalcular desde cero)

- Fase 1: ~0.5-1d (componente simple + tipo + test).
- Fase 2: ~0.5d (utilidad pequeña, pero incluye resolver el mismatch de tipos, que no estaba en el estimado original del spec).
- Fase 3: ~1-1.5d.
- Total Frontend: dentro de la semana, consistente con el estimado de spec/00.
