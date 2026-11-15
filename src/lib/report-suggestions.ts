export interface ReportSuggestion {
  id: string;
  itemName: string;
  category: string | null;
  description: string | null;
  foundLocation: string | null;
  foundDate: string | null;
  imageUrl: string | null;
  score: number;
  label: "Strong" | "Possible" | "Weak";
  reasons: string[];
}
