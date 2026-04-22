import Link from "next/link";
import { MapPin, Dice5, Trophy, Gift, Smartphone, Users, ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <ForMerchants />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600">
            <span className="text-sm font-bold">T</span>
          </div>
          <span className="text-lg font-bold">TravelTomo</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#merchants" className="hover:text-white transition-colors">For Merchants</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/login">
            <Button variant="ghost" className="text-zinc-400 hover:text-white text-sm">Dashboard</Button>
          </Link>
          <Button className="bg-red-600 hover:bg-red-700 text-sm">Download App</Button>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-red-600/10 via-transparent to-transparent" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-red-600/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-1.5 text-sm text-zinc-400 mb-8">
          <Star className="h-3.5 w-3.5 text-yellow-500" />
          Now in Angeles City, Pampanga
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Explore the Philippines
          <br />
          <span className="bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
            like a game
          </span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg md:text-xl text-zinc-400 leading-relaxed mb-10">
          Roll the dice. Discover hidden gems. Complete challenges.
          Earn real rewards from local businesses. TravelTomo turns
          every trip into an adventure.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="bg-red-600 hover:bg-red-700 text-base px-8 h-12">
            <Smartphone className="h-4 w-4 mr-2" />
            Download for iOS
          </Button>
          <Button size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-base px-8 h-12">
            Coming to Android
          </Button>
        </div>

        <div className="mt-16 flex items-center justify-center gap-8 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-red-500" />
            50+ Places
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Real Rewards
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Free to Play
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Dice5 className="h-8 w-8" />,
      title: "Roll the Dice",
      description: "Start your adventure with a dice roll that determines your next destination on the map.",
      color: "from-red-600 to-red-700",
    },
    {
      icon: <MapPin className="h-8 w-8" />,
      title: "Explore & Navigate",
      description: "Follow the path to real locations — restaurants, landmarks, hidden spots curated by locals.",
      color: "from-orange-500 to-orange-600",
    },
    {
      icon: <Trophy className="h-8 w-8" />,
      title: "Complete Challenges",
      description: "Check in, snap photos, scan QR codes, or answer trivia to prove you were there.",
      color: "from-yellow-500 to-yellow-600",
    },
    {
      icon: <Gift className="h-8 w-8" />,
      title: "Earn Rewards",
      description: "Collect XP, badges, and real discounts from the businesses you visit.",
      color: "from-green-500 to-green-600",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="text-red-500 font-medium text-sm mb-3">HOW IT WORKS</p>
          <h2 className="text-3xl md:text-4xl font-bold">Your adventure in four steps</h2>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative group">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 h-full hover:border-zinc-700 transition-colors">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${step.color} text-white mb-4`}>
                  {step.icon}
                </div>
                <div className="text-xs font-bold text-zinc-500 mb-2">STEP {i + 1}</div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: <Dice5 className="h-5 w-5" />, title: "3D Dice Rolls", desc: "Animated dice with haptic feedback decide your fate." },
    { icon: <MapPin className="h-5 w-5" />, title: "Real-Time Navigation", desc: "Follow routes to curated locations with live maps." },
    { icon: <Trophy className="h-5 w-5" />, title: "Challenge System", desc: "GPS check-ins, photo proofs, QR scans, and quizzes." },
    { icon: <Gift className="h-5 w-5" />, title: "QR Rewards", desc: "Scan QR codes at businesses for real discounts." },
    { icon: <Star className="h-5 w-5" />, title: "XP & Badges", desc: "Level up your explorer profile with every adventure." },
    { icon: <Users className="h-5 w-5" />, title: "Local Partnerships", desc: "Challenges created by real businesses in your area." },
  ];

  return (
    <section id="features" className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="text-red-500 font-medium text-sm mb-3">FEATURES</p>
          <h2 className="text-3xl md:text-4xl font-bold">Everything you need to explore</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/10 text-red-500">
                  {f.icon}
                </div>
                <h3 className="font-semibold">{f.title}</h3>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForMerchants() {
  return (
    <section id="merchants" className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-red-500 font-medium text-sm mb-3">FOR BUSINESSES</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Drive foot traffic with gamified challenges
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-8">
              Create challenges that bring travelers to your door. Set up QR-based
              rewards, track redemptions, and watch your business grow — all from
              the TravelTomo merchant dashboard.
            </p>
            <ul className="space-y-3 text-sm text-zinc-300 mb-8">
              {[
                "Create challenges in minutes with our guided wizard",
                "Set GPS, QR, photo, or quiz verification",
                "Attach discount rewards with redemption limits",
                "Track completions and redemptions in real time",
                "Admin approval ensures quality for travelers",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600/20 text-green-400 text-xs">
                    &#10003;
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/admin/register">
              <Button className="bg-red-600 hover:bg-red-700">
                Register as Merchant
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
              <div className="space-y-4">
                {[
                  { step: "1", text: "Create your business profile", done: true },
                  { step: "2", text: "Build a challenge with rewards", done: true },
                  { step: "3", text: "Submit for approval", done: true },
                  { step: "4", text: "Challenge goes live", done: false },
                  { step: "5", text: "Travelers discover your business", done: false },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.done ? "bg-green-600/20 text-green-400" : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {s.step}
                    </div>
                    <span className={s.done ? "text-white" : "text-zinc-500"}>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Ready to explore?
        </h2>
        <p className="text-zinc-400 text-lg mb-8">
          Download TravelTomo and start your first adventure today.
          Currently available in Angeles City, Pampanga.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="bg-red-600 hover:bg-red-700 text-base px-8 h-12">
            <Smartphone className="h-4 w-4 mr-2" />
            Download for iOS
          </Button>
          <Link href="/admin/register">
            <Button size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-base px-8 h-12">
              Become a Merchant Partner
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-xs font-bold">T</div>
            <span className="font-semibold">TravelTomo</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="mailto:hello@traveltomo.app" className="hover:text-white transition-colors">Contact</a>
            <Link href="/admin/login" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
          <p className="text-xs text-zinc-600">2026 Catalyst Vista Tech. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
