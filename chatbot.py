import streamlit as st
import sqlite3
import pandas as pd
import json
from groq import Groq
from supabase import create_client

# --- CONFIGURE CLIENTS ---
client = Groq(api_key=st.secrets["GROQ_API_KEY"])
supabase = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])

# --- SESSION STATES ---
if "conn" not in st.session_state:
    st.session_state.conn = None
if "current_session_id" not in st.session_state:
    st.session_state.current_session_id = None
if "history" not in st.session_state:
    st.session_state.history = []
if "last_source" not in st.session_state:
    st.session_state.last_source = None

# --- SUPABASE FUNCTIONS ---
def create_new_session(title="New Chat"):
    res = supabase.table("chat_sessions").insert({"title": title}).execute()
    return res.data[0]["id"]

def save_message(session_id, nl_query, sql_query, columns, results):
    supabase.table("chat_messages").insert({
        "session_id": session_id,
        "nl_query": nl_query,
        "sql_query": sql_query,
        "columns": json.dumps(columns),
        "results": json.dumps(results)
    }).execute()

def load_messages(session_id):
    res = supabase.table("chat_messages")\
        .select("*")\
        .eq("session_id", session_id)\
        .order("created_at")\
        .execute()
    history = []
    for row in res.data:
        history.append((
            row["nl_query"],
            row["sql_query"],
            json.loads(row["columns"]),
            json.loads(row["results"])
        ))
    return history

def get_all_sessions():
    res = supabase.table("chat_sessions")\
        .select("*")\
        .order("created_at", desc=True)\
        .execute()
    return res.data

def delete_session(session_id):
    supabase.table("chat_sessions").delete().eq("id", session_id).execute()

def update_session_title(session_id, title):
    supabase.table("chat_sessions").update({"title": title}).eq("id", session_id).execute()

# --- GROQ CALL ---
def call_groq_api(natural_language_query: str, schema_info: str):
    try:
        prompt = f"""
        Given this SQLite database schema:
        {schema_info}

        Convert this natural language query to SQL:
        {natural_language_query}

        Return only the SQL query, no explanation, no markdown.
        """
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        sql_query = response.choices[0].message.content.strip()
        sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
        return sql_query if sql_query.endswith(";") else f"{sql_query};"
    except Exception as e:
        st.error(f"Error calling Groq API: {e}")
        return None

# --- DATABASE FUNCTIONS ---
def init_sample_db():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            salary INTEGER NOT NULL
        );
    """)
    sample_data = [
        ("Alice", "Engineering", 90000),
        ("Bob", "HR", 60000),
        ("Charlie", "Finance", 75000),
        ("Diana", "Engineering", 80000),
    ]
    c.executemany("INSERT INTO employees (name, department, salary) VALUES (?, ?, ?)", sample_data)
    conn.commit()
    return conn

def csv_to_sqlite(df, table_name="uploaded_data"):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    df.to_sql(table_name, conn, index=False, if_exists="replace")
    return conn

def extract_schema_info(conn):
    c = conn.cursor()
    c.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
    schema_statements = c.fetchall()
    return "".join(f"{sql};\n" for _, sql in schema_statements)

def run_sql_query(conn, sql_query):
    try:
        c = conn.cursor()
        c.execute(sql_query)
        conn.commit()
        if c.description:
            rows = c.fetchall()
            columns = [desc[0] for desc in c.description]
            return columns, rows
        else:
            return [], f"Query executed successfully. {c.rowcount} row(s) affected."
    except Exception as e:
        return None, str(e)

# --- UI ---
st.title("DataGPT")
st.markdown("***Chat your way through data***")

# --- SIDEBAR ---
with st.sidebar:
    st.markdown("### 💬 Chat Sessions")

    if st.button("➕ New Chat", use_container_width=True):
        st.session_state.current_session_id = create_new_session()
        st.session_state.history = []
        st.rerun()

    sessions = get_all_sessions()
    for session in sessions:
        col1, col2 = st.columns([4, 1])
        with col1:
            is_active = session["id"] == st.session_state.current_session_id
            label = f"**{session['title']}**" if is_active else session["title"]
            if st.button(label, key=f"session_{session['id']}", use_container_width=True):
                st.session_state.current_session_id = session["id"]
                st.session_state.history = load_messages(session["id"])
                st.rerun()
        with col2:
            if st.button("🗑️", key=f"del_{session['id']}"):
                delete_session(session["id"])
                if st.session_state.current_session_id == session["id"]:
                    st.session_state.current_session_id = None
                    st.session_state.history = []
                st.rerun()

# --- DATABASE SELECTION ---
use_sample_db = st.radio("Choose Database Source:", ["Use Sample Inbuilt DB", "Upload CSV file", "Upload SQLite DB file"])

if st.session_state.last_source != use_sample_db:
    st.session_state.conn = None
    st.session_state.last_source = use_sample_db

conn = None
if use_sample_db == "Use Sample Inbuilt DB":
    if st.session_state.conn is None:
        st.session_state.conn = init_sample_db()
    conn = st.session_state.conn
    st.info("Using sample inbuilt database: `employees` table.")

elif use_sample_db == "Upload CSV file":
    uploaded_csv = st.file_uploader("Upload your CSV file", type=["csv"])
    if uploaded_csv is not None:
        if st.session_state.conn is None:
            df = pd.read_csv(uploaded_csv)
            st.success(f"CSV loaded! {df.shape[0]} rows, {df.shape[1]} columns.")
            st.dataframe(df.head())
            st.session_state.conn = csv_to_sqlite(df)
    conn = st.session_state.conn

else:
    uploaded_db = st.file_uploader("Upload your SQLite database file", type=["db", "sqlite"])
    if uploaded_db is not None:
        if st.session_state.conn is None:
            temp_db_path = "temp_uploaded_db.sqlite"
            with open(temp_db_path, "wb") as f:
                f.write(uploaded_db.read())
            st.session_state.conn = sqlite3.connect(temp_db_path, check_same_thread=False)
            st.success("Database loaded successfully!")
    conn = st.session_state.conn

# --- CHAT AREA ---
if conn:
    if st.session_state.current_session_id is None:
        st.session_state.current_session_id = create_new_session()

    schema_info = extract_schema_info(conn)

    st.markdown("### 💬 Chat History")
    if st.session_state.history:
        for nl, sql, columns, results in st.session_state.history:
            st.markdown(f"**You asked:** {nl}")
            st.code(sql, language="sql")
            if columns and results:
                st.dataframe(pd.DataFrame(results, columns=columns))
            elif results:
                st.success(results)
    else:
        st.info("No chat history yet — ask something below 👇")

    st.markdown("---")
    with st.form("chat_form", clear_on_submit=True):
        nl_query = st.text_area("Ask anything about your data:")
        send = st.form_submit_button("Send 🚀")

    if send and nl_query.strip():
        with st.spinner("Thinking..."):
            sql_query = call_groq_api(nl_query, schema_info)
            if sql_query:
                columns, results = run_sql_query(conn, sql_query)

                # auto title the session from first message
                if len(st.session_state.history) == 0:
                    update_session_title(st.session_state.current_session_id, nl_query[:40])

                save_message(st.session_state.current_session_id, nl_query, sql_query, columns, results)
                st.session_state.history.append((nl_query, sql_query, columns, results))
                st.rerun()