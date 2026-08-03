# Plan de Implementación Mobile — Sistema de Rating de Cursos

**Alcance**: exclusivamente Android (`Mobile/PlatziFlixAndroid`) e iOS (`Mobile/PlatziFlixiOS`).
**Fuente de verdad arquitectural**: [spec/00_sistema_rating_cursos.md](00_sistema_rating_cursos.md) — este documento *detalla* (no reemplaza) las fases de Mobile ya bosquejadas ahí (Track A, Fase 2, Track B Fase A/B), con nivel de paso a paso, archivos concretos y tests por fase.

No se escribe código en este documento — es únicamente el plan de fases, pasos y dependencias.

---

## Resumen de dependencias entre fases

```
Fase M1 (Track A, solo lectura)      Fase M2 (Identidad anónima)
   Android + iOS en paralelo            Android + iOS en paralelo
   SIN dependencia de M2                SIN dependencia de M1
        │                                     │
        └───────────────┬─────────────────────┘
                         │
              Fase M3-A (Pantalla de detalle)   ← BLOQUEANTE, no depende de M1/M2,
              Android + iOS en paralelo           puede arrancar en paralelo a M1/M2
                         │
                         ▼
              Fase M3-B (Widget interactivo)
              Android + iOS en paralelo
              depende de M3-A (misma plataforma) + M2 (misma plataforma)
```

Notas clave:
- **M1 y M2 no bloquean nada entre sí** ni bloquean M3-A. Pueden ejecutarse en cualquier orden o simultáneamente.
- **M3-A (pantalla de detalle) es el prerrequisito bloqueante real** de esta feature en Mobile — es trabajo colateral (no es "rating" en sí) pero sin él no existe superficie donde montar el widget interactivo.
- **M3-B depende de M3-A y M2 de su misma plataforma**, no de la otra plataforma. Android e iOS no necesitan sincronizarse entre sí en ningún punto.
- Dentro de cada fase, Android e iOS son pistas independientes — un bloqueo en una plataforma no debe frenar a la otra (paridad se persigue, pero no se serializa el trabajo).

---

## Fase M1 — Track A: Rating de solo lectura en catálogo (paralelo, sin dependencias)

Objetivo: mostrar `averageRating`/`totalRatings` en la card de curso del catálogo (`GET /courses`, dato ya embebido — sin nuevo endpoint).

### Android (~1.5d)

**Domain**
1. `Mobile/PlatziFlixAndroid/.../domain/models/Course.kt`: agregar `averageRating: Double?` y `totalRatings: Int?` al modelo de dominio.

**Data**
2. `Mobile/PlatziFlixAndroid/.../data/entities/CourseDTO.kt`: agregar los campos equivalentes con anotaciones Gson (`@SerializedName`) según el JSON real de `GET /courses` (verificar nombres exactos contra `Backend/app/main.py` / `CourseService`, no contra specs desactualizados).
3. `Mobile/PlatziFlixAndroid/.../data/mappers/CourseMapper.kt`: mapear los nuevos campos DTO → domain.
4. `Mobile/PlatziFlixAndroid/.../data/repositories/MockCourseRepository.kt`: añadir valores de ejemplo de rating a los cursos mock, para que el modo `USE_MOCK_DATA` siga siendo representativo en desarrollo sin backend.
5. `ApiService.kt`: sin cambios (el endpoint `GET /courses` ya existe).

**Presentation**
6. Crear composable reutilizable `StarRating` (nuevo archivo, sugerido `presentation/courses/components/StarRating.kt`): recibe `averageRating: Double`, `totalRatings: Int`, modo solo-lectura (sin `onClick`). Reutilizable también en M3-B.
7. `Mobile/PlatziFlixAndroid/.../presentation/courses/components/CourseCard.kt`: integrar `StarRating` en el layout de la card.
8. `presentation/courses/state/CourseListUiState.kt`: normalmente sin cambios estructurales (el estado ya contiene `List<Course>`, que ahora trae rating); revisar solo si el estado expone campos derivados que deban actualizarse.

**Tests**
9. `CourseListViewModelTest.kt` (JUnit + coroutines-test): actualizar fixtures/mocks de `Course` para incluir rating y verificar que el estado expuesto los propaga sin pérdida de datos.
10. Test de mapper (nuevo o extendido, JUnit puro): `CourseDTO` con rating → `Course` domain, casos con rating nulo (curso sin ratings todavía) y con valores límite (0 ratings, 5.0 promedio).
11. Considerar test de Compose UI (Espresso/Compose UI test) para `StarRating` si el proyecto ya tiene precedente de tests de Composable; si no lo tiene, no introducir el precedente en esta fase — mantener alcance en ViewModel/mapper como el resto del proyecto.

### iOS (~1.75d)

