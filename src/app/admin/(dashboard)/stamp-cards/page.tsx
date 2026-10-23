import { listStampCards } from "@/lib/actions/stampCards";
import { listMerchantBusinesses } from "@/lib/actions/travelChallenges";
import { StampCardsView } from "./stamp-cards-view";

export default async function StampCardsPage() {
  const [cards, businesses] = await Promise.all([listStampCards(), listMerchantBusinesses()]);
  return (
    <StampCardsView
      cards={cards}
      businesses={businesses.filter((b) => b.verification_status === "approved")}
    />
  );
}
