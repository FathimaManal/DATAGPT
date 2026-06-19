import os
import re
import sqlite3
from typing import Any, List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

app = FastAPI(title="DataGPT API")
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

SAMPLE_TABLE = "employees"
SAMPLE_COLUMNS = ["id", "name", "department", "salary"]
SAMPLE_ROWS: List[List[Any]] = [
    [1, "Alice", "Engineering", 90000],
    [2, "Bob", "HR", 60000],
    [3, "Charlie", "Finance", 75000],
    [4, "Diana", "Engineering", 80000],
    [5, "Evan", "Engineering", 110000],
    [6, "Fiona", "Marketing", 72000],
    [7, "George", "Finance", 68000],
    [8, "Hannah", "HR", 58000],
    [9, "Ian", "Engineering", 95000],
    [10, "Julia", "Marketing", 85000],
]


class QueryRequest(BaseModel):
    table_name: str = "data"
    columns: List[str]
    rows: List[List[Any]]
    nl_query: str


class QueryResponse(BaseModel):
    sql: str
    columns: List[str]
    rows: List[List[Any]]
    row_count: int = 0
    error: Optional[str] = None


def _safe_identifier(name: str, fallback: str = "data") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name or "")
    cleaned = cleaned.lstrip("0123456789_")
    return cleaned or fallback


def _infer_type(values: List[Any]) -> str:
    saw_int = saw_float = saw_text = False
    for v in values:
        if v is None or v == "":
            continue
        if isinstance(v, bool):
            saw_int = True
        elif isinstance(v, int):
            saw_int = True
        elif isinstance(v, float):
            saw_float = True
        else:
            saw_text = True
    if saw_text:
        return "TEXT"
    if saw_float:
        return "REAL"
    if saw_int:
        return "INTEGER"
    return "TEXT"


def _build_sqlite(table_name: str, columns: List[str], rows: List[List[Any]]):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    cursor = conn.cursor()

    safe_table = _safe_identifier(table_name, "data")
    safe_cols = [_safe_identifier(c, f"col_{i}") for i, c in enumerate(columns)]

    col_types = []
    for i in range(len(safe_cols)):
        values = [r[i] if i < len(r) else None for r in rows]
        col_types.append(_infer_type(values))

    cols_decl = ", ".join(f'"{c}" {t}' for c, t in zip(safe_cols, col_types))
    cursor.execute(f'CREATE TABLE "{safe_table}" ({cols_decl})')

    if rows:
        placeholders = ", ".join("?" * len(safe_cols))
        normalized_rows = []
        for r in rows:
            padded = list(r) + [None] * (len(safe_cols) - len(r))
            normalized_rows.append(padded[: len(safe_cols)])
        cursor.executemany(
            f'INSERT INTO "{safe_table}" VALUES ({placeholders})', normalized_rows
        )
    conn.commit()
    return conn, safe_table


def _schema_text(conn) -> str:
    cursor = conn.cursor()
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")
    rows = cursor.fetchall()
    return ";\n".join(r[0] for r in rows) + ";"


def _strip_sql(text: str) -> str:
    s = text.strip()
    s = s.replace("```sql", "").replace("```SQL", "").replace("```", "").strip()
    for prefix in ("SQL:", "Query:", "sql:", "query:", "Answer:"):
        if s.startswith(prefix):
            s = s[len(prefix):].strip()
    # Drop leading lines that look like prose (no SELECT/INSERT/etc on first line)
    lines = s.splitlines()
    sql_keywords = ("select", "with", "insert", "update", "delete", "create", "drop", "pragma")
    for i, line in enumerate(lines):
        if line.strip().lower().startswith(sql_keywords):
            s = "\n".join(lines[i:]).strip()
            break
    if not s.endswith(";"):
        s += ";"
    return s


def _sample_rows_text(columns: List[str], rows: List[List[Any]], n: int = 3) -> str:
    sample = rows[:n]
    if not sample:
        return "(no rows)"
    lines = [" | ".join(columns)]
    for r in sample:
        lines.append(" | ".join("" if v is None else str(v) for v in r))
    return "\n".join(lines)


def _call_groq(nl_query: str, schema: str, sample_text: str = "") -> str:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server")
    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "You are a SQL generator. Convert the user's natural-language question into a single "
        "SQLite-compatible SQL query.\n\n"
        f"Schema:\n{schema}\n\n"
        f"Sample rows (for value reference — match exact casing of string values):\n{sample_text}\n\n"
        f"Question: {nl_query}\n\n"
        "Rules:\n"
        "- Return ONLY the SQL query. No explanation, no markdown, no prose.\n"
        "- Match the casing of string values exactly as shown in the sample rows.\n"
        "- For case-insensitive matches on text, use LOWER(column) = LOWER('value').\n"
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=600,
    )
    return _strip_sql(response.choices[0].message.content)


@router.get("/health")
def health():
    return {"ok": True, "model": MODEL, "groq_configured": bool(GROQ_API_KEY)}


@router.get("/sample")
def sample():
    return {
        "table_name": SAMPLE_TABLE,
        "columns": SAMPLE_COLUMNS,
        "rows": SAMPLE_ROWS,
    }


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    if not req.nl_query or not req.nl_query.strip():
        raise HTTPException(status_code=400, detail="nl_query is empty")
    if not req.columns:
        raise HTTPException(status_code=400, detail="columns is empty")

    conn, _ = _build_sqlite(req.table_name, req.columns, req.rows)
    schema = _schema_text(conn)
    sample_text = _sample_rows_text(req.columns, req.rows)

    try:
        sql = _call_groq(req.nl_query, schema, sample_text)
    except HTTPException:
        raise
    except Exception as e:
        return QueryResponse(sql="", columns=[], rows=[], error=f"LLM error: {e}")

    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        if cursor.description:
            result_cols = [d[0] for d in cursor.description]
            result_rows = [list(r) for r in cursor.fetchall()]
            return QueryResponse(
                sql=sql,
                columns=result_cols,
                rows=result_rows,
                row_count=len(result_rows),
            )
        conn.commit()
        return QueryResponse(
            sql=sql,
            columns=[],
            rows=[],
            row_count=cursor.rowcount if cursor.rowcount >= 0 else 0,
        )
    except Exception as e:
        return QueryResponse(sql=sql, columns=[], rows=[], error=str(e))


# Mount routes both under "/" and under "/api/" so the same code works
# whether Vercel forwards the original path or the rewritten path.
app.include_router(router)
app.include_router(router, prefix="/api")
