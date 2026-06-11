import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

const SUPPORTED = ['en', 'ru'] as const;

/** Admin-only i18n: locale from the `admin_locale` cookie (no URL routing). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get('admin_locale')?.value ?? 'en';
  const locale = (SUPPORTED as readonly string[]).includes(cookieLocale) ? cookieLocale : 'en';
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
