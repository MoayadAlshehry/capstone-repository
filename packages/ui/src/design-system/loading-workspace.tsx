'use client';
import * as W from '../workspace-v2/index.js';
import { Skeleton } from './loading.js';
/** The current table/cell/control anatomy, with only unresolved rows decorative. */
export function WorkspaceTableSkeleton({
  label,
  headers,
  rows = 3,
}: {
  label: string;
  headers: ReadonlyArray<string>;
  rows?: number;
}) {
  return (
    <W.Table aria-label={label} aria-busy="true" dir="ltr">
      <W.TableHeader>
        <W.TableRow>
          {headers.map((h) => (
            <W.TableHead key={h}>{h}</W.TableHead>
          ))}
        </W.TableRow>
      </W.TableHeader>
      <W.TableBody>
        {Array.from({ length: Math.max(0, Math.min(rows, 20)) }, (_, i) => (
          <W.TableRow key={i} aria-hidden="true">
            {headers.map((h, j) => (
              <W.TableCell key={h}>
                <Skeleton
                  {...(j === headers.length - 1
                    ? {
                        shape: 'block' as const,
                        width: '100px',
                        height: 'var(--cr-geometry-workspace-control-default)',
                      }
                    : { width: '70%' })}
                />
              </W.TableCell>
            ))}
          </W.TableRow>
        ))}
      </W.TableBody>
    </W.Table>
  );
}
