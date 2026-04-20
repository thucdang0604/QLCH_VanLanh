import ClientPage from './page.client';

export const revalidate = false;

export default function Page(props: any) {
  return <ClientPage {...props} />;
}
