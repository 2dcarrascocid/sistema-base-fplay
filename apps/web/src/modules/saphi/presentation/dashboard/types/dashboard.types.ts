export type MoistureState = 'optimal' | 'moderate' | 'low';
export interface PreviewMetric {
  title: string; value: string; unit: string; status: string; detail: string;
  icon: string; bars?: number[]; progress?: number;
}
export interface VineyardBlock {
  id: string; variety: string; moisture: string; state: MoistureState;
  points: string; labelX: number; labelY: number;
}
export interface AnalyticsPoint { label: string; water: number; moisture: number }
export interface FieldEvent { id: string; icon: string; title: string; description: string; date: string; status: string }
export interface DashboardPreviewData {
  demoLabel: string;
  estate: string; location: string; date: string; time: string;
  user: { name: string; role: string; initials: string };
  navigation: { label: string; icon: string }[];
  metrics: PreviewMetric[]; blocks: VineyardBlock[];
  legend: { state: MoistureState; label: string }[];
  weather: { temperature: string; condition: string; details: { label: string; value: string }[] };
  analytics: AnalyticsPoint[]; activity: FieldEvent[];
}
