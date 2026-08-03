# Sistema de Rating de Cursos (1-5 estrellas)

**Estado**: Backend completo, Frontend parcial, Mobile pendiente.
**Última actualización**: 2026-07-16

## Problema

El backend expone un subsistema de ratings completo y funcional (modelo, schemas, 6 endpoints). Frontend tiene el cliente HTTP listo pero desconectado de la UI, y el componente visual solo soporta modo lectura. Mobile (Android/iOS) no tiene ningún campo, endpoint ni componente de rating — parte de cero, y además carece de pantalla de detalle de curso (prerrequisito no relacionado con rating pero bloqueante). Los tres clientes comparten un bloqueante transversal: no existe concepto de "usuario actual" en ninguno, y el backend exige `user_id` para escribir ratings. Sin resolver esa pieza, solo se puede construir la mitad "de solo lectura" de la feature en todas las plataformas.

## Impacto Arquitectural

- **Backend**: sin cambios de schema. Trabajo acotado a un control de seguridad adicional (rate limiting) — no se requiere tocar `CourseRating`, `rating.py` ni los 6 endpoints existentes.
- **Frontend**: introduce el primer Client Component con estado y fetch en navegador del proyecto — requiere una regla explícita de cuándo se permite romper el patrón Server-Components-only.
- **Mobile**: requiere extender DTOs/domain/mappers en ambas plataformas, añadir endpoints Retrofit/URLSession, construir la pantalla de detalle de curso (gran ítem, colateral a esta feature), y persistencia local de identidad (SharedPreferences/UserDefaults).
- **Base de datos**: ninguna migración nueva.

## Estado actual verificado (código real, no documentación)

### Backend — 100% implementado
- Modelo `CourseRating` en `Backend/app/models/course_rating.py`: soft-delete, constraint rating 1-5, unique compuesto (course_id, user_id, deleted_at).
- Schemas Pydantic tipados en `Backend/app/schemas/rating.py`: `RatingRequest`, `RatingResponse`, `RatingStatsResponse`.
- 6 endpoints en `Backend/app/main.py` (POST/GET ratings, GET stats, GET rating de usuario, PUT, DELETE), todos vía `CourseService`.
- `GET /courses` y `GET /courses/{slug}` ya devuelven `average_rating`/`total_ratings` embebidos.
- **Riesgo de seguridad**: el backend no valida identidad real del usuario — solo compara que `user_id` del body coincida con el del path. Cualquier cliente puede enviar cualquier `user_id`.

### Frontend (Next.js) — parcialmente conectado
- `Frontend/src/services/ratingsApi.ts`: cliente HTTP completo, implementado pero no usado por ningún componente.
- `Frontend/src/components/StarRating/StarRating.tsx`: solo visual/readonly. El prop `readonly` existe pero no hay rama interactiva (sin onClick, sin hover, sin estado).
- `Frontend/src/components/Course/Course.tsx` (card catálogo): ya muestra average_rating/total_ratings en modo readonly, usando el dato embebido de `GET /courses`. Funciona hoy.
- `Frontend/src/components/CourseDetail/CourseDetail.tsx`: no muestra rating, pese a que `getCourseData()` en `Frontend/src/app/course/[slug]/page.tsx` ya trae average_rating/total_ratings/rating_distribution.
- Todo el frontend es Server Components async sin estado. No existe ningún sistema de autenticación ni concepto de "usuario actual" (verificado con grep, sin resultados relevantes).

### Mobile — Android (Kotlin/Compose, MVVM+MVI, Retrofit+Gson)
- `CourseDTO.kt`, domain `Course.kt` y `CourseMapper.kt`: ninguno tiene campos de rating.
- `ApiService.kt`: solo define `GET courses`. No existe `getCourseBySlug` ni endpoints de ratings.
- `CourseCard.kt`: sin espacio para rating, no hay componente StarRating en Compose.
- No existe pantalla de detalle de curso (TODO explícito en `onCourseClick`).
- Única plataforma mobile con tests reales (JUnit ViewModel).

### Mobile — iOS (Swift/SwiftUI, MVVM, URLSession)
- `CourseDTO.swift`, `CourseDetailDTO.swift`, domain `Course.swift`, `CourseMapper.swift` (2 overloads): ninguno tiene campos de rating.
- `CourseAPIEndpoints.swift`: define `getAllCourses` y `getCourseBySlug` (existe pero no está consumido). Sin endpoints de ratings.
- `CourseCardView.swift`: sin espacio para rating, no hay vista StarRating en SwiftUI.
- No existe pantalla de detalle de curso (TODO explícito en `selectCourse`).
- Sin tests funcionales reales (solo boilerplate de Xcode) — deuda técnica preexistente.

