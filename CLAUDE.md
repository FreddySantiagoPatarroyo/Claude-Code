# Platziflix - Proyecto Multi-plataforma

## Arquitectura del Sistema

Platziflix es una plataforma de cursos online con arquitectura multi-plataforma que incluye:
- **Backend**: API REST con FastAPI + PostgreSQL
- **Frontend**: Aplicación web con Next.js 15
- **Mobile**: Apps nativas Android (Kotlin) + iOS (Swift)

Los tres clientes (Web, Android, iOS) consumen directamente el mismo backend FastAPI en `http://localhost:8000` (Android usa `http://10.0.2.2:8000/` desde el emulador). No hay BFF/gateway ni generación de contrato compartido (OpenAPI codegen): cada cliente define sus propios tipos/DTOs a mano contra el mismo contrato REST.

## Stack Tecnológico

### Backend (FastAPI/Python)
- **Framework**: FastAPI
- **Base de datos**: PostgreSQL 15
- **ORM**: SQLAlchemy 2.0
- **Migraciones**: Alembic
- **Container**: Docker + Docker Compose
- **Gestión dependencias**: UV
- **Puerto**: 8000

### Frontend (Next.js)
- **Framework**: Next.js 15 (App Router)
- **React**: 19.0
- **Lenguaje**: TypeScript
- **Estilos**: SCSS + CSS Modules
- **Testing**: Vitest + React Testing Library
- **Fonts**: Geist Sans & Geist Mono

### Mobile
- **Android**: Kotlin + Jetpack Compose + Retrofit (MVVM + MVI)
- **iOS**: Swift + SwiftUI + Repository Pattern (MVVM)

## Estructura del Proyecto

```
claude-code/
├── Backend/           # API FastAPI + PostgreSQL
├── Frontend/          # Next.js 15 App
└── Mobile/
    ├── PlatziFlixAndroid/  # Kotlin App
    └── PlatziFlixiOS/      # Swift App
```

## Modelo de Datos

### Entidades Principales
- **Course**: Cursos (name, description, thumbnail, slug)
- **Teacher**: Profesores
- **Lesson**: Lecciones de un curso (en el dominio/UI se les llama "Clases", pero el modelo/tabla real es `Lesson`/`lessons`)
- **CourseRating**: Calificaciones de curso (1-5, por usuario, soft-delete)

### Relaciones
- Course ↔ Teacher (Many-to-Many via `course_teachers`)
- Course → Lesson (One-to-Many, cascade delete)
- Course → CourseRating (One-to-Many, cascade delete)

Todas las entidades heredan de `BaseModel` ([Backend/app/models/base.py](Backend/app/models/base.py)): `id`, `created_at`, `updated_at`, `deleted_at` (soft delete transversal, filtrado manual en cada query).

⚠️ Existe un modelo `Class` en [Backend/app/models/class_.py](Backend/app/models/class_.py) que es **código muerto**: no está registrado en `models/__init__.py`, no tiene migración ni tabla real, y su relación `Course.classes` no existe (rompería si se instanciara). El endpoint real `GET /classes/{class_id}` en realidad consulta `Lesson`, no `Class`. No confundir este modelo huérfano con el dominio real.

## API Endpoints (reales, todos en `Backend/app/main.py`, sin routers separados)

- `GET /` - Bienvenida
- `GET /health` - Health check + conectividad DB
- `GET /courses` - Lista todos los cursos activos (incluye `average_rating`, `total_ratings`)
- `GET /courses/{slug}` - Detalle de curso (incluye `teacher_id`, `classes`, `average_rating`, `total_ratings`, `rating_distribution`)
- `GET /classes/{class_id}` - Detalle de una clase/lección (consulta `Lesson` directo, sin pasar por el service — inconsistente con el resto)
- `POST /courses/{course_id}/ratings` - Crea o actualiza rating (upsert)
- `GET /courses/{course_id}/ratings` - Lista ratings activos de un curso
- `GET /courses/{course_id}/ratings/stats` - Estadísticas agregadas (promedio, total, distribución)
- `GET /courses/{course_id}/ratings/user/{user_id}` - Rating de un usuario específico
- `PUT /courses/{course_id}/ratings/{user_id}` - Actualiza rating existente
- `DELETE /courses/{course_id}/ratings/{user_id}` - Soft-delete de un rating

