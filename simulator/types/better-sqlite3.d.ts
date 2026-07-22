declare module "better-sqlite3" {
  type SqliteValue = string | number | bigint | Uint8Array | null;

  interface Statement {
    all(...params: SqliteValue[]): Record<string, unknown>[];
    get(...params: SqliteValue[]): Record<string, unknown> | undefined;
  }

  interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  class Database {
    constructor(filename: string, options?: Options);
    prepare(sql: string): Statement;
    close(): void;
  }

  namespace Database {
    export { Database };
  }

  export = Database;
}