**Domain**
1. `Mobile/PlatziFlixiOS/PlatziFlixiOS/Domain/Models/Course.swift`: agregar `averageRating: Double?` y `totalRatings: Int?`.

**Data**
2. `Mobile/PlatziFlixiOS/PlatziFlixiOS/Data/Entities/CourseDTO.swift`: agregar propiedades equivalentes (`Codable`, verificar `CodingKeys`/snake_case vs camelCase contra el JSON real del backend).
3. `Mobile/PlatziFlixiOS/PlatziFlixiOS/Data/Mapper/CourseMapper.swift`: actualizar **ambos overloads** (el spec 00 señala explícitamente que hay dos) para mapear los nuevos campos — riesgo concreto de que se actualice uno y se olvide el otro.

**Presentation**
4. Crear `StarRatingView.swift` (nuevo archivo, sugerido junto a `Presentation/Views/`): SwiftUI view solo-lectura, recibe `averageRating: Double`, `totalRatings: Int`. Reutilizable en M3-B.
5. `Mobile/PlatziFlixiOS/PlatziFlixiOS/Presentation/Views/CourseCardView.swift`: integrar `StarRatingView` en el layout de la card.

**Tests**
6. iOS no tiene tests funcionales reales hoy (`PlatziFlixiOSTests.swift` es boilerplate de Xcode) — esta es la primera fase donde conviene **iniciar cobertura real**, empezando por lo más barato y de mayor valor: test de `CourseMapper` (ambos overloads, casos con/sin rating) en XCTest puro, sin necesidad de mocks de red. No se exige cobertura de la vista SwiftUI en esta fase (paridad de esfuerzo con Android, que tampoco testea el Composable visual).

---

## Fase M2 — Identidad anónima (paralelo entre sí y con M1, independiente de M3-A)

Objetivo: cada instalación de la app genera y persiste un UUID v4 anónimo, prerrequisito exclusivo de M3-B (no de M1 ni M3-A).

### Android (~0.5d)
1. Definir un helper de identidad (nuevo archivo sugerido `data/local/AnonymousUserIdProvider.kt` o similar) que:
   - Lee `user_id` de `SharedPreferences` si existe.
   - Si no existe, genera `UUID.randomUUID()`, lo persiste y lo devuelve.
2. Registrar el provider en `Mobile/PlatziFlixAndroid/.../di/AppModule.kt` (DI manual `by lazy`, consistente con el resto del módulo) para que esté disponible para el futuro ViewModel de detalle (M3-B).
3. **Test**: JUnit sobre el provider — genera UUID la primera vez, reutiliza el mismo valor en llamadas subsecuentes (mockeando `SharedPreferences` o usando un fake in-memory).

### iOS (~0.5-1d)
1. Definir un helper equivalente (nuevo archivo sugerido `Data/Local/AnonymousUserIdProvider.swift`) que:
   - Lee `user_id` de `UserDefaults` si existe.
   - Si no existe, genera `UUID().uuidString`, lo persiste y lo devuelve.
2. Inyectar por constructor (patrón DI manual ya usado en el proyecto) donde corresponda para el futuro ViewModel de detalle.
3. **Test**: dado que esta fase es puro Swift sin red ni SwiftUI, es la segunda pieza de cobertura real recomendada en XCTest — mismo criterio que Android (genera una vez, reutiliza después).

---

## Fase M3-A — Pantalla de detalle de curso (BLOQUEANTE para M3-B, paralelo entre plataformas)

Objetivo: resolver el TODO explícito de navegación a detalle. Es trabajo colateral a "rating" pero indispensable como superficie de UI para el widget interactivo. No depende de M1 ni M2.

### Android (~3.5d)
1. `data/network/ApiService.kt`: agregar método `getCourseBySlug(slug: String): CourseDetailDTO` (o equivalente) — hoy solo existe `GET courses`.
2. Nuevo DTO de detalle (sugerido `data/entities/CourseDetailDTO.kt`) reflejando el contrato real de `GET /courses/{slug}` (incluye `teacher_id`, `classes`, `average_rating`, `total_ratings`, `rating_distribution` — verificar contra `Backend/app/main.py`, no contra `Backend/specs/00_contracts.md`, que está desactualizado).
3. Domain: modelo `CourseDetail` (o extender `Course`) + repositorio (`domain/repositories/CourseRepository.kt` — agregar método) + implementación en `RemoteCourseRepository.kt` y `MockCourseRepository.kt`.
4. Presentation: nueva screen (sugerido `presentation/coursedetail/screen/CourseDetailScreen.kt`) + `CourseDetailViewModel` con `UiState`/`UiEvent` (MVI, consistente con `CourseListViewModel.kt`).
5. Implementar `onCourseClick` en `MainActivity.kt` (hoy TODO) para navegar a la nueva screen con el `slug` del curso seleccionado.
6. **Tests**: JUnit del nuevo ViewModel (loading/success/error), test de mapper del nuevo DTO → domain.

