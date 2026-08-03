import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CourseDetailComponent } from "../CourseDetail";
import type { CourseDetail } from "@/types";

// Mock de StarRatingInteractive para verificar las props iniciales recibidas
// sin acoplarse a su lógica interna (identidad anónima, fetch de "mi
// rating", submit de create/update). Esa lógica interactiva vive y se
// prueba en StarRatingInteractive.test.tsx; este test se enfoca únicamente
// en que CourseDetail (Server Component) le pase los props correctos.
vi.mock("@/components/StarRatingInteractive/StarRatingInteractive", () => ({
  StarRatingInteractive: (props: {
    courseId: number;
    initialAverageRating: number;
    initialTotalRatings: number;
  }) => (
    <div
      data-testid="star-rating"
      data-course-id={props.courseId}
      data-rating={props.initialAverageRating}
      data-total={props.initialTotalRatings}
    />
  ),
}));

describe("CourseDetailComponent - Rating", () => {
  const baseCourse: CourseDetail = {
    id: 1,
    name: "React Fundamentals",
    description: "Aprende React desde cero",
    thumbnail: "https://example.com/thumbnail.jpg",
    slug: "react-fundamentals",
    classes: [],
  };

  it("renderiza StarRatingInteractive cuando course.average_rating es un número", () => {
    const course: CourseDetail = {
      ...baseCourse,
      average_rating: 4.5,
      total_ratings: 120,
    };

    render(<CourseDetailComponent course={course} />);

    const starRating = screen.getByTestId("star-rating");
    expect(starRating).toBeInTheDocument();
    expect(starRating).toHaveAttribute("data-course-id", "1");
    expect(starRating).toHaveAttribute("data-rating", "4.5");
  });

  it("no renderiza el bloque de rating cuando average_rating es undefined", () => {
    const course: CourseDetail = {
      ...baseCourse,
      average_rating: undefined,
      total_ratings: undefined,
    };

    render(<CourseDetailComponent course={course} />);

    expect(screen.queryByTestId("star-rating")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });

  it("pasa totalRatings correctamente al componente hijo", () => {
    const course: CourseDetail = {
      ...baseCourse,
      average_rating: 3.2,
      total_ratings: 57,
    };

    render(<CourseDetailComponent course={course} />);

    const starRating = screen.getByTestId("star-rating");
    expect(starRating).toHaveAttribute("data-total", "57");
  });
});
