import { entryPage, entryMetadata } from '../../../../account-entry/page';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const generateMetadata = entryMetadata('request-setup');
export default entryPage('request-setup');
