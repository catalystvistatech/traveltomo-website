import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { resolveMerchantScope } from "@/lib/actions/scope";
import { stampQrUrl } from "@/lib/stamps";
import { PrintButton } from "./print-button";

// Printable A4/Letter poster for a stamp card's QR.
export default async function StampPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await resolveMerchantScope();
  if (!scope) notFound();
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("stamp_cards")
    .select("title, stamps_required, reward_title, qr_code_value, business:businesses ( name )")
    .eq("id", id)
    .eq("merchant_id", scope.merchantId)
    .maybeSingle();
  if (!card) notFound();

  const svg = await QRCode.toString(stampQrUrl(card.qr_code_value as string), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const businessName = (card.business as unknown as { name?: string } | null)?.name ?? "";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Print only the poster, not the dashboard chrome around it. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .stamp-poster, .stamp-poster * { visibility: visible !important; }
        .stamp-poster { position: absolute; inset: 0; margin: auto; }
      }`}</style>
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <div className="stamp-poster space-y-6 rounded-2xl bg-white p-10 text-center text-zinc-900 print:rounded-none print:p-0">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-600">TravelTomo Stamp Card</p>
        <h1 className="text-4xl font-extrabold">{businessName}</h1>
        <p className="text-2xl">
          Scan on every visit.
          <br />
          <span className="font-bold">
            {card.stamps_required} stamps = {card.reward_title}!
          </span>
        </p>
        <div
          className="mx-auto w-72 [&_svg]:h-auto [&_svg]:w-full"
          // QR markup generated server-side by the qrcode library from our own URL.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-lg text-zinc-600">
          Open the TravelTomo app → <b>Stamps</b> → <b>Scan</b>
          <br />
          No app yet? Scan with your camera to get it.
        </p>
      </div>
    </div>
  );
}
