export type PortfolioTemplateFormat = "html" | "pdf";

export interface PortfolioTemplate {
  id: string;
  title: string;
  template_format: PortfolioTemplateFormat;
  html_content: string | null;
  file_url: string | null;
  placeholder_fields: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentPortfolioEntry {
  id: string;
  student_id: string;
  template_id: string;
  field_values: Record<string, string>;
  updated_at: string;
}
