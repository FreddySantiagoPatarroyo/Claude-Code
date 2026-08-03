// Course types
export interface Course {
  id: number;
  name: string;
  description: string;
  thumbnail: string;
  slug: string;
  // Campos opcionales de rating
  average_rating?: number; // 0.0 - 5.0
  total_ratings?: number; // Cantidad de ratings
  // Conteo de ratings por valor (1-5). El backend serializa las keys del dict
  // Python (int) como strings en JSON, ej. {"1": 0, "2": 3, "3": 10, "4": 25, "5": 40}
  rating_distribution?: Record<string, number>;
}

// Class types
export interface Class {
  id: number;
  title: string;
  description: string;
  video: string;
  duration: number;
  slug: string;
}

// Course Detail type
export interface CourseDetail extends Course {
  description: string;
  classes: Class[];
}

// Progress types
export interface Progress {
  progress: number; // seconds
  user_id: number;
}

// Quiz types
export interface QuizOption {
  id: number;
  answer: string;
  correct: boolean;
}

export interface Quiz {
  id: number;
  question: string;
  options: QuizOption[];
}

// Favorite types
export interface FavoriteToggle {
  course_id: number;
}