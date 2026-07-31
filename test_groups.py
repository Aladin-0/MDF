import sqlite3
conn = sqlite3.connect('apps/backend/db.sqlite3')
cur = conn.cursor()
cur.execute("SELECT name FROM accounts_ledgergroup;")
print([row[0] for row in cur.fetchall()])
