'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { usePublicPortal } from '../public-ui/scope';
import type { PublicPerson } from './discovery-query';
export function PeopleCombobox({ kind, locale, value, selectedKey, university, department, onSelect }: {
  kind: 'author' | 'supervisor'; locale: 'en' | 'ar'; value: string; selectedKey: string; university: string; department: string; onSelect: (person: PublicPerson | undefined) => void;
}) {
  const l = (en: string, ar: string) => locale === 'ar' ? ar : en, id = useId(), portal = usePublicPortal();
  const [text, setText] = useState(value), [items, setItems] = useState<PublicPerson[]>([]), [phase, setPhase] = useState('idle'), [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  const serial = useRef(0);
  useEffect(() => { if (value) setText(value); }, [value]);
  useEffect(() => {
    const request = ++serial.current, controller = new AbortController(); setItems([]);
    const selected = text === value && selectedKey;
    if (!selected && [...text.trim()].length < 2) { setPhase('idle'); return () => controller.abort(); }
    setPhase('loading');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ kind, university, department, limit: selected ? '1' : '10', ...(selected ? { key: selectedKey } : { q: text.trim() }) });
      fetch('/api/public-people?' + params, { signal: controller.signal, cache: 'no-store' }).then(async response => {
        if (!response.ok) throw Error();
        const data = await response.json() as { items: PublicPerson[] };
        if (!Array.isArray(data.items) || data.items.length > 10 || data.items.some(p => !/^[a-f0-9]{64}$/.test(p.key) || typeof p.name !== 'string')) throw Error();
        return data.items;
      }).then(rows => {
        if (request !== serial.current || controller.signal.aborted) return;
        if (selected) {
          const person = rows.find(p => p.key === selectedKey); setPhase(person ? 'selected' : 'stale');
          if (person && person.name !== value) { setText(person.name); onSelect(person); }
        } else { setItems(rows); setPhase(rows.length ? 'results' : 'empty'); }
      }).catch(() => { if (request === serial.current && !controller.signal.aborted) setPhase('failed'); });
    }, selected ? 0 : 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, value, selectedKey, kind, university, department, retry]);
  const label = kind === 'author' ? l('Search authors', 'ابحث عن مؤلف') : l('Search supervisors', 'ابحث عن مشرف');
  const status = phase === 'loading' ? l('Searching names…', 'جارٍ البحث عن الأسماء…') : phase === 'stale' ? l('This selection is unavailable. Clear it or choose a published name.', 'هذا الاختيار غير متاح. امسحه أو اختر اسمًا من السجلات المنشورة.') : phase === 'failed' ? l('Could not load suggestions. Try again.', 'تعذّر تحميل الاقتراحات. حاول مرة أخرى.') : phase === 'empty' ? l('No published names match your search.', 'لا توجد أسماء منشورة تطابق بحثك.') : phase === 'selected' ? l('Published name selected.', 'تم اختيار اسم من السجلات المنشورة.') : phase === 'results' ? l('Use the arrow keys to choose.', 'استخدم مفتاحي السهمين للاختيار.') : l('Type at least two characters.', 'اكتب حرفين على الأقل.');
  return <div className="grid gap-2"><Label id={id + '-label'}>{label}</Label>
    <Popover open={open} onOpenChange={setOpen}><div className="flex gap-2 min-w-0"><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-labelledby={id + '-label'} aria-expanded={open} aria-describedby={id + '-status'} className="w-full min-w-0 justify-between h-auto min-h-10 whitespace-normal text-start">{value || label}<ChevronsUpDown /></Button></PopoverTrigger>
      {(text || selectedKey) && <Button variant="ghost" type="button" size="icon-lg" aria-label={l('Clear selected name', 'مسح الاسم المختار')} onClick={() => { ++serial.current; setText(''); setItems([]); setPhase('idle'); onSelect(undefined); }}><X /></Button>}
    </div><PopoverContent {...portal} align="start" className={portal.className + ' w-80 max-w-[calc(100vw-32px)] p-0'}>
      <Command shouldFilter={false}><CommandInput aria-label={label} placeholder={label} value={text} onValueChange={next => { setText(next); if (value || selectedKey) onSelect(undefined); }} maxLength={80} />
        <CommandList aria-label={kind === 'author' ? l('Published authors', 'مؤلفو المشاريع المنشورة') : l('Published supervisors', 'مشرفو المشاريع المنشورة')}>
          {items.map(person => <CommandItem key={person.key} value={person.key} onSelect={() => { ++serial.current; onSelect(person); setText(person.name); setPhase('selected'); setOpen(false); }} className="flex-col items-start"><bdi>{person.name}</bdi><small><bdi>{locale === 'ar' ? person.university.nameAr : person.university.nameEn}</bdi> · <bdi>{person.department}</bdi></small></CommandItem>)}
          {phase !== 'results' && <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">{phase === 'loading' && <Spinner />}{status}</div>}
        </CommandList>
      </Command>
      {phase === 'failed' && <Button variant="ghost" onClick={() => setRetry(n => n + 1)}>{l('Retry', 'إعادة المحاولة')}</Button>}
    </PopoverContent></Popover><p id={id + '-status'} role="status" aria-live="polite" dir="auto" className="text-sm text-muted-foreground">{status}</p>
  </div>;
}
