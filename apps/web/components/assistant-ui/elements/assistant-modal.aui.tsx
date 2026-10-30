'use client';

import { BotIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';

import {
  type ComponentPropsWithoutRef,
  type FC,
  forwardRef,
  useId,
  useMemo,
  useRef,
  useContext,
} from 'react';
import { AssistantModalPrimitive, useAui } from '@assistant-ui/react';
import { AIBeta } from '@/components/ui/ai-beta';

import { Thread } from '@/components/assistant-ui/elements/thread.aui';
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button';
import { useModalSize } from '../utils/modal-size';

import { AssistantPortal } from '@/lib/assistant-portal';
import { OfficialContext } from '@/ai/official-locale';
import { OfficialWelcome } from '@/ai/official-bindings';
import { XIcon } from 'lucide-react';
export const AssistantModal: FC<{
  open: boolean;
  onOpenChange: (value: boolean) => void;
  projectTitle: string;
}> = ({ open, onOpenChange, projectTitle }) => {
  const portal = useContext(AssistantPortal);
  const { locale } = useContext(OfficialContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { size, reset, handleProps } = useModalSize(contentRef);
  const thread = useMemo(
    () => <Thread components={{ Welcome: OfficialWelcome }} />,
    [],
  );

  return (
    <AssistantModalPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AssistantModalPrimitive.Anchor className="aui-root aui-modal-anchor fixed end-4 bottom-4 size-11">
        <AssistantModalPrimitive.Trigger asChild>
          <AssistantModalButton />
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>
      <AssistantModalPrimitive.Content
        portalProps={{ container: portal }}
        data-capstone-ai
        ref={contentRef}
        sideOffset={16}
        align={locale === 'ar' ? 'start' : 'end'}
        aria-labelledby={titleId}
        style={size ?? undefined}
        className="group/modal aui-root aui-modal-content bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2 [&[data-state=open]_.aui-thread-viewport-footer]:animate-in [&[data-state=open]_.aui-thread-viewport-footer]:fade-in-0 [&[data-state=open]_.aui-thread-viewport-footer]:slide-in-from-bottom-2 [&[data-state=open]_.aui-thread-viewport-footer]:fill-mode-backwards [&_.aui-thread-viewport-footer]:bg-popover ring-foreground/10 z-50 flex h-125 max-h-(--radix-popover-content-available-height) w-100 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) flex-col overflow-clip overscroll-contain rounded-xl p-0 antialiased shadow-[0_16px_48px_-24px_rgb(0_0_0/0.25)] ring-1 transition-none ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:animate-none dark:shadow-[0_16px_48px_-24px_rgb(0_0_0/0.6)] [&_.aui-thread-root]:bg-inherit motion-reduce:[&_.aui-thread-viewport-footer]:animate-none [&_[data-slot=aui\_thread-viewport]]:[scrollbar-gutter:stable_both-edges] [&[data-state=open]_.aui-thread-viewport-footer]:delay-100 [&[data-state=open]_.aui-thread-viewport-footer]:duration-300 [&[data-state=open]_.aui-thread-viewport-footer]:ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        <AssistantModalResizeHandle {...handleProps} onDoubleClick={reset} />
        <AssistantModalHeader
          titleId={titleId}
          projectTitle={projectTitle}
          onClose={() => onOpenChange(false)}
        />
        <div className="aui-modal-body relative min-h-0 flex-1">
          <div className="aui-modal-thread h-full">{thread}</div>
        </div>
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
};

const AssistantModalHeader: FC<{
  titleId: string;
  projectTitle: string;
  onClose: () => void;
}> = ({ titleId, projectTitle, onClose }) => {
  const { locale } = useContext(OfficialContext),
    ar = locale === 'ar',
    aui = useAui();
  return (
    <div className="aui-modal-header border-foreground/10 flex shrink-0 items-center gap-2 border-b ps-3.5 pe-2">
      <h2
        id={titleId}
        className="aui-modal-title min-w-0 flex-1 truncate font-medium"
        title={projectTitle}
      >
        {projectTitle}
      </h2>
      <AIBeta />
      <TooltipIconButton
        tooltip={ar ? 'محادثة جديدة' : 'New conversation'}
        side="bottom"
        className="aui-modal-new size-8"
        onClick={() => {
          aui.thread().cancelRun();
          aui.thread().reset();
        }}
      >
        <PlusIcon size={16} />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip={ar ? 'إغلاق المساعد' : 'Close assistant'}
        onClick={onClose}
        className="size-8"
      >
        <XIcon size={16} />
      </TooltipIconButton>
    </div>
  );
};

const AssistantModalResizeHandle: FC<ComponentPropsWithoutRef<'button'>> = (
  props,
) => {
  const { locale } = useContext(OfficialContext);
  return (
    <button
      type="button"
      aria-label={locale === 'ar' ? 'تغيير حجم المساعد' : 'Resize assistant'}
      className="aui-modal-resize-handle group-hover/modal:border-foreground/15 hover:border-foreground/40 focus-visible:border-ring absolute start-0 top-0 z-10 size-6 cursor-nwse-resize touch-none rounded-ss-xl border-s-2 border-t-2 border-transparent transition-colors outline-none [clip-path:polygon(0_0,100%_0,100%_6px,6px_6px,6px_100%,0_100%)] motion-reduce:transition-none rtl:cursor-nesw-resize rtl:[clip-path:polygon(0_0,100%_0,100%_100%,calc(100%_-_6px)_100%,calc(100%_-_6px)_6px,0_6px)]"
      {...props}
    />
  );
};

type AssistantModalButtonProps = { 'data-state'?: 'open' | 'closed' };

const AssistantModalButton = forwardRef<
  HTMLButtonElement,
  AssistantModalButtonProps
>(({ 'data-state': state, ...rest }, ref) => {
  const { locale } = useContext(OfficialContext);
  const tooltip =
    locale === 'ar'
      ? state === 'open'
        ? 'إغلاق المساعد'
        : 'فتح المساعد'
      : state === 'open'
        ? 'Close Assistant'
        : 'Open Assistant';

  return (
    <TooltipIconButton
      variant="ghost"
      tooltip={tooltip}
      side="left"
      {...rest}
      className="aui-modal-button bg-background text-foreground border-border/60 hover:border-border hover:bg-background size-full rounded-full border transition-[border-color,scale] duration-150 ease-out active:scale-96 motion-reduce:transition-none"
      ref={ref}
    >
      <BotIcon
        data-state={state}
        className="aui-modal-button-closed-icon absolute size-5 transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:scale-100 data-[state=closed]:opacity-100 data-[state=closed]:blur-[0px] data-[state=open]:scale-25 data-[state=open]:opacity-0 data-[state=open]:blur-[4px] motion-reduce:transition-none"
      />

      <ChevronDownIcon
        data-state={state}
        className="aui-modal-button-open-icon absolute size-5 transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:scale-25 data-[state=closed]:opacity-0 data-[state=closed]:blur-[4px] data-[state=open]:scale-100 data-[state=open]:opacity-100 data-[state=open]:blur-[0px] motion-reduce:transition-none"
      />
    </TooltipIconButton>
  );
});

AssistantModalButton.displayName = 'AssistantModalButton';
