import { entryPage, entryMetadata } from '../../../../account-entry/page';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const generateMetadata = entryMetadata('setup-account');
export default entryPage('setup-account');
