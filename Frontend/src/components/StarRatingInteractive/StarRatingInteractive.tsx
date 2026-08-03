"use client";

/**
 * StarRatingInteractive Component
 *
 * Único Client Component del sistema de rating (ver spec/00_sistema_rating_cursos.md,
 * Decisión Arquitectural 3): resuelve la identidad anónima del visitante
 * (Frontend/src/lib/anonUser.ts), hidrata "mi rating" existente vía
 * `ratingsApi.getUserRating`, y maneja hover/selección llamando a
 * `ratingsApi.createRating`/`updateRating`.
 *
 * `initialAverageRating`/`initialTotalRatings` llegan ya resueltos desde el
 * Server Component padre (`CourseDetail.tsx`) — no se vuelven a pedir por
 * fetch de cliente, solo sirven de valor base mientras no hay
 * hover/selección propia.
 */

import { useEffect, useState } from "react";
import { StarRating } from "@/components/StarRating/StarRating";
import { ratingsApi, ApiError } from "@/services/ratingsApi";
import { getOrCreateAnonUserId } from "@/lib/anonUser";
import type { RatingState } from "@/types/rating";
import styles from "./StarRatingInteractive.module.scss";

interface StarRatingInteractiveProps {
  courseId: number;
  initialAverageRating: number;
  initialTotalRatings: number;
}

export const StarRatingInteractive = ({
  courseId,
  initialAverageRating,
  initialTotalRatings,
}: StarRatingInteractiveProps) => {
  // Carga inicial: resolver identidad anónima + "mi rating" previo (si existe).
  const [isInitializing, setIsInitializing] = useState(true);
  const [numericUserId, setNumericUserId] = useState<number | null>(null);

  // Estado de interacción del visitante.
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<RatingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveIdentityAndRating() {
      const anonUser = getOrCreateAnonUserId();

      if (!anonUser) {
        // SSR o localStorage no disponible: no se puede calificar en esta
        // sesión, pero el render no debe romperse (se queda en modo readonly).
        if (!cancelled) setIsInitializing(false);
        return;
      }

      if (!cancelled) setNumericUserId(anonUser.numericId);

      try {
        const existing = await ratingsApi.getUserRating(
          courseId,
          anonUser.numericId
        );
        if (!cancelled && existing) {
          setSelectedRating(existing.rating);
        }
      } catch {
        // Error inesperado (no 404, ya manejado dentro de getUserRating):
        // se trata como "sin rating previo" para no bloquear la
        // interactividad; un fallo real en la escritura se reportará al
        // intentar calificar.
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    void resolveIdentityAndRating();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const canRate = numericUserId !== null;

  const handleHover = (star: number) => {
    if (submitState === "loading") return;
    setHoveredStar(star);
  };

  const handleSelect = async (star: number) => {
    if (submitState === "loading" || numericUserId === null) return;

    const previousRating = selectedRating;
    const hadExistingRating = previousRating !== null;

    setSubmitState("loading");
    setErrorMessage(null);

    try {
      const result = hadExistingRating
        ? await ratingsApi.updateRating(courseId, numericUserId, {
            user_id: numericUserId,
            rating: star,
          })
        : await ratingsApi.createRating(courseId, {
            user_id: numericUserId,
            rating: star,
          });

      setSelectedRating(result.rating);
      setSubmitState("success");
    } catch (error) {
      // Revertir al estado anterior: la escritura falló, no se queda una
      // selección "fantasma" que no existe en el servidor.
      setSelectedRating(previousRating);
      setSubmitState("error");
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "No se pudo guardar tu calificación. Intenta de nuevo."
      );
    }
  };

  // Mientras se resuelve identidad + "mi rating" previo, o si no hay forma
  // de identificar al visitante (SSR/localStorage bloqueado), se muestra el
  // rating de solo lectura con los valores iniciales del servidor. Evita
  // parpadeo/layout shift y evita doble submit antes de tiempo.
  if (isInitializing || !canRate) {
    return (
      <div className={styles.container} data-testid="star-rating-interactive">
        <StarRating
          rating={initialAverageRating}
          totalRatings={initialTotalRatings}
          showCount={true}
          size="medium"
          readonly={true}
        />
      </div>
    );
  }

  const displayedRating = hoveredStar ?? selectedRating ?? initialAverageRating;
  const isSubmitting = submitState === "loading";

  return (
    <div
      className={styles.container}
      data-testid="star-rating-interactive"
      onMouseLeave={() => setHoveredStar(null)}
    >
      <StarRating
        rating={displayedRating}
        totalRatings={initialTotalRatings}
        showCount={true}
        size="medium"
        readonly={isSubmitting}
        onHover={handleHover}
        onSelect={handleSelect}
        className={
          submitState === "success"
            ? styles.success
            : submitState === "error"
            ? styles.error
            : undefined
        }
      />

      {isSubmitting && (
        <span className={styles.status} role="status">
          Guardando calificación…
        </span>
      )}

      {submitState === "success" && (
        <span className={styles.status} role="status">
          ¡Gracias por tu calificación!
        </span>
      )}

      {submitState === "error" && errorMessage && (
        <span className={styles.errorMessage} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
};
