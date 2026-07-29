import dynamic from "next/dynamic";

// Mirrors src/app/page.tsx exactly, just forwarding the merchant slug from
// the URL - this is the branded pre-login entry point (/t/{slug}) linked
// from the Branding & Merchant pages, see App.tsx for how the slug turns
// into a fetched logo/name on LoginPage.
const App = dynamic(() => import("../../App"), { ssr: false });

export default function MerchantLoginPage({ params }: { params: { slug: string } }) {
  return <App merchantSlug={params.slug} />;
}
