import { Skeleton } from '@/components/ui/skeleton';
export { Skeleton } from '@/components/ui/skeleton';
export function SkeletonTemplate({ template }: { template: string }) {
  const card = (
    <div className="rounded-xl border bg-card p-6 grid gap-4 min-w-0">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
  return (
    <div
      aria-hidden="true"
      data-public-loading={template}
      className={
        template.includes('catalogue')
          ? 'grid gap-6 sm:grid-cols-2 my-6'
          : 'grid gap-4 w-full'
      }
    >
      {card}
      {template.includes('catalogue') && card}
    </div>
  );
}
