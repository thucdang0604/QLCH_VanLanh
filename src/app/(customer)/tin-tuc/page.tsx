import ClientPage from './page.client';
import { fetchArticles } from '../_lib/server-queries';

export const revalidate = 30;

export default async function Page() {
  const initialArticles = await fetchArticles();
  return <ClientPage initialArticles={initialArticles} />;
}
