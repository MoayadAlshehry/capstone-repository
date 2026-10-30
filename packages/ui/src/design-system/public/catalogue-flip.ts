type Rect = { x: number; y: number; width: number; height: number };
type Item = {
  node: HTMLElement;
  box: Rect;
  radius: string;
  borderX: number;
  borderY: number;
  parts: {
    node: HTMLElement;
    box: Rect;
    borderX: number;
    borderY: number;
    children: { node: HTMLElement; box: Rect }[];
  }[];
  title?: { node: HTMLElement; size: string; line: string } | undefined;
};
const box = (e: HTMLElement): Rect => {
  const r = e.getBoundingClientRect();
  return {
    x: r.left + scrollX,
    y: r.top + scrollY,
    width: r.width,
    height: r.height,
  };
};
const read = (stage: HTMLElement): Item[] =>
  [...stage.querySelectorAll<HTMLElement>(':scope>[data-project-id]')].map(
    (node) => {
      const title = node.querySelector<HTMLElement>('h3'),
        type = title ? getComputedStyle(title) : null;
      return {
        node,
        box: box(node),
        radius: getComputedStyle(node).borderRadius,
        borderX: parseFloat(getComputedStyle(node).borderLeftWidth) || 0,
        borderY: parseFloat(getComputedStyle(node).borderTopWidth) || 0,
        parts: [
          ...node.querySelectorAll<HTMLElement>(
            ':scope>.result-media,:scope>.pav-object-sheet,:scope>.pav-object-end',
          ),
        ].map((node) => ({
          node,
          box: box(node),
          borderX: parseFloat(getComputedStyle(node).borderLeftWidth) || 0,
          borderY: parseFloat(getComputedStyle(node).borderTopWidth) || 0,
          children: node.classList.contains('pav-object-end')
            ? [...node.children].map((child) => ({
                node: child as HTMLElement,
                box: box(child as HTMLElement),
              }))
            : [],
        })),
        title:
          title && type
            ? { node: title, size: type.fontSize, line: type.lineHeight }
            : undefined,
      };
    },
  );