**Asimetría a tener en cuenta**: los endpoints de `courses` devuelven dicts/listas crudos sin `response_model` Pydantic (el contrato solo está documentado en [Backend/specs/00_contracts.md](Backend/specs/00_contracts.md), y ya desactualizado respecto al código real). Los endpoints de `ratings` sí usan schemas Pydantic tipados ([Backend/app/schemas/rating.py](Backend/app/schemas/rating.py)) — es el subsistema más nuevo y mejor construido (añadido ~4 meses después del scaffold original, según las migraciones Alembic).

## Comandos de Desarrollo

### Backend
```bash
cd Backend
make start        # Iniciar Docker Compose
make stop         # Detener containers
make migrate      # Ejecutar migraciones
make seed         # Poblar datos de prueba
make seed-fresh   # Limpiar y volver a poblar
make logs         # Ver logs
make create-migration  # Crear nueva migración (prompt interactivo)
```

### Frontend
```bash
cd Frontend
yarn dev          # Servidor de desarrollo
yarn build        # Build de producción
yarn test         # Ejecutar tests
yarn lint         # Linter
```

## URLs del Sistema

- **Backend API**: http://localhost:8000
- **Frontend Web**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs (FastAPI Swagger)

## Base de Datos

### Configuración Docker
- **Usuario**: platziflix_user
- **Password**: platziflix_password
- **Database**: platziflix_db
- **Puerto**: 5432

### Migraciones
- Ubicación: `Backend/app/alembic/versions/`
- Comando crear: `make create-migration`
- Comando aplicar: `make migrate`
- Estado actual: 2 migraciones lineales — (1) schema inicial (teachers, courses, lessons, course_teachers), (2) course_ratings con check constraint (rating 1-5) y unique constraint compuesto (course_id, user_id, deleted_at)

## Funcionalidades Implementadas

- ✅ Catálogo de cursos con grid estilo Netflix (Web)
- ✅ Detalle de cursos (profesores, lecciones, clases) (Web)
- ✅ Navegación por slug SEO-friendly (Web)
- ✅ Reproductor de video integrado (Web, único cliente con este flujo funcional)
- ✅ Sistema de ratings completo en Backend (CRUD, soft-delete, stats agregadas)
- ⚠️ Ratings en Frontend: servicio cliente completo ([Frontend/src/services/ratingsApi.ts](Frontend/src/services/ratingsApi.ts)) implementado pero **no conectado a ningún componente todavía** — el rating visible en el catálogo llega embebido en `/courses`, un camino de datos distinto y paralelo al servicio de ratingsApi.
- ✅ Health checks de API y DB
- ⚠️ Apps móviles nativas (Android + iOS): solo implementan listado de cursos (`GET /courses`). Sin pantalla de detalle de curso ni reproductor de video (hay TODOs explícitos en el código de ambas). Paridad de features entre sí, pero muy por detrás de Web.
- ✅ Testing: cobertura real en Backend (pytest) y en partes de Frontend (Vitest) y Android (JUnit ViewModel). iOS solo tiene boilerplate de Xcode sin tests reales.

## Patrones de Desarrollo

### Backend
- **Arquitectura**: Service Layer Pattern ([Backend/app/services/course_service.py](Backend/app/services/course_service.py) — única clase de servicio del proyecto, concentra lógica de courses y ratings)
- **Dependency Injection**: FastAPI Dependencies (`get_db()`, `get_course_service()`)
- **Database**: acceso directo vía SQLAlchemy ORM en el service — **no hay Repository Pattern real** (no existen clases `*Repository` en el backend, a diferencia de lo documentado antes)
- **Manejo de errores**: los servicios lanzan `ValueError` genérico; `main.py` decide el código HTTP inspeccionando substrings del mensaje (`"not found" in str(e)`) — patrón frágil, no usa excepciones tipadas

