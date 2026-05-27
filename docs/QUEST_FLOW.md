# Quest Flow ù Product Spec

Source: client (Christine). This is the canonical 10-step traveler
experience. Every product / engineering / design decision should map
back here, and the code references at the bottom of each step keep the
implementation honest.

> **The big idea**: a traveler opens TravelTomo, picks a merchant's
> quest, rolls for a random sequence of nearby challenges, completes
> them all over 2-3 hours, and walks into the merchant's physical
> shop to claim the BIG REWARD. The merchant gets foot traffic; the
> traveler gets an adventure; everyone shares it on social.

---

## Terminology

Player-facing copy calls these **Quests**. Backend tables / API paths /
type names keep `travel_challenge*` (`travel_challenges`,
`travel_challenge_progress`, `/v1/travel-challenges/*`,
`TravelChallenge` Swift types, `travelChallenges.ts` server actions)
to preserve the existing wire contract; the rename is strictly
cosmetic. When you see "quest" in prose below, that's the product
term; when you see backtick-formatted `travel_challenge*` identifiers,
those are the live schema/API names and must stay as-is.

---

## The 10 steps

### 1. ?? Traveler opens Travel Tomo

Sees quests from **nearby merchants** on Home.

- Quest list = merchant-authored `travel_challenges` filtered by the
  business `service_radius_meters`.
- Each card surfaces title + **BIG REWARD** chip + business + city +
  stop count.

**Code**
- `src/app/v1/travel-challenges/route.ts` ù radius-filtered list
- iOS: `Presentation/Screens/Main/Home/Components/HomeCards.swift`
  (`TravelChallengesCard`)

---

### 2. ?? Taps a quest

Sees the **BIG REWARD** preview screen before committing to anything.
Card shows: merchant, big reward title + description, # of challenges,
area, mini-rewards along the way, current progress (if returning).

**Code**
- `src/app/v1/travel-challenges/[id]/route.ts` ù detail payload
- iOS: `Presentation/Screens/Main/Quest/QuestPreviewView.swift`
- Router: `AppRouter.questPreview(id:, title:)`

---

### 3. ?? Start Quest ? Roll the Dice

Tap **Start Challenge** in Roll mode ? dice spin animation ?
lands on a random challenge from the user's incomplete-stops pool.

- Dice face value = position in pool (no "shows 6 / picks #3" cheat).
- `POST /v1/travel-challenges/:id/start` ensures a single active
  `travel_challenge_progress` session.

**Code**
- `MapViewModel.startRoll()` + `playRollAnimation(landingOn:)`
- `Presentation/Screens/Main/Map/Components/DiceView.swift` +
  `Dice3DView.swift`
- `ChallengeMapView` ù full-screen roll overlay

---

### 4. ?? Random challenge appears ? Accept

The dice settles ? full **PlaceDetailCard** appears with:
- Challenge title
- Description
- Verification badge ("Take a photo as proof" / "Stay here X min" / "Scan QR")
- Mini reward card
- Big **Yes, I'm in** button + **Skip - re-roll** secondary action

User taps **Yes, I'm in** ? `POST /v1/challenges/:id/accept` ?
NavigationModeView ? Apple Maps walking directions.

**Code**
- `Presentation/Screens/Main/Map/Components/PlaceDetailCard.swift`
  (`AcceptanceMode = .roll(skipsRemaining:) | .route`)
- `MapViewModel.acceptChallenge()`
- `src/app/v1/challenges/[id]/accept/route.ts`

---

### 5. ? Does the challenge ? earns XP + mini reward

User arrives ? confirms arrival ? completes verification:
- **Photo**: `PhotoVerifyView` uploads to `challenge-proofs` Storage
  bucket, then `POST /v1/challenges/:id/complete`.
- **GPS**: `GPSVerifyView` holds them inside `radius_meters` for
  `duration_minutes`, then completes the same endpoint.
- **QR Scan**: not in v1; planned for later.

On success ? **RewardQRView** shows:
- Mini reward title + description + discount + `+XP` chip
- Verification QR (6-char code) for the merchant to scan.

