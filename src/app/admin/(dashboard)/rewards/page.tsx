import { listMerchantRewards } from "@/lib/actions/rewards";
import { RewardsView } from "./rewards-view";

export default async function RewardsPage() {
  const { library, linked } = await listMerchantRewards();
  return <RewardsView initialLibrary={library} initialLinked={linked} />;
}
