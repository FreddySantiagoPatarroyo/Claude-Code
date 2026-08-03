# Platziflix

plataforma online de cursos, cada cursos tiene clases, descripciones y no hay mucho mas, eso es el inicio.

## Stacks

### Frontend
- Typescript
- CSS modules
- SASS

### Mobile
- iOS:
    - Swift
    - SwiftUI
- Android:
    - Kotlin
    - Jetpack Compose

### Backend
- Python
- FastAPI
- PostgreSQl

## Contratos

### Entidades
1. Curso
2. Clases
3. Profesor

### Contratos


- Course
```json
{
    "id": 1,
    "name": "Curso de React",
    "description": "Curso de React",
    "thumbnail": "https://via.placeholder.com/150", 
    "slug": "curso-de-react",
    "created_at": "2021-01-01",
    "updated_at": "2021-01-01",
    "deleted_at": "2021-01-01",
    "teacher_id": [1, 2, 3]
}
```

- Clases:
```json
{
    "id": 1, 
    "course_id": 1, 
    "name": "Clase 1",
    "description": "Clase 1",
    "slug": "clase-1",
    "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "created_at": "2021-01-01",
    "updated_at": "2021-01-01",
    "deleted_at": "2021-01-01"
}
```

- Teacher
```json
{
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@example.com",
    "created_at": "2021-01-01",
    "updated_at": "2021-01-01",
    "deleted_at": "2021-01-01"
}
```

### Endpoints

- GET /courses -> Listar todos los cursos
```json
[
    {
        "id": 1,
        "name": "Curso de React",
        "description": "Curso de React",
        "thumbnail": "https://via.placeholder.com/150", 
        "slug": "curso-de-react",
    }
]
```

- GET /courses/:slug -> Obtener un curso
```json
{
    "id": 1,
    "name": "Curso de React",
    "description": "Curso de React",
    "thumbnail": "https://via.placeholder.com/150", 
    "slug": "curso-de-react",
    "teacher_id": [1, 2, 3],
    "classes": [
        {
            "id": 1,
            "name": "Clase 1",
            "description": "Clase 1",
            "slug": "clase-1",
        }
    ]
}
```
- GET /courses/:slug/classes/:id -> Obtener una clase
```json
{
    "id": 1,
    "name": "Clase 1",
    "description": "Clase 1",
    "slug": "clase-1",
    "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "created_at": "2021-01-01",
    "updated_at": "2021-01-01",
    "deleted_at": "2021-01-01"
}
```

## Decisiones Arquitecturales y Riesgos Aceptados

### Decisión Arquitectural 2: Sin verificación criptográfica de identidad en ratings

Los endpoints de escritura de ratings (`POST /courses/{course_id}/ratings`, `PUT /courses/{course_id}/ratings/{user_id}`, `DELETE /courses/{course_id}/ratings/{user_id}`) no verifican criptográficamente la identidad del usuario que hace la request. El backend únicamente valida que el `user_id` del body coincida con el `user_id` del path (ver `Backend/app/main.py`, validación en `update_course_rating`). No existe autenticación real (token, sesión, JWT); es consistente con la Decisión Arquitectural 1 del spec original (`spec/00_sistema_rating_cursos.md`): ID de usuario anónimo, sin auth.

**Riesgo aceptado**: cualquier cliente puede enviar cualquier `user_id` arbitrario en el body y "calificar" en nombre de otro usuario, ya que no hay verificación de que quien hace la request sea realmente ese usuario.

**Mitigaciones**:
1. **Constraint único de base de datos**: la tabla `course_ratings` tiene un constraint único compuesto `uq_course_ratings_user_course_deleted` sobre `(course_id, user_id, deleted_at)` (ver migración `Backend/app/alembic/versions/0e3a8766f785_add_course_ratings_table.py`). Esto garantiza que un mismo `user_id` no puede tener más de un rating activo por curso, acotando el impacto de un abuso a "un rating por user_id suplantado", no a inflar arbitrariamente el promedio con múltiples registros para el mismo `user_id`.
2. **Rate limiting por IP**: los 3 endpoints de escritura tienen un límite de 5 peticiones/minuto y 30/hora por IP (implementado con `slowapi`). Esto no impide la suplantación de un `user_id` puntual, pero hace impráctico automatizar abuso a gran escala (por ejemplo, un script que recorra muchos `user_id` distintos contra el mismo curso desde la misma IP para manipular su rating promedio).

Estas mitigaciones son fricción, no un bloqueo criptográfico. Un actor decidido con múltiples IPs, o que ya conoce el `user_id` legítimo de la víctima, todavía puede suplantar un rating puntual. Cerrar ese gap por completo requeriría autenticación real, explícitamente fuera de alcance de este plan (ver `spec/02_plan_backend_ratings.md`, sección "Fuera de alcance").