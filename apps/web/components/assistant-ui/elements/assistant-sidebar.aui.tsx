import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import type { FC, PropsWithChildren } from 'react';

import { Thread } from '@/components/assistant-ui/elements/thread.aui';
import { OfficialWelcome } from '@/ai/official-bindings';
import { OfficialContext } from '@/ai/official-locale';
import { useContext } from 'react';
import { DirectionProvider } from '@/components/ui/direction';

export const AssistantSidebar: FC<PropsWithChildren<{ narrow?: boolean }>> = ({
  children,
  narrow = false,
}) => {
  const { locale } = useContext(OfficialContext);
  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel
        defaultSize={narrow ? '0%' : '50%'}
        minSize={narrow ? '0%' : '30%'}
        maxSize={narrow ? '0%' : '70%'}
      >
        {children}
      </ResizablePanel>
      <ResizableHandle
        aria-label={locale === 'ar' ? 'تغيير عرض المساعد' : 'Resize assistant'}
        disabled={narrow}
      />
      <ResizablePanel
        defaultSize={narrow ? '100%' : '50%'}
        minSize={narrow ? '100%' : '30%'}
      >
        <div className="h-full" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <DirectionProvider dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <Thread components={{ Welcome: OfficialWelcome }} />
          </DirectionProvider>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
