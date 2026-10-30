// Only the fields rendered by the browser. These DTOs carry no server imports.
export interface NoticePage {
  unread: number;
  items: {
    id: string;
    type: string;
    created_at: string;
    read_at: string | null;
    link: { kind: string };
    context?: string | null;
    action?: import('../partner-studio/presentation').AccessAction | null;
  }[];
}
export interface AuditPage {
  scope: string;
  items: {
    id: string;
    actor: string;
    action: string;
    occurred_at: string;
    context?: string | null;
  }[];
}
