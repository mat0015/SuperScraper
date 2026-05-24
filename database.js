import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./data/precios.db");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS precios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT,
            producto TEXT,
            supermercado TEXT,
            precio REAL,
            link TEXT
        )
    `);
});

export default db;