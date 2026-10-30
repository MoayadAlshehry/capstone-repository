'use client';
import { useId, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { MotionGroup, MotionItem } from '@/components/ui/shared-motion';
import { useSite, facetKeys, facetLabel, type Catalogue } from './model';
export function Filters({ s }: { s: Catalogue }) {
  const { t, l, integration, ar } = useSite(),
    id = useId();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(s.selections),
    [find, setFind] = useState(''),
    [keys, setKeys] = useState(
      s.publicPersonKeys ?? { author: '', supervisor: '' },
    ),
    [reset, setReset] = useState(0),
    [notice, setNotice] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  const changeOpen = (next: boolean) => {
    if (!next) {
      close();
      return;
    }
    setDraft(
      Object.fromEntries(
        facetKeys.map((k) => [k, [...s.selections[k]]]),
      ) as typeof draft,
    );
    setFind('');
    setKeys(s.publicPersonKeys ?? { author: '', supervisor: '' });
    setNotice('');
    setOpen(true);
  };
  return (
    <div className="pu-filters">
      <div className="pu-filter-row">
        <span className="text-sm">{t('Department')}</span>
        <ToggleGroup
          type="single"
          value={s.values.department || '__all'}
          onValueChange={(value) =>
            value && s.update({ department: value === '__all' ? '' : value })
          }
          aria-label={t('Department')}
          className="flex-wrap justify-start"
          variant="outline"
          spacing={2}
        >
          <ToggleGroupItem value="__all">{t('All')}</ToggleGroupItem>
          {s.options('department').map((v) => (
            <ToggleGroupItem key={v} value={v}>
              {s.optionLabel?.('department', v) ?? t(v)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Collapsible
        open={open}
        onOpenChange={changeOpen}
        className="pu-filter-disclosure"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            close();
          }
        }}
      >
        <CollapsibleTrigger asChild>
          <Button variant="outline" ref={trigger}>
            {t('moreFilters')}
            {s.active.filter(([k]) => !['q', 'department'].includes(k)).length >
              0 && (
              <Badge variant="secondary">
                {
                  s.active.filter(([k]) => !['q', 'department'].includes(k))
                    .length
                }
              </Badge>
            )}
            <ChevronDown className={open ? 'rotate-180' : ''} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pu-filter-panel">
          <Card>
            <CardContent>
              <form
                className="grid gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  s.update({
                    ...draft,
                    authorKey: keys.author,
                    supervisorKey: keys.supervisor,
                  });
                  close();
                }}
              >
                <Field>
                  <FieldLabel htmlFor={id + '-find'}>
                    {t('Search options')}
                  </FieldLabel>
                  <Input
                    id={id + '-find'}
                    type="search"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                </Field>
                <div className="pu-advanced-fields">
                  {(integration?.facets ?? facetKeys).map((k) => (
                    <fieldset
                      key={
                        ['author', 'supervisor'].includes(k)
                          ? JSON.stringify([
                              k,
                              draft.university,
                              draft.department,
                              reset,
                            ])
                          : k
                      }
                      className="min-w-0 rounded-lg border p-4"
                    >
                      <legend
                        className="px-1 text-sm font-medium"
                        dir={ar ? 'rtl' : 'ltr'}
                      >
                        {t(facetLabel[k])}
                      </legend>
                      {(k === 'author' || k === 'supervisor') &&
                      integration?.personFacet ? (
                        integration.personFacet(
                          k,
                          {
                            value: draft[k][0] ?? '',
                            key: keys[k],
                            university: draft.university[0] ?? '',
                            department: draft.department[0] ?? '',
                          },
                          (value, key) => {
                            setDraft((v) => ({
                              ...v,
                              [k]: value ? [value] : [],
                            }));
                            setKeys((v) => ({ ...v, [k]: key }));
                          },
                        )
                      ) : (
                        <ScrollArea
                          className={
                            s.options(k).length > 5 ? 'h-40' : 'h-auto'
                          }
                        >
                          <div className="grid gap-3">
                            {s
                              .options(k)
                              .filter(
                                (v) =>
                                  !find ||
                                  (s.optionLabel?.(k, v) ?? t(v))
                                    .toLowerCase()
                                    .includes(find.toLowerCase()) ||
                                  draft[k].includes(v),
                              )
                              .map((v, index) => (
                                <Field orientation="horizontal" key={v}>
                                  <Checkbox
                                    id={id + '-' + k + index}
                                    checked={draft[k].includes(v)}
                                    onCheckedChange={(checked) => {
                                      const next = {
                                        ...draft,
                                        [k]:
                                          checked === true
                                            ? integration?.multiple === false
                                              ? [v]
                                              : [...draft[k], v]
                                            : draft[k].filter((x) => x !== v),
                                      };
                                      if (
                                        integration?.personFacet &&
                                        ['university', 'department'].includes(k)
                                      ) {
                                        next.author = [];
                                        next.supervisor = [];
                                        setKeys({ author: '', supervisor: '' });
                                        if (
                                          k === 'university' &&
                                          next.department[0] &&
                                          !integration
                                            .departmentsForUniversity?.(
                                              next.university[0] ?? '',
                                            )
                                            .includes(next.department[0])
                                        )
                                          next.department = [];
                                        setNotice(
                                          l(
                                            'People filters were cleared for this academic context. Any unavailable department was also cleared.',
                                            'مُسحت عوامل تصفية الأسماء لتطابق السياق الأكاديمي الجديد، وأُزيل القسم إن لم يعد متاحًا.',
                                          ),
                                        );
                                      }
                                      setDraft(next);
                                    }}
                                  />
                                  <Label
                                    htmlFor={id + '-' + k + index}
                                    className="font-normal leading-relaxed"
                                  >
                                    {s.optionLabel?.(k, v) ?? t(v)}
                                  </Label>
                                </Field>
                              ))}
                          </div>
                        </ScrollArea>
                      )}
                    </fieldset>
                  ))}
                </div>
                {notice && (
                  <p
                    role="status"
                    dir="auto"
                    className="text-sm text-muted-foreground"
                  >
                    {notice}
                  </p>
                )}
                <div className="flex gap-3 justify-end flex-wrap">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setDraft({
                        university: [],
                        department: [],
                        academicYear: [],
                        domain: [],
                        author: [],
                        supervisor: [],
                        topic: [],
                      });
                      setKeys({ author: '', supervisor: '' });
                      setReset((v) => v + 1);
                      setFind('');
                      setNotice(
                        l(
                          'Filters cleared. Show results to apply.',
                          'مُسحت عوامل التصفية. اعرض النتائج لتطبيق التغيير.',
                        ),
                      );
                    }}
                  >
                    {l('Clear filters', 'مسح عوامل التصفية')}
                  </Button>
                  <Button type="button" variant="outline" onClick={close}>
                    {t('cancel')}
                  </Button>
                  <Button type="submit">{t('apply')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
export function FilterChips({ s }: { s: Catalogue }) {
  const { t } = useSite();
  return (
    <MotionGroup className="flex flex-wrap gap-2 my-4">
      {s.active.map(([k, v]) => (
        <MotionItem key={k + ':' + v}>
          <Badge variant="secondary" className="gap-1 py-1">
            {s.optionLabel?.(k, v) ?? t(v)}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('Remove') + ' ' + (s.optionLabel?.(k, v) ?? t(v))}
              onClick={() => s.remove(k, v)}
            >
              <X />
            </Button>
          </Badge>
        </MotionItem>
      ))}
      {s.active.length > 0 && (
        <Button variant="link" size="sm" onClick={s.clear}>
          {t('clearAll')}
        </Button>
      )}
    </MotionGroup>
  );
}
