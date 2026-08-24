import { notFound } from "next/navigation";
import { CaptureFlow } from "@/components/CaptureFlow";
import { hasLocale, messages } from "@/i18n";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;

  if (!hasLocale(locale)) notFound();

  return <CaptureFlow messages={messages[locale]} />;
}