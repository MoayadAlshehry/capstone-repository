import { cn } from '../utils.js';
import { BrandLogo } from '../brand-logo.js';
export function AcademicBrand({ className }: { className?: string }) {
  return (
    <span className={cn('as-brand', className)}>
      <BrandLogo label="Capstone Repository: مستودع مشاريع التخرج" decorative />
    </span>
  );
}
