import ClientPage from './page.client';
import { fetchArticles } from '../_lib/server-queries';
import { Suspense } from 'react';

export const revalidate = 30;

export default async function Page() {
  const initialArticles = await fetchArticles();
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" aria-busy="true" />}>
      <ClientPage initialArticles={initialArticles} />
    </Suspense>
  );
}
