export const searchSuggestions = (ar: boolean) =>
  ar
    ? ([
        'مشاريع الذكاء الاصطناعي وإنترنت الأشياء',
        'الطاقة المتجددة',
        'التقنيات الصحية',
      ] as const)
    : ([
        'AI & IoT projects',
        'Renewable Energy',
        'Healthcare Technology',
      ] as const);
