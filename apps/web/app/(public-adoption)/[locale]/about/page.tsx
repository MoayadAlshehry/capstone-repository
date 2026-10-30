import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import { publicMetadata } from '../../../../public-archive/server';
export const dynamic = 'force-dynamic';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') return {};
  return publicMetadata(
    locale,
    locale === 'ar' ? 'عن المنصة' : 'About the platform',
    'A repository for published university capstone projects.',
    `/${locale}/about`,
  );
}
export default async function About({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const sections = [
    [
      l('Publication is an academic decision', 'النشر قرار أكاديمي'),
      l(
        'Students prepare their work privately and the team lead submits it for review. Publishing requires a decision from the project’s assigned supervisor. Assessment scores alone do not publish a project.',
        'يُعدّ الطلاب عملهم في نطاق خاص، ويقدّمه قائد الفريق للمراجعة. يتطلب نشر المشروع قرارًا من المشرف المكلّف به؛ ولا تؤدي درجات التقييم وحدها إلى نشره.',
      ),
    ],
    [
      l('Public and restricted files', 'الملفات العامة والمقيّدة'),
      l(
        'Visitors can read published metadata and files explicitly shared publicly. Restricted files require current authorization. Eligible partners may request permission from the current team lead; signing in or partner approval alone does not grant file access.',
        'يمكن للزوار قراءة بيانات المشاريع المنشورة والملفات المخصّصة للعامة. تتطلب الملفات المقيّدة إذنًا ساريًا. يستطيع الشركاء المؤهلون طلب الإذن من قائد الفريق الحالي؛ ولا يمنح تسجيل الدخول أو اعتماد الشريك وحده حق الوصول إلى الملفات.',
      ),
    ],
    [
      l(
        'Internal and independent assessments',
        'التقييم الداخلي والمراجعات المستقلة',
      ),
      l(
        'Internal project assessment combines supervisor and committee assessment. Independent faculty reviews are shown separately with their completion count. These repository assessments are not official course grades, accreditation, or a guarantee of quality.',
        'يجمع التقييم الداخلي للمشروع بين تقييم المشرف واللجنة. وتُعرض مراجعات أعضاء هيئة التدريس المستقلين بصورة منفصلة مع عدد المراجعات المكتملة. ليست هذه التقييمات درجات مقررات رسمية أو اعتمادًا أكاديميًا أو ضمانًا للجودة.',
      ),
    ],
    [
      l('Authorship and reuse', 'التأليف وإعادة الاستخدام'),
      l(
        'Published records preserve credited authors and the work shared in that published edition. Publication and file hashes do not establish legal ownership or transfer intellectual property. Reading or downloading a public file does not automatically grant reuse rights; check its recorded license.',
        'تحفظ السجلات المنشورة أسماء المؤلفين والمواد المتاحة في النسخة المنشورة. لا يثبت النشر أو بصمات الملفات الملكية القانونية، ولا ينقل حقوق الملكية الفكرية. ولا تمنح قراءة الملف العام أو تنزيله تلقائيًا حقوق إعادة استخدامه؛ راجع الترخيص المسجّل له.',
      ),
    ],
  ];
  return (
    <main
      id="main"
      tabIndex={-1}
      className="wrap ps-about"
      data-public-page="about"
    >
      <header dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <span className="eyebrow">
          {l('Capstone Repository', 'مستودع مشاريع التخرج')}
        </span>
        <h1 dir="auto">{l('About the platform', 'عن المنصة')}</h1>
        <p dir="auto">
          {l(
            'Find published university capstone projects, discover their credited authors, and read original work shared publicly. Projects retain their university context and credited authorship.',
            'استكشف مشاريع التخرج الجامعية المنشورة، وتعرّف على مؤلفيها، واقرأ أعمالهم الأصلية المتاحة للعامة. تحافظ المشاريع على سياقها الجامعي ونسبتها إلى مؤلفيها.',
          )}
        </p>
      </header>
      <div className="ps-about-grid">
        {sections.map(([title, text]) => (
          <Card key={title} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <CardHeader>
              <CardTitle>
                <h2 dir="auto">{title}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p dir="auto">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button asChild size="lg">
        <a href={`/${locale}/catalogue`}>
          {l('Explore published projects', 'استكشف المشاريع المنشورة')} ↗
        </a>
      </Button>
    </main>
  );
}
