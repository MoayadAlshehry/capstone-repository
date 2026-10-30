'use client';
import {
  LazyMotion,
  MotionConfig,
  AnimatePresence,
  m,
  useReducedMotion,
  useIsPresent,
} from 'motion/react';
import type { ReactNode, ComponentProps } from 'react';
const features = () => import('motion/react').then((module) => module.domMax);
export function MotionGroup({ children, ...props }: ComponentProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={features}>
        <div {...props} data-shared-motion>
          <AnimatePresence initial={false}>{children}</AnimatePresence>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
export function MotionItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion(),
    present = useIsPresent();
  return (
    <m.div
      className={className}
      data-motion-item
      inert={!present}
      layout={reduced ? false : 'position'}
      initial={reduced ? false : { opacity: 0.8, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  );
}
export function MotionReveal({
  visible,
  children,
  ...props
}: ComponentProps<typeof m.div> & { visible: boolean }) {
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={features}>
        <AnimatePresence initial={false}>
          {visible && (
            <m.div
              key="panel"
              {...props}
              data-motion-reveal
              initial={reduced ? false : { opacity: 0.8, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
            >
              {children}
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </MotionConfig>
  );
}
