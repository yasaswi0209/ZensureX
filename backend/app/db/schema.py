from sqlalchemy import inspect, text


def ensure_schema(engine):
    """Add the new user columns to an existing database (no manual migration needed)."""
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    have = {c["name"] for c in insp.get_columns("users")}
    wanted = {"last_lat": "FLOAT", "last_lon": "FLOAT", "zone": "VARCHAR"}
    with engine.begin() as conn:
        for name, sql_type in wanted.items():
            if name not in have:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {sql_type}"))
