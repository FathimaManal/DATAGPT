import type { CellValue } from '../types';

type Props = {
  columns: string[];
  rows: CellValue[][];
};

function format(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString();
    return Number(v.toFixed(4)).toLocaleString();
  }
  return String(v);
}

export default function ResultsTable({ columns, rows }: Props) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : ''}>
                  {format(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
