import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthorCredit } from './design-system/public/authors.js';
import {
  PublicModelProvider,
  type PublicModel,
  type Project,
} from './design-system/public/model.js';
for (const count of [1, 2, 3, 4, 5, 6, 12])
  it(
    'keeps ' + count + ' authors identical with server and browser capability',
    () => {
      const project = {
        id: 'project',
        authors: Array.from({ length: count }, (_, i) => ({
          name: 'Author ' + i,
        })),
      } as Project;
      const model = {
        href: () => '/en/catalogue',
        l: (en: string) => en,
        ar: false,
      } as unknown as PublicModel;
      const render = () =>
        renderToStaticMarkup(
          <PublicModelProvider model={model}>
            <AuthorCredit p={project} />
          </PublicModelProvider>,
        );
      const server = render(),
        descriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
      try {
        Object.defineProperty(globalThis, 'HTMLElement', {
          configurable: true,
          value: class {
            showPopover() {}
          },
        });
        expect(render()).toBe(server);
        expect(server).toContain(
          count <= 4 ? 'credit-full' : 'credit-adaptive',
        );
        for (let i = 0; i < count; i++) expect(server).toContain('Author ' + i);
        if (count <= 4) expect(server).not.toContain('author-trigger');
        else {
          expect(server).toContain('<details');
          expect(server).toContain('<summary');
          const trigger =
            server.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? '';
          expect([...trigger.matchAll(/class="avatar"/g)]).toHaveLength(count);
        }
        expect(server).not.toContain('In the order credited');
      } finally {
        if (descriptor)
          Object.defineProperty(globalThis, 'HTMLElement', descriptor);
        else Reflect.deleteProperty(globalThis, 'HTMLElement');
      }
    },
  );

for (const ar of [false, true])
  it(
    'keeps an explicit localized disclosure name when the visible label is removed: ' +
      (ar ? 'AR' : 'EN'),
    () => {
      const names = [
        'Sultan Ahmed Alqahtani',
        'إبراهيم أحمد القحطاني',
        'Ziyad Ahmed Alqahtani',
        'Saleh Ahmed Alqahtani',
        'Salman Ahmed Alqahtani',
      ];
      const project = {
        id: 'five-authors',
        authors: names.map((name) => ({ name })),
      } as Project;
      const model = {
        href: (
          _page: string,
          _project: string | undefined,
          extra: Record<string, string>,
        ) => '/catalogue?author=' + encodeURIComponent(extra.author!),
        l: (en: string, arabic: string) => (ar ? arabic : en),
        ar,
        integration: {
          avatar: (_project: Project, index: number) =>
            index === 0 ? <img src="/brand/Icon_Mark.svg" alt="" /> : undefined,
        },
      } as unknown as PublicModel;
      const markup = renderToStaticMarkup(
        <PublicModelProvider model={model}>
          <AuthorCredit p={project} />
        </PublicModelProvider>,
      );
      const summary =
        markup.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? '';
      expect(summary).toContain(
        ar
          ? 'aria-label="عرض جميع المؤلفين (٥)"'
          : 'aria-label="Show all 5 authors"',
      );
      expect(summary).toContain(
        'class="credit-count" aria-hidden="true">' + (ar ? '٥' : '5'),
      );
      expect(summary).not.toContain('credit-label');
      expect(summary).not.toContain('⌄');
      expect(summary).toContain('<svg');
      expect(summary).toContain('<img');
      const destinations = [
        ...(markup.match(/<ol[\s\S]*?<\/ol>/)?.[0] ?? '').matchAll(
          /href="([^"]*)"/g,
        ),
      ].map((match) => match[1]);
      expect(destinations).toEqual(
        names.map((name) => '/catalogue?author=' + encodeURIComponent(name)),
      );
    },
  );
