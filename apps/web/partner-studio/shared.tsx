'use client';
import Link from 'next/link';
import { useState, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Button,
  Item,
  ItemGroup,
  Field,
  FieldLabel,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@capstone/ui/workspace-v2';
import type { NoticePage, AuditPage } from '../governance/types';
import {
  auditActionMessage,
  auditActionPresentation,
} from '@capstone/domain/notification-types';
import { copy, noticeLabel, noticeActionLabel, type Locale } from './model';
import { PartnerHeader, Stamp, AccessTaskLink } from './studio';
export function ContextInbox({
  locale,
  actor,
  data,
}: {
  locale: Locale;
  actor: string;
  data: NoticePage;
}) {
  const router = useRouter(),
    path = usePathname(),
    sp = useSearchParams(),
    t = (e: string, a: string) => copy(locale, e, a),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    lock = useRef(false);
  async function read(id?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      const r = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify({
          operation: id ? 'read' : 'read-all',
          ...(id ? { id } : {}),
        }),
      });
      if (!r.ok) throw Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const items = data.items.slice(0, 20),
    last = items.at(-1);
  return (
    <section
      className="ps-page"
      data-template="context-inbox"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Inbox', 'الوارد')}
        description={t(
          'Updates addressed to you. Task links check current permissions.',
          'مستجدات موجهة إليك. تتحقق روابط المهام من الأذونات الحالية.',
        )}
      >
        <Button
          variant="outline"
          disabled={busy || data.unread === 0}
          onClick={() => void read()}
        >
          {t('Mark all read', 'تحديد الكل كمقروء')}
        </Button>
      </PartnerHeader>
      <div className="ps-actions">
        <span>
          {data.unread} {t('unread', 'غير مقروء')}
        </span>
        <Button asChild variant="outline">
          <Link
            href={path + (sp.get('unread') === 'true' ? '' : '?unread=true')}
          >
            {sp.get('unread') === 'true'
              ? t('Show all', 'عرض الكل')
              : t('Show unread', 'عرض غير المقروء')}
          </Link>
        </Button>
      </div>
      {error && (
        <p dir="auto" role="alert">
          {t(
            'Read status could not be confirmed. Retry; marking read is safe to repeat.',
            'تعذر تأكيد حالة القراءة. أعد المحاولة؛ يمكن تكرار تحديد المقروء بأمان.',
          )}
        </p>
      )}
      <ItemGroup role={items.length ? 'list' : undefined}>
        {items.map((n) => (
          <Item
            key={n.id}
            className="ps-row ps-notice-row"
            role="listitem"
            data-ws-unread={!n.read_at}
          >
            <div>
              <h2 dir="auto">{noticeLabel(locale, n.type)}</h2>
              <p dir="auto" className="ps-notice-context">
                {n.context}
              </p>
              <p dir="auto">
                <Stamp locale={locale} value={n.created_at} /> ·{' '}
                {n.read_at ? t('Read', 'مقروء') : t('Unread', 'غير مقروء')}
              </p>
            </div>
            <div className="ps-actions">
              {n.action && (
                <AccessTaskLink
                  locale={locale}
                  action={n.action}
                  label={noticeActionLabel(locale, n.type, n.link.kind)}
                />
              )}
              {!n.read_at && (
                <Button
                  pending={busy}
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void read(n.id)}
                >
                  {t('Mark read', 'تحديد كمقروء')}
                </Button>
              )}
            </div>
          </Item>
        ))}
      </ItemGroup>
      {!items.length && (
        <div className="ps-empty">
          <h2 dir="auto">
            {t('No updates in this view', 'لا توجد مستجدات في هذا العرض')}
          </h2>
          <p dir="auto">
            {t(
              'New eligibility and project access decisions will appear here.',
              'ستظهر هنا القرارات الجديدة بشأن الأهلية ووصول المشاريع.',
            )}
          </p>
        </div>
      )}
      {data.items.length > 20 && last && (
        <Button asChild variant="outline">
          <Link
            href={
              path +
              '?' +
              new URLSearchParams({
                before: last.created_at,
                beforeId: last.id,
                ...(sp.get('unread') === 'true' ? { unread: 'true' } : {}),
              })
            }
          >
            {t('Older updates', 'مستجدات أقدم')}
          </Link>
        </Button>
      )}
    </section>
  );
}
export function AuditRecord({
  locale,
  actor,
  data,
  filters,
  platform,
  institutions = [],
  parent,
}: {
  locale: Locale;
  actor: string;
  data: AuditPage;
  filters: Record<string, string>;
  platform: boolean;
  parent: string;
  institutions?: { id: string; name: string }[];
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    [view, setView] = useState(data),
    [availableActions, setAvailableActions] = useState(() => [
      ...new Set([
        ...data.items.map((item) => item.action),
        ...(filters.action ? [filters.action] : []),
      ]),
    ]),
    [action, setAction] = useState(filters.action ?? ''),
    [oversight, setOversight] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    lock = useRef(false),
    command = useRef<string>('');
  async function query(older = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    const last = view.items.slice(0, 20).at(-1),
      body = {
        filters: {
          ...Object.fromEntries(
            Object.entries(filters).filter(([key]) => key !== 'action'),
          ),
          ...(action ? { action } : {}),
          ...(older && last
            ? { before: last.occurred_at, beforeId: last.id }
            : {}),
        },
        ...(oversight
          ? {
              oversight,
              reason: reason.trim(),
              command: command.current || crypto.randomUUID(),
            }
          : {}),
      };
    if ('command' in body) command.current = body.command!;
    try {
      const r = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      const next = (await r.json()) as AuditPage;
      setView(next);
      setAvailableActions((current) => [
        ...new Set([...current, ...next.items.map((item) => item.action)]),
      ]);
      command.current = '';
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="ps-page"
      data-template="scoped-audit"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Scoped audit', 'التدقيق المحدد')}
        description={t(
          'Read-only events within your current authority. Institutional oversight is explicitly recorded.',
          'أحداث للقراءة فقط ضمن صلاحيتك الحالية. يُسجل الإشراف المؤسسي صراحة.',
        )}
        back={parent}
      />
      <form
        className="ps-audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void query();
        }}
      >
        <Field>
          <FieldLabel htmlFor="audit-action">
            {t('Event action filter', 'تصفية إجراء الحدث')}
          </FieldLabel>
          <Select
            value={action || 'all'}
            onValueChange={(v) => {
              setAction(v === 'all' ? '' : v);
              command.current = '';
            }}
          >
            <SelectTrigger
              id="audit-action"
              aria-label={t('Audit event filter', 'تصفية أحداث التدقيق')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="wsv2">
              {['all', ...availableActions].map((a) => (
                <SelectItem key={a} value={a}>
                  {a === 'all'
                    ? t('All events', 'كل الأحداث')
                    : auditActionMessage(a, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {platform && (
          <>
            <Field>
              <FieldLabel>
                {t('Institutional oversight', 'الإشراف المؤسسي')}
              </FieldLabel>
              <Select
                value={oversight || 'platform'}
                onValueChange={(v) => {
                  setOversight(v === 'platform' ? '' : v);
                  command.current = '';
                }}
              >
                <SelectTrigger
                  aria-label={t('Audit institution', 'مؤسسة التدقيق')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="wsv2">
                  <SelectItem value="platform">
                    {t('Platform events', 'أحداث المنصة')}
                  </SelectItem>
                  {institutions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {oversight && (
              <Field>
                <FieldLabel htmlFor="audit-reason">
                  {t('Oversight reason', 'سبب الإشراف')}
                </FieldLabel>
                <Textarea
                  id="audit-reason"
                  dir="auto"
                  value={reason}
                  minLength={3}
                  maxLength={400}
                  required
                  disabled={busy}
                  onChange={(e) => {
                    setReason(e.target.value);
                    command.current = '';
                  }}
                />
              </Field>
            )}
          </>
        )}
        <Button disabled={busy || (!!oversight && reason.trim().length < 3)}>
          {t('Read scoped events', 'قراءة الأحداث المحددة')}
        </Button>
      </form>
      {error && (
        <p dir="auto" role="alert">
          {t(
            'This query could not be confirmed. Check your scope and retry.',
            'تعذر تأكيد هذا الاستعلام. تحقق من نطاقك وأعد المحاولة.',
          )}
        </p>
      )}
      <ItemGroup role={view.items.length ? 'list' : undefined}>
        {view.items.slice(0, 20).map((x) => (
          <Item key={x.id} className="ps-row" role="listitem">
            <div className="ps-audit-row">
              <strong
                data-tone={auditActionPresentation(x.action)?.tone ?? 'neutral'}
              >
                {auditActionMessage(x.action, locale)}
              </strong>
              {x.context && <p dir="auto">{x.context}</p>}
              <span dir="auto">{x.actor}</span>
              <Stamp locale={locale} value={x.occurred_at} />
              <details className="ps-audit-details">
                <summary>{t('Technical details', 'التفاصيل التقنية')}</summary>
                <code dir="ltr">{x.action}</code>
                <code dir="ltr">{x.id}</code>
              </details>
            </div>
          </Item>
        ))}
      </ItemGroup>
      {!view.items.length && (
        <p dir="auto" className="ps-muted">
          {t(
            'No events match this authorized scope.',
            'لا توجد أحداث تطابق هذا النطاق المسموح.',
          )}
        </p>
      )}
      {view.items.length > 20 && (
        <Button
          pending={busy}
          variant="outline"
          disabled={busy}
          onClick={() => void query(true)}
        >
          {t('Older events', 'أحداث أقدم')}
        </Button>
      )}
    </section>
  );
}