### iOS (~3.5d)
1. `Mobile/PlatziFlixiOS/PlatziFlixiOS/Data/Repositories/CourseAPIEndpoints.swift`: `getCourseBySlug` **ya está definido** (según spec 00) pero no consumido — cablearlo es el primer paso, no crearlo de cero.
2. Verificar/crear `CourseDetailDTO.swift` si no cubre el contrato completo (classes, teacher_id, rating_distribution).
3. `CourseMapper.swift`: mapper de detalle (o extensión del existente) DTO → domain.
4. Nuevo `CourseDetailViewModel` (`ObservableObject`/`@Published`, sugerido en `Presentation/ViewModels/`) + nueva `CourseDetailView.swift` (SwiftUI).
5. Implementar `selectCourse` en `CourseListViewModel.swift` (hoy TODO) para navegar al detalle.
6. **Tests**: continuar la cobertura real iniciada en M1/M2 — XCTest del nuevo `CourseDetailViewModel` (estados de carga/éxito/error) y del mapper de detalle.

---

## Fase M3-B — Widget interactivo de rating (depende de M3-A + M2 de la misma plataforma)

Objetivo: permitir calificar un curso desde la pantalla de detalle. Requiere superficie de UI (M3-A) e identidad anónima (M2) de la misma plataforma.

### Android (~1.75d)
1. `data/network/ApiService.kt`: agregar los endpoints de ratings necesarios:
   - `POST /courses/{course_id}/ratings`
   - `GET /courses/{course_id}/ratings/user/{user_id}`
   - (`PUT`/`DELETE` si el alcance de UI los contempla — mínimo viable es POST/upsert + GET del rating propio)
2. Nuevos DTOs de request/response de rating (reflejar `Backend/app/schemas/rating.py`: `RatingRequest`/`RatingResponse`).
3. Extender `CourseDetailViewModel` (MVI): nuevo evento `OnRatingSelected(Int)`, estado `myRating`, llamada al repositorio con el `user_id` anónimo de M2 al montar y al seleccionar.
4. Extender el composable `StarRating` de M1 (o crear variante `StarRatingInteractive`) con `onClick` opcional — sin romper el uso readonly del catálogo.
5. **Tests**: JUnit del ViewModel extendido — estado inicial (GET rating propio), envío exitoso, manejo de error de red.

### iOS (~1.75d)
1. `CourseAPIEndpoints.swift`: agregar los endpoints de ratings equivalentes (POST upsert, GET rating de usuario).
2. Nuevos DTOs de rating (request/response) reflejando `Backend/app/schemas/rating.py`.
3. Extender `CourseDetailViewModel`: `@Published var myRating`, carga al aparecer la vista usando el `user_id` de M2, método `submitRating(_:)`.
4. Extender `StarRatingView` (o vista `StarRatingInteractiveView`) con manejo de tap — sin romper el uso readonly del catálogo (M1).
5. **Tests**: XCTest del ViewModel extendido — mismos casos que Android (estado inicial, envío exitoso, error de red). Esta es la fase donde iOS debería alcanzar paridad de cobertura de ViewModel con Android, cerrando la deuda técnica señalada en el spec 00 y en `.claude/agents/mobile.md`.

---

## Resumen de tests por fase (vista consolidada)

| Fase | Android (JUnit) | iOS (XCTest) |
|---|---|---|
| M1 | ViewModel (fixtures con rating) + mapper | **Inicio de cobertura real**: mapper (2 overloads) |
| M2 | Provider de identidad anónima | Provider de identidad anónima (segunda pieza de cobertura real) |
| M3-A | `CourseDetailViewModel` (estados) + mapper de detalle | `CourseDetailViewModel` (estados) + mapper de detalle |
| M3-B | `CourseDetailViewModel` extendido (rating propio, submit, error) | `CourseDetailViewModel` extendido — paridad de cobertura con Android |

## Paridad y verificación de contrato

- Antes de fijar nombres de campos en DTOs (`average_rating` vs `averageRating`, `rating_distribution`, etc.) en cualquier fase, verificar el JSON real devuelto por `Backend/app/main.py` / `CourseService` — no confiar en `Backend/specs/00_contracts.md`, documentado como desactualizado.
- Cualquier cambio de contrato de estos endpoints detectado durante la implementación debe reflejarse en ambas plataformas antes de cerrar la fase correspondiente (no hay generación de tipos compartida que avise de breaking changes).
- Android e iOS deben mantenerse en fases equivalentes (no es obligatorio terminar el mismo día, pero si una plataforma llega a M3-B sin que la otra haya empezado M3-A, se amplía la brecha de paridad ya señalada como deuda técnica — vigilar explícitamente).
