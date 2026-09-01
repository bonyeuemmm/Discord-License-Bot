let sqlite3;

try {
  sqlite3 = require("sqlite3");
} catch (_error) {
  const { DatabaseSync } = require("node:sqlite");

  class Database {
    constructor(filename, callback) {
      this.database = new DatabaseSync(filename);
      if (callback) {
        process.nextTick(() => callback.call(this, null));
      }
    }

    configure() {}

    serialize(callback) {
      callback?.();
    }

    run(sql, params, callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }
      try {
        const result = this.database.prepare(sql).run(...(params || []));
        callback?.call(
          {
            lastID: Number(result.lastInsertRowid),
            changes: Number(result.changes),
          },
          null,
        );
      } catch (error) {
        callback?.call(this, error);
      }
      return this;
    }

    get(sql, params, callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }
      try {
        const row = this.database.prepare(sql).get(...(params || []));
        callback?.call(this, null, row);
      } catch (error) {
        callback?.call(this, error);
      }
      return this;
    }

    all(sql, params, callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }
      try {
        const rows = this.database.prepare(sql).all(...(params || []));
        callback?.call(this, null, rows);
      } catch (error) {
        callback?.call(this, error);
      }
      return this;
    }

    exec(sql, callback) {
      try {
        this.database.exec(sql);
        callback?.call(this, null);
      } catch (error) {
        callback?.call(this, error);
      }
      return this;
    }
  }

  sqlite3 = {
    Database,
    verbose() {
      return this;
    },
  };
}

module.exports = sqlite3;
