export interface Assignment {
  id: string;
  name: string;
  category: string;
  dueDate: string;
  score: number | null;
  maxPoints: number;
  percentage: number | null;
  status?: "graded" | "missing" | "pending";
  notes?: string;
}

export interface Class {
  class_id: string;
  class_name: string;
  teacher: string;
  period: string;
  q1_grade: number | null;
  q1_letter_grade: string | null;
  q2_grade: number | null;
  q2_letter_grade: string | null;
  current_grade: number;
  letter_grade: string;
  assignments?: Assignment[];
}

export interface GradesData {
  metadata: {
    last_updated: string;
    most_recent_date: string;
    total_classes: number;
  };
  classes: Class[];
  grade_history: Record<string, Record<string, number>>;
  overall_average: number;
  average_history: Record<string, number>;
}
