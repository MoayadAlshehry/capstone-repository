import type { QueryResultRow } from 'pg';
export interface TransactionScope {
  readonly transactionId: string;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
}
export interface TransactionRunner {
  run<T>(operation: (scope: TransactionScope) => Promise<T>): Promise<T>;
}
export interface RuntimeDatabase {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
  transactions: TransactionRunner;
  ready(): Promise<void>;
  close(): Promise<void>;
}
