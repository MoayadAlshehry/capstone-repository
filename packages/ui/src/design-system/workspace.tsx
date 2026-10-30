'use client';
import type { ComponentProps, ReactNode } from 'react';
import * as W from '../workspace-v2/index.js';
export function WorkspaceAction(props: ComponentProps<typeof W.Button>) {
  return (
    <W.Button
      {...props}
      className={['ds-workspace-wrap', props.className]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
export function WorkspaceInput(props: ComponentProps<typeof W.Input>) {
  return <W.Input {...props} />;
}
export function WorkspaceTextarea(props: ComponentProps<typeof W.Textarea>) {
  return <W.Textarea {...props} />;
}
/** Current InputGroup/reveal anatomy; credential policy and controlled state remain with the host. */
export function WorkspacePasswordField({
  shown,
  onToggleShown,
  showLabel,
  hideLabel,
  ...props
}: Omit<ComponentProps<typeof W.InputGroupInput>, 'type'> & {
  shown: boolean;
  onToggleShown: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <W.InputGroup className="as-input-group" dir="ltr">
      <W.InputGroupInput {...props} type={shown ? 'text' : 'password'} />
      <W.InputGroupAddon align="inline-end">
        <W.InputGroupButton
          className="as-reveal"
          size="icon-sm"
          type="button"
          onClick={onToggleShown}
          aria-label={shown ? hideLabel : showLabel}
          aria-controls={props.id}
          aria-pressed={shown}
          disabled={props.disabled}
        >
          {shown ? <W.EyeOff /> : <W.Eye />}
        </W.InputGroupButton>
      </W.InputGroupAddon>
    </W.InputGroup>
  );
}
export function Tabs({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: ReadonlyArray<{ value: string; label: string; children: ReactNode }>;
}) {
  return (
    <W.Tabs dir="ltr" value={value} onValueChange={onValueChange}>
      <W.TabsList aria-label={label}>
        {items.map((item) => (
          <W.TabsTrigger key={item.value} value={item.value}>
            <bdi dir="auto">{item.label}</bdi>
          </W.TabsTrigger>
        ))}
      </W.TabsList>
      {items.map((item) => (
        <W.TabsContent key={item.value} value={item.value}>
          {item.children}
        </W.TabsContent>
      ))}
    </W.Tabs>
  );
}
export function WorkspacePanel(props: ComponentProps<typeof W.Card>) {
  return <W.Card {...props} />;
}
export function WorkspaceTable({
  headers,
  children,
  label,
}: {
  headers: ReadonlyArray<string>;
  children: ReactNode;
  label: string;
}) {
  return (
    <W.Table aria-label={label} dir="ltr">
      <W.TableHeader>
        <W.TableRow>
          {headers.map((h) => (
            <W.TableHead key={h}>
              <bdi dir="auto">{h}</bdi>
            </W.TableHead>
          ))}
        </W.TableRow>
      </W.TableHeader>
      <W.TableBody>{children}</W.TableBody>
    </W.Table>
  );
}
export function WorkspaceRow({
  cells,
  action,
}: {
  cells: ReadonlyArray<ReactNode>;
  action: ReactNode;
}) {
  return (
    <W.TableRow>
      {cells.map((c, i) => (
        <W.TableCell key={i}>{c}</W.TableCell>
      ))}
      <W.TableCell>{action}</W.TableCell>
    </W.TableRow>
  );
}
export function SidebarItem({
  href,
  active,
  icon,
  children,
  labelDirection = 'auto',
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  labelDirection?: 'ltr' | 'rtl' | 'auto';
}) {
  return (
    <W.SidebarMenuItem>
      <W.SidebarMenuButton asChild isActive={active} className="wv-nav">
        <a href={href} aria-current={active ? 'page' : undefined}>
          {icon}
          <span dir={labelDirection}>{children}</span>
        </a>
      </W.SidebarMenuButton>
    </W.SidebarMenuItem>
  );
}
export function AssessmentWorkspace(
  props: ComponentProps<typeof W.AcademicAssessmentWorkspace>,
) {
  return <W.AcademicAssessmentWorkspace {...props} />;
}
export function ScoreReceipt(
  props: ComponentProps<typeof W.AssessmentSummary>,
) {
  return <W.AssessmentSummary {...props} />;
}