**Code**
- `Presentation/Screens/Main/Map/Components/PhotoVerifyView.swift`
- `Presentation/Screens/Main/Map/Components/GPSVerifyView.swift`
- `Presentation/Screens/Main/Map/Components/RewardQRView.swift` (with
  `RewardBundle`)
- `src/app/v1/challenges/[id]/complete/route.ts` (sets
  `player_status = 'submitted'`)
- `src/app/v1/redemptions/verify/route.ts` (merchant flip to
  `verified`, `player_status = 'claimed'`)

---

### 6. ?? Rolls again ? next challenge

After the user dismisses the reward QR, `returnToStackAfterReward()`
reloads the quest. The pool excludes already-`claimed`
stops so the next roll is honest. Sequence is unpredictable ù the user
never knows which of the remaining stops they'll get.

**Code**
- `MapViewModel.returnToStackAfterReward()`
- `src/lib/challenge-progress.ts` ù `derivePlayerStopStatus` excludes
  `claimed` / `submitted` from the rollable pool

---

### 7. ?? Skip up to 3 times ? then side ads

Roll-mode accept sheet has a **Skip - re-roll (N left)** action.

- Skip 1-3: `POST /v1/travel-challenges/:id/skip` ? consumes from
  `travel_challenge_progress.skips_used` (budget = `skips_limit`,
  default 3) ? re-rolls in place.
- After 3 skips: `SideAdBanner` appears at the bottom of the map ù
  small, dismissable, with **Watch ad to skip** CTA that escalates to
  the rewarded ad overlay.
- The legacy global skip pool (`profiles.free_skips_used`, 3 per 3h)
  still backs nearby Roll/Route browse outside of quests.

**Code**
- Migration `supabase/021_quest_skips.sql` ù `consume_quest_skip` RPC
- `src/app/v1/travel-challenges/[id]/skip/route.ts`
- iOS: `MapViewModel.skipQuestStop(...)` +
  `Presentation/Screens/Main/Map/Components/SideAdBanner.swift`

---

### 8. ?? Completes ALL challenges (minimum 6)

Publish rule: a quest can only go `live` with
`TRAVEL_CHALLENGE_STOP_COUNT = 6` stops (the constant keeps its
schema-aligned name). Once every stop's
`player_status = 'claimed'`,
`syncTravelChallengeProgressCompletion()` flips
`travel_challenge_progress.status` to `'completed'`.

**Code**
- `src/lib/validations/marketplace.ts` (constant)
- `src/lib/actions/travelChallenges.ts` ù
  `submitTravelChallengeForReview` + `reviewTravelChallenge` enforce
  the 6-stop minimum
- `src/lib/challenge-progress.ts` ù
  `syncTravelChallengeProgressCompletion`

---

### 9. ?? WINS THE BIG REWARD ? goes to the merchant's shop

When `progress.status` flips to `'completed'`,
`MapViewModel.refreshQuestStatus(id:)` mints a server-persisted claim
code via `POST /v1/travel-challenges/:id/big-reward` and surfaces
**`BigRewardClaimView`**:

- Trophy animation
- Big reward title + description + discount
- Business name + city
- Walking directions to the merchant
- QR + `TT-BR-XXXX-XXXX` claim code

Merchant scans the code via the Scan a QR flow (QR Hub):
`/v1/redemptions/verify` branches on `TT-BR-*` prefix and updates
`big_reward_redeemed_at` + `big_reward_redeemed_by`.

**Code**
- Migration `supabase/020_big_reward_redemption.sql`
- `src/app/v1/travel-challenges/[id]/big-reward/route.ts`
- `src/app/v1/redemptions/verify/route.ts` (TT-BR-* branch)
- `src/app/v1/redemptions/lookup/route.ts` (TT-BR-* branch)
- iOS: `Presentation/Screens/Main/Map/Components/BigRewardClaimView.swift`

---

### 10. ?? Shares on social media

`BigRewardClaimView` has a **Share my win** button that composes a
contextual payload via `UIActivityViewController`:

```
?? I just finished a quest on TravelTomo and won X!
Claiming it at Y in Z.
Find your own adventure at https://www.traveltomo.app
```

**Code**
- iOS: `ChallengeMapView.shareBigRewardWin(claim:)` +
  `presentShareSheet(activityItems:)`

---

## Worked example (client copy)