### Bloqueante transversal (Frontend + Android + iOS)
Ninguno de los 3 clientes persiste identidad de usuario (sin auth, sin localStorage/SharedPreferences/UserDefaults con userId). Como `POST/PUT` de ratings exige `user_id`, esto bloquea "calificar" (no "solo mostrar el promedio") en los 3 clientes por igual.

## Propuesta de solución

### Decisión Arquitectural 1: Identidad de Usuario

**Decisión: ID anónimo generado y persistido localmente (UUID v4) en cada cliente — no auth real.**

Justificación:
- El backend ya trata `user_id` como un identificador opaco no verificado (compara body vs. path, nada más). No hay tabla `User`, no hay login en ningún cliente. Construir auth real es un proyecto en sí mismo, de un orden de magnitud mayor que "poner estrellas a un curso", y no está pedido por ningún requerimiento de negocio conocido.
- El constraint único `(course_id, user_id, deleted_at)` en BD ya da la semántica necesaria ("un rating activo por identidad y curso") independientemente de si esa identidad es una cuenta real o un UUID anónimo.
- Es la opción más barata: 0.5d por plataforma móvil, trivial en Frontend.

Trade-offs aceptados explícitamente:
- Un mismo usuario en incógnito o en otro dispositivo puede volver a "gastar" un rating.
- "Mi rating" no sincroniza entre dispositivos.
- Es un identificador spoofeable (ver mitigación abajo).

Camino de migración futuro: si más adelante se construye auth real, `user_id` sigue siendo una columna sin cambios de schema; solo se reemplaza el generador de ID anónimo por el ID de cuenta, con merge best-effort (no bloqueante para este plan).

### Decisión Arquitectural 2: Mitigación del riesgo "user_id sin validar"

Se mantiene el diseño actual (no se exige cambio en backend para desbloquear la feature), con controles compensatorios de bajo costo:
1. **Rate limiting por IP** en `POST/PUT/DELETE /courses/{course_id}/ratings*` (ej. `slowapi`, middleware en `Backend/app/main.py`). Corta el abuso automatizado masivo.
2. El constraint único existente ya impide que un mismo `user_id` infle un curso con múltiples ratings — se mantiene tal cual.
3. No se implementa verificación criptográfica de identidad — sería incoherente con la Decisión 1 y desproporcionado.
4. Documentar el riesgo aceptado en `Backend/specs/00_contracts.md` (deuda ya conocida y desactualizada) para que quede trazado como decisión consciente.

Ítem paralelo e independiente — no bloquea Frontend ni Mobile.

### Decisión Arquitectural 3: Encaje del primer Client Component en Frontend

Regla explícita: el fetch en cliente solo se permite cuando el dato depende de estado que no existe en el servidor (aquí, el ID anónimo vive en `localStorage`, inaccesible en SSR). No se abre la puerta a convertir el resto del sitio a client-fetching.

Implementación concreta:
- `StarRating.tsx` se mantiene puramente presentacional (se le agregan props opcionales `onHover`/`onSelect` para el modo interactivo, sin fetch ni estado propio).
- Nuevo componente `StarRatingInteractive.tsx` (`"use client"`): único responsable de leer/crear el ID anónimo, hacer `GET .../ratings/user/{id}` al montar, manejar estado de hover/selección, y llamar `ratingsApi.ts` en POST/PUT.
- `average_rating`/`total_ratings`/`rating_distribution` se siguen resolviendo server-side y se pasan como props iniciales — evita un round-trip extra.
- `CourseDetail.tsx` sigue siendo Server Component; solo importa `StarRatingInteractive` como isla de cliente (patrón estándar de Next.js App Router).

## Fases y dependencias

```
Track A (solo lectura, SIN dependencia de identidad — arranca YA en paralelo):
  A1. Frontend: wire rating en CourseDetail.tsx (Server Component, sin estado)
  A2. Android: rating en CourseCard.kt (catálogo)
  A3. iOS: rating en CourseCardView.swift (catálogo)
  → A1/A2/A3 son independientes entre sí y del resto. Ship inmediato.

Track B (interactivo, requiere Decisión 1 + Decisión 3):
  B0. Backend: rate limiting (paralelo, no bloquea nada)
  B1. Frontend: util ID anónimo + StarRatingInteractive + wire en CourseDetail
  B2. Android: Fase A (pantalla detalle, 3.5d) -> Fase B (widget interactivo, 1.75d)
      Fase 2 (ID anónimo, 0.5d) es independiente, corre en paralelo a Fase A
  B3. iOS: análogo a B2
```

Backend está listo desde el día 0 y no bloquea a nadie salvo por B0, que tampoco bloquea a Frontend/Mobile (los endpoints ya existen sin rate limit).

## Plan de Implementación

