import { useRef, useState } from 'react';
import Papa from 'papaparse';
import type { CellValue, Dataset } from '../types';

type Props = {
  dataset: Dataset | null;
  loading: boolean;
  error: string | null;
  onUseSample: () => void;
  onLoadCsv: (data: Dataset) => void;
};

function inferCell(value: string): CellValue {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isNaN(n) && value.trim() !== '' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return n;
  }
  return value;
}

export default function SourcePicker({ dataset, loading, error, onUseSample, onLoadCsv }: Props) {
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = (file: File) => {
    setCsvError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        if (!data.length) {
          setCsvError('CSV appears to be empty');
          return;
        }
        const columns = Object.keys(data[0]);
        const rows: CellValue[][] = data.map((row) => columns.map((c) => inferCell(row[c] ?? '')));
        const tableName = file.name.replace(/\.csv$/i, '').replace(/[^A-Za-z0-9_]/g, '_') || 'uploaded_data';
        onLoadCsv({ tableName, columns, rows, origin: 'csv', fileName: file.name });
      },
      error: (err) => setCsvError(err.message),
    });
  };

  return (
    <section className="source">
      <div className="source__cards">
        <button
          className={`source__card ${dataset?.origin === 'sample' ? 'is-active' : ''}`}
          onClick={onUseSample}
          disabled={loading}
        >
          <div className="source__card-title">Sample dataset</div>
          <div className="source__card-desc">10-row employees table — quick demo.</div>
          {loading && <div className="source__card-meta">Loading…</div>}
        </button>

        <label
          className={`source__card ${dataset?.origin === 'csv' ? 'is-active' : ''}`}
          onClick={(e) => {
            if (e.target instanceof HTMLInputElement) return;
            fileInputRef.current?.click();
          }}
        >
          <div className="source__card-title">Upload CSV</div>
          <div className="source__card-desc">Pick any .csv file — parsed in your browser.</div>
          {dataset?.origin === 'csv' && (
            <div className="source__card-meta">
              {dataset.fileName} · {dataset.rows.length} rows · {dataset.columns.length} cols
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCsvUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {(error || csvError) && <div className="source__error">{error || csvError}</div>}

      {dataset && (
        <div className="source__preview">
          <div className="source__preview-head">
            <span className="badge">{dataset.tableName}</span>
            <span className="muted">
              {dataset.rows.length} rows · {dataset.columns.length} columns
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {dataset.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j}>{v === null ? '' : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {dataset.rows.length > 5 && (
              <div className="table-wrap__more">…showing first 5 of {dataset.rows.length}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
