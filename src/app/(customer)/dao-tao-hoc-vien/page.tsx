import ClientPage from './page.client';

export const revalidate = 30;

export default function Page(props: any) {
  return <ClientPage {...props} />;
}
