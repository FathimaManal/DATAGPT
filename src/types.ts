export type CellValue = string | number | boolean | null;

export type Dataset = {
  tableName: string;
  columns: string[];
  rows: CellValue[][];
  origin: 'sample' | 'csv';
  fileName?: string;
};

export type Message = {
  id: string;
  nlQuery: string;
  sql?: string;
  columns?: string[];
  rows?: CellValue[][];
  rowCount?: number;
  error?: string;
  pending?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

export type QueryResponse = {
  sql: string;
  columns: string[];
  rows: CellValue[][];
  row_count: number;
  error: string | null;
};

export type SampleResponse = {
  table_name: string;
  columns: string[];
  rows: CellValue[][];
};