### Frontend
- **Routing**: Next.js App Router (`/` → `/course/[slug]` → `/classes/[class_id]`)
- **Data Fetching**: 100% Server Components async con `fetch(..., {cache: "no-store"})` — sin API routes propias, sin SWR/React Query, sin estado global
- **Styling**: CSS Modules + SCSS (tokens de color centralizados en `src/styles/vars.scss`, auto-inyectados vía `next.config.ts`)
- **Testing**: Vitest + React Testing Library (`src/test/setup.ts`)
- Convenciones documentadas en `.cursor/rules/` (estructura de componente por carpeta, testing, SCSS)

### Mobile
- **Android**: MVVM + MVI explícito (UiState/UiEvent unidireccional), Retrofit + Gson, DI manual (`di/AppModule.kt`, sin Hilt/Koin), incluye `MockCourseRepository` con fallos simulados para desarrollo
- **iOS**: MVVM (`ObservableObject`/`@Published`), URLSession nativo envuelto en `NetworkManager`/`APIEndpoint`, patrón Repository + Mapper, DI manual por constructor. Domain model `Class` ya trae `videoUrl`/`hasVideo` preparado para una futura pantalla de reproductor.

## Deuda técnica conocida (para tener en cuenta al planear trabajo futuro)

1. Modelo `Class` huérfano en Backend ([Backend/app/models/class_.py](Backend/app/models/class_.py)) — código muerto, candidato a eliminar o consolidar con `Lesson`.
2. [Backend/specs/00_contracts.md](Backend/specs/00_contracts.md) está desactualizado: especifica `GET /courses/:slug/classes/:id` pero la implementación real es `GET /classes/{class_id}` (plano, sin slug del curso).
3. Endpoint `GET /classes/{class_id}` no pasa por `CourseService`, rompe la capa de servicio.
4. Frontend: link "Regresar al curso" en `classes/[class_id]/page.tsx` apunta a `/course` sin slug (bug conocido, comentado en el propio código).
5. Frontend: test de `Course.tsx` ([Frontend/src/components/Course/__test__/Course.test.tsx](Frontend/src/components/Course/__test__/Course.test.tsx)) está desactualizado respecto al componente real (espera props `teacher`/`duration` que ya no existen).
6. Frontend: `ratingsApi.ts` implementado pero no cableado a la UI.
7. Mobile: navegación a detalle de curso (`onCourseClick`/`selectCourse`) es un TODO sin implementar en ambas plataformas.
8. iOS: sin tests funcionales reales (solo boilerplate de Xcode).

## Consideraciones de Desarrollo

1. **Docker obligatorio** para el backend (DB + API)
2. **TypeScript strict** en Frontend
3. **Testing requerido** para nuevas funcionalidades
4. **Migraciones automáticas** para cambios de DB
5. **Convenciones de naming**: snake_case (Python), camelCase (JS/TS), PascalCase (Swift/Kotlin)
6. **API REST** como única fuente de datos para Frontend/Mobile
7. Al modificar el contrato de un endpoint, revisar los 3 clientes (Web, Android, iOS) que lo consumen — no hay generación de tipos compartida que avise de breaking changes

## Comandos Útiles

```bash
# Desarrollo completo
cd Backend && make start    # Iniciar backend
cd Frontend && yarn dev     # Iniciar frontend

# Reset completo de datos
cd Backend && make seed-fresh

# Ver logs de todos los servicios
cd Backend && make logs
```

- Cualquier comando que necesites ejecutar para el Backend debe ser dentro del contenedor de docker API; antes de ejecutarlo certifica que esté funcionando el contenedor y revisa el Makefile con los comandos que existen y úsalos.

Esta memoria contiene toda la información necesaria para continuar el desarrollo del proyecto Platziflix.