/** One live keyed tree. Actual width/height interpolation avoids scaling type or stretching media. */
export function createCatalogueMorph(root: () => ParentNode = () => document) {
  let generation = 0,
    animations: Animation[] = [],
    restore: (() => void) | undefined,
    observer: MutationObserver | undefined;
  const stop = () => {
    generation++;
    observer?.disconnect();
    observer = undefined;
    for (const animation of animations) animation.cancel();
    animations = [];
    restore?.();
    restore = undefined;
  };
  const run = (commit: () => void, reduced: boolean) => {
    const stage = root().querySelector<HTMLElement>('.pav-results');
    if (!stage || reduced || typeof stage.animate !== 'function') {
      stop();
      commit();
      return;
    }
    const beforeStage = box(stage),
      before = read(stage),
      savedY = scrollY,
      savedX = scrollX;
    stop();
    commit();
    if (!stage.isConnected) return;
    const afterStage = box(stage),
      after = read(stage);
    if (
      before.length !== after.length ||
      before.some((item, i) => item.node !== after[i]!.node)
    )
      return;
    const current = ++generation,
      styles = new Map<HTMLElement, string | null>();
    const remember = (node: HTMLElement) => {
      if (!styles.has(node)) styles.set(node, node.getAttribute('style'));
    };
    const set = (node: HTMLElement, values: Partial<CSSStyleDeclaration>) => {
      remember(node);
      Object.assign(node.style, values);
    };
    restore = () => {
      for (const [node, style] of styles) {
        if (style === null) node.removeAttribute('style');
        else node.setAttribute('style', style);
      }
      delete stage.dataset.morphing;
    };
    const timing: KeyframeAnimationOptions = {
      duration: 320,
      easing: 'cubic-bezier(.22,.75,.25,1)',
      fill: 'both',
    };
    const animate = (node: HTMLElement, frames: Keyframe[]) => {
      const a = node.animate(frames, timing);
      animations.push(a);
      return a;
    };
    set(stage, {
      display: 'block',
      position: 'relative',
      height: beforeStage.height + 'px',
    });
    stage.dataset.morphing = 'true';
    animate(stage, [
      { height: beforeStage.height + 'px' },
      { height: afterStage.height + 'px' },
    ]);
    for (let i = 0; i < before.length; i++) {
      const first = before[i]!,
        last = after[i]!;
      set(first.node, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        margin: '0px',
        translate: 'none',
        maxWidth: 'none',
        width: first.box.width + 'px',
        height: first.box.height + 'px',
      });
      animate(first.node, [
        {
          transform: `translate(${first.box.x - beforeStage.x}px,${first.box.y - beforeStage.y}px)`,
          width: first.box.width + 'px',
          height: first.box.height + 'px',
          borderRadius: first.radius,
        },
        {
          transform: `translate(${last.box.x - afterStage.x}px,${last.box.y - afterStage.y}px)`,
          width: last.box.width + 'px',
          height: last.box.height + 'px',
          borderRadius: last.radius,
        },
      ]);
      for (let j = 0; j < first.parts.length; j++) {
        const part = first.parts[j]!,
          target = last.parts[j];
        if (!target) continue;
        set(part.node, {
          position: 'absolute',
          gridColumn: 'auto',
          gridRow: 'auto',
          left: '0px',
          top: '0px',
          margin: '0px',
          maxWidth: 'none',
          width: part.box.width + 'px',
          height: part.box.height + 'px',
        });
        animate(part.node, [
          {
            transform: `translate(${part.box.x - first.box.x - first.borderX}px,${part.box.y - first.box.y - first.borderY}px)`,
            width: part.box.width + 'px',
            height: part.box.height + 'px',
          },
          {
            transform: `translate(${target.box.x - last.box.x - last.borderX}px,${target.box.y - last.box.y - last.borderY}px)`,
            width: target.box.width + 'px',
            height: target.box.height + 'px',
          },
        ]);
        // Interpolate the existing score/action boxes as well. Letting their
        // final flex rules run inside a changing parent can push the CTA
        // beyond the card midway through an otherwise continuous morph.
        for (let k = 0; k < part.children.length; k++) {
          const child = part.children[k]!,
            end = target.children[k];
          if (!end || child.node !== end.node) continue;
          set(child.node, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            margin: '0px',
            minWidth: '0px',
            maxWidth: 'none',
            width: child.box.width + 'px',
            height: child.box.height + 'px',
          });
          animate(child.node, [
            {
              transform: `translate(${child.box.x - part.box.x - part.borderX}px,${child.box.y - part.box.y - part.borderY}px)`,
              width: child.box.width + 'px',
              height: child.box.height + 'px',
            },
            {
              transform: `translate(${end.box.x - target.box.x - target.borderX}px,${end.box.y - target.box.y - target.borderY}px)`,
              width: end.box.width + 'px',
              height: end.box.height + 'px',
            },
          ]);
        }
      }
      if (
        first.title &&
        last.title &&
        (first.title.size !== last.title.size ||
          first.title.line !== last.title.line)
      )
        animate(first.title.node, [
          { fontSize: first.title.size, lineHeight: first.title.line },
          { fontSize: last.title.size, lineHeight: last.title.line },
        ]);
    }
    if (scrollY !== savedY || scrollX !== savedX) scrollTo(savedX, savedY);
    observer = new MutationObserver((records) => {
      if (records.some((x) => x.type === 'childList')) stop();
    });
    observer.observe(stage, { childList: true });
    Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(() => {
      if (current === generation) {
        observer?.disconnect();
        observer = undefined;
        restore?.();
        restore = undefined;
        for (const animation of animations) animation.cancel();
        animations = [];
      }
    });
  };
  const resize = () => stop();
  return {
    run,
    cancel: stop,
    observeResize: () => {
      addEventListener('resize', resize);
      return () => {
        removeEventListener('resize', resize);
        stop();
      };
    },
  };
}
