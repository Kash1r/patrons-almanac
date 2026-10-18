import duckdb


def test_parquet_round_trip_keeps_rows_and_list_columns(tmp_path):
    path = (tmp_path / "match_player.parquet").as_posix()

    with duckdb.connect() as con:
        con.execute(f"""
            COPY (
                SELECT * FROM (VALUES
                    (1001, 'normal', 9, [0, 120, 240], [0, 800, 2100]),
                    (1002, 'normal', 17, [0, 60], [0, 450])
                ) AS t(match_id, mode, hero_id, time_stamp_s, net_worth)
            ) TO '{path}' (FORMAT PARQUET)
        """)
        rows = con.execute(
            "SELECT * FROM read_parquet(?) ORDER BY match_id", [path]
        ).fetchall()

    assert rows == [
        (1001, "normal", 9, [0, 120, 240], [0, 800, 2100]),
        (1002, "normal", 17, [0, 60], [0, 450]),
    ]
