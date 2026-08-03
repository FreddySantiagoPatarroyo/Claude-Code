/**
 * StarRatingInteractive Component Tests
 * Mockea ratingsApi.ts y anonUser.ts para probar la lógica de identidad +
 * hidratación de "mi rating" + create/update en aislamiento del backend real.
 *
 * Nota sobre selectores: los class names de CSS Modules van hasheados en el
 * entorno de test, así que no se puede seleccionar por `.star` literal. Se
 * usa `span[aria-hidden="true"]` (atributo estable) para ubicar los 5 <span>
 * de estrella sin acoplarse al hash ni al <svg> interno (que también lleva
 * aria-hidden pero es un tag distinto).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StarRatingInteractive } from "../StarRatingInteractive";
import { ratingsApi, ApiError } from "@/services/ratingsApi";
import { getOrCreateAnonUserId } from "@/lib/anonUser";
import type { CourseRating } from "@/types/rating";

vi.mock("@/services/ratingsApi", () => ({
  ratingsApi: {
    getUserRating: vi.fn(),
    createRating: vi.fn(),
    updateRating: vi.fn(),
    deleteRating: vi.fn(),
    getRatingStats: vi.fn(),
    getCourseRatings: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock("@/lib/anonUser", () => ({
  getOrCreateAnonUserId: vi.fn(),
}));

const mockedGetUserRating = vi.mocked(ratingsApi.getUserRating);
const mockedCreateRating = vi.mocked(ratingsApi.createRating);
const mockedUpdateRating = vi.mocked(ratingsApi.updateRating);
const mockedGetOrCreateAnonUserId = vi.mocked(getOrCreateAnonUserId);

const ANON_USER = { uuid: "test-uuid", numericId: 12345 };

function makeCourseRating(rating: number): CourseRating {
  return {
    id: 1,
    course_id: 1,
    user_id: ANON_USER.numericId,
    rating,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("StarRatingInteractive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetOrCreateAnonUserId.mockReturnValue(ANON_USER);
  });

  it("mientras el fetch inicial está en curso muestra el rating en modo readonly (sin UI interactiva prematura)", async () => {
    let resolveGetUserRating: (value: CourseRating | null) => void = () => {};
    mockedGetUserRating.mockReturnValue(
      new Promise((resolve) => {
        resolveGetUserRating = resolve;
      })
    );

    const { container } = render(
      <StarRatingInteractive
        courseId={1}
        initialAverageRating={4}
        initialTotalRatings={10}
      />
    );

    // Antes de resolver: readonly, no debe disparar createRating al hacer click.
    const stars = container.querySelectorAll('span[aria-hidden="true"]');
    expect(stars.length).toBeGreaterThan(0);
    fireEvent.click(stars[2]);
    expect(mockedCreateRating).not.toHaveBeenCalled();

    resolveGetUserRating(null);
    await waitFor(() => expect(mockedGetUserRating).toHaveBeenCalled());
  });

  it("al montar llama a getUserRating con courseId y el numericId del usuario anónimo", async () => {
    mockedGetUserRating.mockResolvedValue(null);

    render(
      <StarRatingInteractive
        courseId={42}
        initialAverageRating={3.5}
        initialTotalRatings={8}
      />
    );

    await waitFor(() =>
      expect(mockedGetUserRating).toHaveBeenCalledWith(42, ANON_USER.numericId)
    );
  });

  it("si no había rating previo (getUserRating -> null) y el usuario hace click en la estrella N, llama a createRating", async () => {
    mockedGetUserRating.mockResolvedValue(null);
    mockedCreateRating.mockResolvedValue(makeCourseRating(4));

    const { container } = render(
      <StarRatingInteractive
        courseId={1}
        initialAverageRating={4}
        initialTotalRatings={10}
      />
    );

    await waitFor(() => expect(mockedGetUserRating).toHaveBeenCalled());

    const stars = container.querySelectorAll('span[aria-hidden="true"]');
    fireEvent.click(stars[3]); // cuarta estrella -> índice 4

    await waitFor(() =>
      expect(mockedCreateRating).toHaveBeenCalledWith(1, {
        user_id: ANON_USER.numericId,
        rating: 4,
      })
    );
    expect(mockedUpdateRating).not.toHaveBeenCalled();
  });

  it("si ya existía un rating (getUserRating -> CourseRating) y el usuario cambia su selección, llama a updateRating (no createRating)", async () => {
    mockedGetUserRating.mockResolvedValue(makeCourseRating(2));
    mockedUpdateRating.mockResolvedValue(makeCourseRating(5));

    const { container } = render(
      <StarRatingInteractive
        courseId={1}
        initialAverageRating={4}
        initialTotalRatings={10}
      />
    );

    await waitFor(() => expect(mockedGetUserRating).toHaveBeenCalled());

    const stars = container.querySelectorAll('span[aria-hidden="true"]');
    fireEvent.click(stars[4]); // quinta estrella -> índice 5

    await waitFor(() =>
      expect(mockedUpdateRating).toHaveBeenCalledWith(1, ANON_USER.numericId, {
        user_id: ANON_USER.numericId,
        rating: 5,
      })
    );
    expect(mockedCreateRating).not.toHaveBeenCalled();
  });

  it("muestra el estado de error sin romper el render cuando createRating lanza un ApiError", async () => {
    mockedGetUserRating.mockResolvedValue(null);
    mockedCreateRating.mockRejectedValue(
      new ApiError("El servidor no está disponible", 500, "SERVER_ERROR")
    );

    const { container } = render(
      <StarRatingInteractive
        courseId={1}
        initialAverageRating={4}
        initialTotalRatings={10}
      />
    );

    await waitFor(() => expect(mockedGetUserRating).toHaveBeenCalled());

    const stars = container.querySelectorAll('span[aria-hidden="true"]');
    fireEvent.click(stars[1]);

    expect(
      await screen.findByText("El servidor no está disponible")
    ).toBeInTheDocument();

    // El render sigue en pie: el widget de rating sigue presente.
    expect(
      screen.getByTestId("star-rating-interactive")
    ).toBeInTheDocument();
  });

  it("cuando getOrCreateAnonUserId devuelve null (SSR/no disponible), no llama a getUserRating y renderiza en modo readonly", async () => {
    mockedGetOrCreateAnonUserId.mockReturnValue(null);

    const { container } = render(
      <StarRatingInteractive
        courseId={1}
        initialAverageRating={4.2}
        initialTotalRatings={9}
      />
    );

    await waitFor(() => {
      // No hay forma de calificar: no debe intentar resolver "mi rating".
      expect(mockedGetUserRating).not.toHaveBeenCalled();
    });

    const stars = container.querySelectorAll('span[aria-hidden="true"]');
    fireEvent.click(stars[0]);
    expect(mockedCreateRating).not.toHaveBeenCalled();
  });
});
