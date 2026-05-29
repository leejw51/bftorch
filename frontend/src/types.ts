// TypeScript interfaces mirroring PROTOCOL.md (v1).

export interface HealthResponse {
  status: string;
  torch: string;
  device: string;
  mps: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  explanation: string; // markdown
  starter_code: string;
  hint: string;
}

export interface LessonsResponse {
  lessons: Lesson[];
}

/** A single tensor (or numpy array) snapshot returned from /api/run. */
export interface TensorData {
  name: string;
  shape: number[];
  dtype: string;
  // Nested JSON lists (1-D / 2-D / 3-D) or a flattened sample when truncated.
  data: unknown;
  truncated: boolean;
}

export interface RunRequest {
  code: string;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  error: string | null;
  result_repr: string | null;
  duration: number;
  tensors: TensorData[];
}

export type VizKind = 'regression' | 'classification';

export interface Demo {
  key: string;
  label: string;
  description: string;
  viz: VizKind;
}

export interface DemosResponse {
  demos: Demo[];
}

export interface TrainConfig {
  demo: string;
  epochs: number;
  lr: number;
  hidden: number;
  seed: number;
}

/** Wire shape of the regression viz payload (snake_case per protocol). */
export interface RegressionVizWire {
  kind: 'regression';
  x: number[];
  y: number[];
  y_pred: number[];
}

export interface ClassificationGrid {
  xs: number[];
  ys: number[];
  probs: number[][]; // G×G prob of class-1, rows indexed by ys
}

export interface ClassificationVizWire {
  kind: 'classification';
  points: [number, number][];
  labels: number[];
  grid: ClassificationGrid;
}

export type TrainViz = RegressionVizWire | ClassificationVizWire;

export interface TrainFrame {
  type: 'frame';
  epoch: number;
  total: number;
  loss: number;
  metric: number | null;
  metric_name: string | null;
  loss_history: number[];
  log: string;
  done: boolean;
  viz: TrainViz;
}

export interface TrainError {
  type: 'error';
  message: string;
}

export type TrainMessage = TrainFrame | TrainError;

// ---- Visualizer-facing shapes (what scene.ts consumes) ----

export interface RegressionViz {
  x: number[];
  y: number[];
  yPred: number[];
}

export interface ClassificationViz {
  points: [number, number][];
  labels: number[];
  grid: ClassificationGrid;
}
