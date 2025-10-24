import streamlit as st
import sqlite3
import os
import pandas as pd
import google.generativeai as genai

# --- CONFIGURE GEMINI ---
genai.configure(api_key=st.secrets["GOOGLE_GEMINI_API_KEY"])

# --- SESSION STATES ---
if "history" not in st.session_state:
    st.session_state.history = []  # [(nl_query, sql_query, columns, results)]
if "nl_query" not in st.session_state:
    st.session_state.nl_query = ""
if "selected_model" not in st.session_state:
    st.session_state.selected_model = "gemini-1.5-flash"

# --- HELPER: FETCH MODEL LIST ---
def get_available_models():
    try:
        models = genai.list_models()
        model_names = [m.name.split("/")[-1] for m in models if "generateContent" in m.supported_generation_methods]
        return sorted(model_names)
    except Exception as e:
        st.error(f"Error fetching models: {e}")
        return ["gemini-1.5-flash", "gemini-1.5-pro"]

# --- GEMINI CALL ---
def call_gemini_api(natural_language_query: str, schema_info: str, model_name: str):
    """
    Calls Google Gemini API to convert natural language to SQL.
    """
    try:
        model = genai.GenerativeModel(model_name)
        prompt = f"""
        Given this SQLite database schema:
        {schema_info}

        Convert this natural language query to SQL:
        {natural_language_query}

        Return only the SQL query, no explanation.
        """

        response = model.generate_content(prompt)
        sql_query = response.text.strip()
        sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
        return sql_query if sql_query.endswith(";") else f"{sql_query};"
    except Exception as e:
        st.error(f"Error calling Gemini API: {e}")
        return None

# --- DATABASE FUNCTIONS ---
def init_sample_db():
    conn = sqlite3.connect("sample_memory.db", check_same_thread=False)
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

def extract_schema_info(conn):
    c = conn.cursor()
    c.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
    schema_statements = c.fetchall()
    schema_text = ""
    for name, sql in schema_statements:
        schema_text += f"{sql};\n"
    return schema_text

def run_sql_query(conn, sql_query):
    try:
        c = conn.cursor()
        c.execute(sql_query)
        conn.commit()
        if c.description:  # SELECT queries
            rows = c.fetchall()
            columns = [desc[0] for desc in c.description]
            return columns, rows
        else:  # INSERT, UPDATE, DELETE
            return [], f"Query executed successfully. {c.rowcount} row(s) affected."
    except Exception as e:
        return None, str(e)

# --- UI ---
st.title("DataGPT")

st.markdown("***Chat your way through data***")


# Model selection
available_models = get_available_models()
selected_model = st.selectbox(
    "Select a Gemini Model:",
    options=available_models,
    index=available_models.index(st.session_state.selected_model)
    if st.session_state.selected_model in available_models
    else 0,
)
st.session_state.selected_model = selected_model

# Database selection
use_sample_db = st.radio("Choose Database Source:", ["Use Sample Inbuilt DB", "Upload SQLite DB file"])

conn = None
if use_sample_db == "Use Sample Inbuilt DB":
    conn = init_sample_db()
    st.info("Using sample inbuilt database: `employees` table.")
else:
    uploaded_db = st.file_uploader("Upload your SQLite database file", type=["db", "sqlite"])
    if uploaded_db is not None:
        temp_db_path = "temp_uploaded_db.sqlite"
        with open(temp_db_path, "wb") as f:
            f.write(uploaded_db.read())
        conn = sqlite3.connect(temp_db_path, check_same_thread=False)
        st.success("Database loaded successfully!")

# --- CHAT AREA ---
if conn:
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

    # Input area at bottom
    st.markdown("---")
    with st.form("chat_form", clear_on_submit=True):  # 👈 this clears the text box automatically
        nl_query = st.text_area("Enter your natural language query here:")
        send = st.form_submit_button("Send 🚀")

    if send and nl_query.strip():
        with st.spinner("Generating SQL and running query..."):
            sql_query = call_gemini_api(nl_query, schema_info, selected_model)
            if sql_query:
                columns, results = run_sql_query(conn, sql_query)
                st.session_state.history.append((nl_query, sql_query, columns, results))
                st.rerun()

# Cleanup uploaded DB
if 'temp_db_path' in locals() and os.path.exists(temp_db_path):
    os.remove(temp_db_path)
