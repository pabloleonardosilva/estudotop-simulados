import EventoPublicClient from "./page-client";

export default async function EventoPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventoPublicClient slug={slug} />;
}