**Merchant**: Tomo Cat Shop (near CDC, Pampanga)
**Big reward**: Cat Mascot Giveaway + 500 XP

| # | Challenge | Mini reward |
|---|-----------|-------------|
| 1 | Find cats to feed at the CCTV operator house near CDC | Cat feeds OR voucher ? |
| 2 | Feed the cats ù take a selfie! | +50 XP ? |
| 3 | Find the hidden mural near Gate 3 | 10% off souvenir shop ? |
| 4 | Take a photo of the oldest tree at the CDC entrance | +50 XP ? |
| 5 | Buy a snack from the nearest sari-sari store | +50 XP ? |
| 6 | Go to Tomo Cat Shop and say the secret word! | Welcome treat ? |

?? **All complete** ? Claim Cat Mascot at Tomo Cat Shop.

**Result**: tourist spent 2-3 hours exploring the CDC area, visited
local businesses they'd never have found, ended up IN the merchant's
shop, had the best day of their trip.

---

## ASCII flow (client copy, preserved verbatim)

```
????????????????????????????????????????????????
?                                              ?
?  ?? OPEN APP                                 ?
?     ?                                        ?
?     ?                                        ?
?  ??? SEE NEARBY QUESTS (merchants)            ?
?     ?                                        ?
?     ?                                        ?
?  ?? TAP ON A QUEST                           ?
?     ?  See: Merchant, Big Reward,            ?
?     ?  # of challenges, area, time           ?
?     ?                                        ?
?     ?                                        ?
?  ?? START QUEST ? ROLL DICE                  ?
?     ?                                        ?
?     ?                                        ?
?  ?? RANDOM CHALLENGE APPEARS                 ?
?     ?                                        ?
?     ???? ? ACCEPT                           ?
?     ?      ?                                 ?
?     ?      ?                                 ?
?     ?   ??? NAVIGATE TO LOCATION              ?
?     ?      ?                                 ?
?     ?      ?                                 ?
?     ?   ?? DO THE CHALLENGE                   ?
?     ?      ?                                 ?
?     ?      ?                                 ?
?     ?   ? COMPLETE ? EARN XP + MINI REWARD  ?
?     ?      ?                                 ?
?     ?      ?                                 ?
?     ?   ?? ROLL AGAIN (next challenge)       ?
?     ?                                        ?
?     ???? ?? SKIP (max 3 times)               ?
?            ?                                 ?
?            ??? Skips remaining? ? Roll again  ?
?            ?                                 ?
?            ??? All 3 used? ? ?? Ads appear   ?
?                (side, non-intrusive,         ?
?                 skippable)                   ?
?                Must accept next challenges   ?
?                                              ?
?  ?????????????????????????????????           ?
?                                              ?
?  AFTER ALL CHALLENGES COMPLETED:             ?
?     ?                                        ?
?     ?                                        ?
?  ?? BIG REWARD UNLOCKED!                     ?
?     ?  + Total XP                            ?
?     ?  + Badge                               ?
?     ?  + All vouchers collected              ?
?     ?                                        ?
?     ?                                        ?
?  ?? GO TO MERCHANT TO CLAIM REWARD           ?
?     ?  (Show screen to claim)                ?
?     ?                                        ?
?     ?                                        ?
?  ?? SHARE ON SOCIAL MEDIA                    ?
?     ?                                        ?
?     ?                                        ?
?  ?? FIND NEXT QUEST!                         ?
?                                              ?
????????????????????????????????????????????????
```

---

## Status snapshot (2026-05-23)

| Step | Status |
|---|---|
| 1. Nearby quests on Home | ? shipped |
| 2. Quest preview with BIG REWARD | ? shipped |
| 3. Roll the dice (animated) | ? shipped |
| 4. Random challenge ? Accept card | ? shipped |
| 5. Complete ? XP + mini reward QR | ? shipped |
| 6. Roll again | ? shipped |
| 7. 3 skips ? side ads | ? shipped (migration 021) |
| 8. Complete all 6 | ? shipped (6-stop publish rule) |
| 9. WIN big reward + directions | ? shipped (migration 020 + TT-BR claim code) |
| 10. Share on social | ? shipped (contextual share sheet) |

Open items / improvements live in the repo issues, not here.
