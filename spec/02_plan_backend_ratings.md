# Plan de Fases — Backend: Sistema de Rating de Cursos

**Fuente de verdad**: [spec/00_sistema_rating_cursos.md](./00_sistema_rating_cursos.md). Este documento no reinterpreta ni amplía ese análisis; solo lo traduce a un plan de ejecución de Backend.

## Resumen honesto del alcance

El análisis en `spec/00_sistema_rating_cursos.md` es explícito: el subsistema de ratings de Backend está **100% implementado** (modelo `CourseRating`, schemas Pydantic en `rating.py`, 6 endpoints en `Backend/app/main.py`, `average_rating`/`total_ratings` ya embebidos en `GET /courses` y `GET /courses/{slug}`). No hay deuda funcional ni de datos pendiente.

Por lo tanto, **este plan tiene una sola fase real**. No se agregan fases adicionales de "mejora", "refactor" o "cobertura extra" que el spec no pide — el spec dice textualmente (línea 12) que "no se requiere tocar `CourseRating`, `rating.py` ni los 6 endpoints existentes". Inflar el plan contradiría esa conclusión.

Lo único pendiente es la **Fase 0** descrita en el spec original (sección "Plan de Implementación"): rate limiting en escritura + documentación del riesgo aceptado.

## Fase 0 — Rate limiting + documentación de riesgo aceptado

**Objetivo**: cerrar el único gap de seguridad identificado (`user_id` no verificado, cualquier cliente puede enviar cualquier `user_id`) con un control compensatorio de bajo costo, sin cambiar el diseño del subsistema.

**Pasos concretos**:

1. Agregar rate limiting por IP a los endpoints de escritura de ratings en `Backend/app/main.py`:
   - `POST /courses/{course_id}/ratings`
   - `PUT /courses/{course_id}/ratings/{user_id}`
   - `DELETE /courses/{course_id}/ratings/{user_id}`
   - El spec sugiere `slowapi` como candidato de librería (middleware sobre FastAPI), a confirmar/instalar como dependencia del proyecto (`pyproject.toml` / UV) antes de implementar.
   - Límite propuesto: **5 peticiones/minuto por IP** + **30/hora por IP** como red de seguridad contra ráfagas sostenidas justo debajo del límite por minuto. Aplicado individualmente a cada uno de los 3 endpoints de escritura (`@limiter.limit("5/minute")` con `slowapi`).
   - Razonamiento: un usuario legítimo califica un curso una vez y rara vez lo edita más de 1-2 veces; 5/min da margen de sobra para eso (y para tráfico agrupado tras NAT compartido o el emulador Android, que sale de una única IP) sin permitir que un script infle ratings a alta velocidad. No es un bloqueo perfecto — es fricción suficiente para que el abuso deje de ser práctico, dado que no hay auth real (Decisión Arquitectural 2).
   - No se toca el endpoint `GET .../ratings*` (solo lectura, sin riesgo de abuso de escritura).

2. Documentar el riesgo aceptado en `Backend/specs/00_contracts.md`:
   - Registrar explícitamente la Decisión Arquitectural 2 del spec original: no se implementa verificación criptográfica de identidad; el backend solo compara `user_id` del body contra el del path.
   - Dejar constancia de que el constraint único `(course_id, user_id, deleted_at)` en BD ya acota el impacto (un mismo `user_id` no puede inflar un curso con múltiples ratings activos).
   - Este archivo ya está marcado como desactualizado en `CLAUDE.md`; esta actualización es incremental (agrega una sección de riesgo aceptado) y no corrige el resto de las inconsistencias conocidas (fuera de alcance de esta feature).

**Dependencias**: ninguna. No depende de Frontend, Mobile, ni de ninguna migración de base de datos (el spec confirma: "ninguna migración nueva").

**¿Bloqueante para Frontend/Mobile?**: No. Los 6 endpoints ya existen y funcionan sin rate limit hoy; Frontend y Mobile pueden consumirlos desde el día 0 (Track A y Track B del spec original) sin esperar esta fase. Es un ítem paralelo e independiente, tal como lo indica el spec (línea 76: "no bloquea Frontend ni Mobile").

**Estimación**: ~0.5–1 día (tal como indica el spec original, sección "Fase 0 — Backend").

## Rollout

Corresponde a **Release 3** del plan de rollout general del spec original: se despliega antes o junto con Release 2 (Frontend interactivo). No requiere coordinación con Mobile.

## Fuera de alcance de este plan (explícitamente, según el spec)

- No se modifica `Backend/app/models/course_rating.py`.
- No se modifican los schemas en `Backend/app/schemas/rating.py`.
- No se modifican los 6 endpoints de ratings existentes (más allá de envolverlos con el middleware de rate limiting).
- No se agregan endpoints nuevos.
- No se toca `GET /classes/{class_id}` ni el modelo huérfano `Class` (deuda técnica no relacionada con esta feature).
- No se introduce autenticación real ni verificación de identidad (Decisión Arquitectural 1 del spec: ID anónimo, no auth).
