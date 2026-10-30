export function identityMetadata(
  locale: string,
  purpose: 'login' | 'account' | 'workspace' | 'activate' | 'reset' | 'partner',
) {
  const titles = {
    login: ['Sign in', 'تسجيل الدخول'],
    account: ['Your account', 'حسابك'],
    workspace: ['Workspace context', 'سياق مساحة العمل'],
    activate: ['Set up your account', 'إعداد حسابك'],
    reset: ['Reset your password', 'إعادة تعيين كلمة المرور'],
    partner: ['Partner registration', 'تسجيل الشريك'],
  } as const;
  return {
    title: titles[purpose][locale === 'ar' ? 1 : 0] + ' | Capstone Repository',
    robots: { index: false, follow: false },
  };
}
