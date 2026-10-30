'use client';
import { AlertDialog as Primitive } from 'radix-ui';
import { Children, isValidElement, useRef, type ReactNode } from 'react';
import { Button } from './button.js';
export function DecisionConfirmation({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const items = Children.toArray(children);
  let actionStart = items.length;
  while (
    actionStart > 0 &&
    isValidElement(items[actionStart - 1]) &&
    (items[actionStart - 1] as React.ReactElement).type === Button
  )
    actionStart--;
  const grouped = items.length - actionStart >= 2;
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="ac-dialog-overlay" />
        <Primitive.Content
          ref={content}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            content.current
              ?.querySelector<HTMLButtonElement>('button')
              ?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          className="wsv2 ac-confirm ac-alert-dialog"
        >
          <Primitive.Title dir="auto">{title}</Primitive.Title>
          <Primitive.Description asChild>
            <div className="ac-confirm-description" dir="auto">
              {description}
            </div>
          </Primitive.Description>
          {grouped ? (
            <>
              {items.slice(0, actionStart)}
              <div className="ui-action-row ui-action-row-end">
                {items.slice(actionStart)}
              </div>
            </>
          ) : (
            children
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
