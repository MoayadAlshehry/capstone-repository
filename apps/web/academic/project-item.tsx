'use client';
import Link from 'next/link';
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  Button,
} from '@capstone/ui/workspace-v2';
import type { ReactNode } from 'react';
import { ProjectCover } from '@capstone/ui/visual-media';
export function authorCountText(locale: 'en' | 'ar', count: number) {
  return locale === 'ar'
    ? `عدد المؤلفين: ${count}`
    : `${count} ${count === 1 ? 'author' : 'authors'}`;
}
export function ProjectItem({
  id,
  title,
  openHref,
  context,
  status,
  children,
  action,
  state,
}: {
  id: string;
  title: string;
  openHref: string;
  context: ReactNode;
  status: ReactNode;
  state?: string | undefined;
  children?: ReactNode;
  action?: { href: string; label: string } | undefined;
}) {
  return (
    <Item
      role="listitem"
      id={'project-item-' + id}
      className="af-project-item"
      data-ws-state={state}
      size="sm"
    >
      <ProjectCover projectId={id} className="visual-project-thumb" />
      <ItemContent>
        <ItemTitle>
          <Link className="af-project-title" href={openHref}>
            <bdi dir="auto">{title}</bdi>
          </Link>
        </ItemTitle>
        <div className="af-project-context">{context}</div>
        {children}
      </ItemContent>
      <div className="af-project-status">{status}</div>
      <ItemActions>
        {action && (
          <Button className="af-project-task" asChild variant="outline">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}