### Fase 0 — Backend (paralelo, no bloqueante, ~0.5-1d)
1. Agregar rate limiting a los 3 endpoints de escritura de ratings en `Backend/app/main.py`.
2. Actualizar `Backend/specs/00_contracts.md` documentando el riesgo aceptado de `user_id` no verificado y la decisión de identidad anónima.

### Fase 1 — Track A: Solo lectura, todos los clientes en paralelo (~2-2.5d wall-clock)

**Frontend:**
1. Confirmar que `getCourseData()` en `Frontend/src/app/course/[slug]/page.tsx` ya trae average_rating/total_ratings/rating_distribution.
2. En `Frontend/src/components/CourseDetail/CourseDetail.tsx`, renderizar `StarRating` (modo `readonly`) con esos datos — mismo patrón que ya usa `Course.tsx`.
3. Test RTL para el nuevo render en `CourseDetail`.

**Android (~1.5d):**
1. Agregar `averageRating`/`totalRatings` a `CourseDTO.kt`, `Course.kt` (domain) y `CourseMapper.kt`.
2. `ApiService.kt` no requiere cambios para esta fase (el dato viene embebido en `GET /courses`).
3. Crear composable `StarRating` reutilizable y mostrarlo en `CourseCard.kt`.
4. Tests de ViewModel/mapper.

**iOS (~1.75d):**
1. Agregar campos equivalentes a `CourseDTO.swift` y `Course.swift`, actualizar los 2 overloads de `CourseMapper.swift`.
2. Crear `StarRatingView.swift` (SwiftUI) y mostrarlo en `CourseCardView.swift`.
3. Sin tests reales disponibles en iOS (deuda preexistente) — no se resuelve en este plan.

### Fase 2 — Identidad anónima, los 3 clientes (~0.5-1d c/u, en paralelo a Fase 1)
1. **Frontend**: utilidad `getOrCreateAnonUserId()` (uuid v4 + `localStorage`), junto a `ratingsApi.ts`.
2. **Android**: generar/persistir UUID en `SharedPreferences` vía `di/AppModule.kt`.
3. **iOS**: generar/persistir UUID en `UserDefaults`, inyectado por constructor.

### Fase 3 — Track B: Interactivo

**Frontend (~1-1.5d, depende de Fase 1 + Fase 2 Frontend):**
1. Modificar `StarRating.tsx` para aceptar `onHover`/`onSelect` opcionales (sin romper el uso readonly existente).
2. Crear `StarRatingInteractive.tsx` (`"use client"`): hidrata "mi rating" con `ratingsApi.ts`, maneja click → POST/PUT.
3. Integrar en `CourseDetail.tsx` como isla de cliente.
4. Tests Vitest del nuevo componente (mock de `ratingsApi.ts`).

**Android — Fase A (pantalla de detalle, prerrequisito bloqueante, ~3.5d):**
1. Implementar `onCourseClick`, pantalla de detalle de curso consumiendo `GET /courses/{slug}` (agregar cliente Retrofit para slug en `ApiService.kt`).
2. Estructura MVVM+MVI consistente con el resto del proyecto.

**Android — Fase B (widget interactivo, ~1.75d, depende de Fase A + Fase 2):**
1. Agregar a `ApiService.kt` los endpoints de ratings necesarios.
2. Composable interactivo de estrellas + ViewModel con estado (MVI).
3. Tests de ViewModel.

**iOS — Fase A (pantalla de detalle, ~3.5d):**
1. Implementar `selectCourse` usando `getCourseBySlug` de `CourseAPIEndpoints.swift` (ya definido, solo falta cablearlo).

**iOS — Fase B (widget interactivo, ~1.75d, depende de Fase A + Fase 2):**
1. Agregar endpoints de ratings a `CourseAPIEndpoints.swift`.
2. Vista interactiva de estrellas + estado en el `ObservableObject` correspondiente.

## Plan de Rollout

1. **Release 1 (inmediato, bajo riesgo):** Track A completo — rating de solo lectura en Frontend + catálogo Android + catálogo iOS. Sin dependencias de identidad, sin tocar el patrón arquitectural de ningún cliente. Puede salir por partes.
2. **Release 2 (Frontend interactivo):** independiente de Mobile — Fase 2 + Fase 3 Frontend (~1.5-2.5d total).
3. **Release 3 (Backend hardening):** rate limiting, se despliega antes o junto con Release 2.
4. **Release 4 (Mobile interactivo):** cada plataforma se lanza de forma independiente cuando termine su secuencia Fase A (detalle) → Fase 2 (identidad, en paralelo) → Fase B (interactivo). Android e iOS no necesitan sincronizarse entre sí; la pantalla de detalle (~3.5d c/u) es el cuello de botella real y es colateral a esta feature.

**Camino crítico total estimado:** Frontend completo en menos de una semana; Mobile completo en ~7.25-7.5 días-persona por plataforma si Android e iOS corren en paralelo entre sí.
