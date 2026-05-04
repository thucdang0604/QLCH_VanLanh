import ClientPage from './page.client';
import { fetchArticles } from '../_lib/server-queries';

export const revalidate = 30;

export default async function Page(props: any) {
  const initialArticles = await fetchArticles();
  return <ClientPage {...props} initialArticles={initialArticles} />;
}
