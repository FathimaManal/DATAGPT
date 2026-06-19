import type { CellValue, QueryResponse, SampleResponse } from './types';

const API_BASE = '';

export async function fetchSample(): Promise<SampleResponse> {
  const res = await fetch(`${API_BASE}/api/sample`);
  if (!res.ok) throw new Error(`Sample fetch failed: ${res.status}`);
  return res.json();
}

export async function runQuery(args: {
  tableName: string;
  columns: string[];
  rows: CellValue[][];
  nlQuery: string;
}): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_name: args.tableName,
      columns: args.columns,
      rows: args.rows,
      nl_query: args.nlQuery,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function pingHealth(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/health`);
  } catch {
    /* warm-up only; ignore errors */
  }
}
