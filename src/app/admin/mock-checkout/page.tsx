import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

/**
 * Landing page reached by the Xendit-mock invoice URL. In live mode this
 * redirects to the hosted Xendit checkout; here we just show a static
 * confirmation so the flow is clickable end-to-end.
 */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const invoiceId = params.id ?? "unknown";
  const amount = params.amount ?? "0";
  const currency = params.currency ?? "PHP";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-yellow-600 text-white">Mock mode</Badge>
            <span className="text-xs text-zinc-500">Xendit stub</span>
          </div>
          <CardTitle className="text-white">Invoice ready</CardTitle>
          <CardDescription className="text-zinc-400">
            In production this page would redirect to Xendit&rsquo;s hosted
            checkout. In mock mode we&rsquo;ve already marked the subscription
            as active so you can test the recommendation logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
            <div className="flex items-center justify-between text-zinc-300">
              <span>Invoice ID</span>
              <span className="font-mono text-xs text-zinc-400">{invoiceId}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-zinc-300">
              <span>Amount</span>
              <span className="font-semibold text-white">
                {currency} {Number(amount).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-green-900/60 bg-green-900/10 p-3 text-sm text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>Payment auto-confirmed (mock)</span>
          </div>
          <Button
            render={<Link href="/admin/promote" />}
            className="w-full bg-red-600 text-white hover:bg-red-700"
          >
            Back to promotions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
