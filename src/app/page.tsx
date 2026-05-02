import Link from "next/link";
import Image from "next/image";
import {
  MapPin,
  Dice5,
  Trophy,
  Gift,
  Smartphone,
  Users,
  ArrowRight,
  QrCode,
  Award,
  Navigation,
  CheckCircle2,
} from "lucide-react";
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

/* ───────────────────────── Nav ───────────────────────── */

function Nav() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="TravelTomo" width={120} height={32} className="h-8 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">
            How It Works
          </a>
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#merchants" className="hover:text-white transition-colors">
            For Merchants
          </a>
          <Link href="/admin/login" className="hover:text-white transition-colors">
            Dashboard
          </Link>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-sm rounded-full px-5">
          Download App
        </Button>
      </div>
    </nav>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

function Hero() {
  return (
    <section className="relative pt-28 pb-0 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-700/20 via-red-900/10 to-zinc-950" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Left copy */}
          <div className="pb-16 md:pb-24">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white mb-8">
              <Image src="/star.png" alt="" width={16} height={16} />
              Now live in Angeles City, Pampanga
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Explore the Philippines
              <br />
              <span className="text-red-500">like a game.</span>
            </h1>

            <p className="max-w-lg text-base md:text-lg text-zinc-400 leading-relaxed mb-8">
              Roll the dice. Discover hidden gems. Complete challenges.
              Earn real rewards from local businesses.
              TravelTomo turns every trip into an adventure.
            </p>

            <div className="flex items-center gap-4">
              <Button size="lg" className="bg-red-600 hover:bg-red-700 text-sm font-semibold rounded-full px-6 h-11">
                <Smartphone className="h-4 w-4 mr-2" />
                Download for iOS
              </Button>
              <span className="text-sm text-zinc-500">Available on Android Soon</span>
            </div>
          </div>

          {/* Right phone mockup */}
          <div className="relative flex justify-center md:justify-end">
            <Image
              src="/hero-phone.png"
              alt="TravelTomo app on iPhone"
              width={400}
              height={418}
              className="relative z-10 max-w-[320px] md:max-w-[400px] h-auto drop-shadow-2xl"
              priority
            />
          </div>
        </div>
      </div>

      {/* Divider curve */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent" />
    </section>
  );
}

/* ───────────────────── How It Works ─────────────────── */

function HowItWorks() {
  const steps = [
    {
      icon: "/icon-dice.png",
      title: "Roll the Dice",
      description:
        "Start your adventure with a dice roll that determines your next destination on the map.",
    },
    {
      icon: "/icon-discover.png",
      title: "Discover",
      description:
        "Follow the path to real locations — restaurants, landmarks, hidden spots curated by locals.",
    },
    {
      icon: "/icon-challenge.png",
      title: "Complete Challenges",
      description:
        "Check in, snap photos, scan QR codes, or answer trivia to prove you were there.",
    },
    {
      icon: "/icon-reward.png",
      title: "Earn Rewards",
      description:
        "Collect XP, badges, and real discounts from the businesses you visit.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="text-zinc-500 text-sm mb-2">Here&apos;s how it works</p>
          <h2 className="text-3xl md:text-4xl font-bold">
            Your adventure in 4 steps.
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="flex justify-center mb-5">
                <Image
                  src={step.icon}
                  alt={step.title}
                  width={80}
                  height={80}
                  className="h-20 w-20 object-contain"
                />
              </div>
              <div className="text-xs font-bold text-zinc-500 mb-1 tracking-wider">
                STEP {i + 1}
              </div>
              <h3 className="text-base font-bold mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Features ──────────────────────── */

function Features() {
  const features = [
    {
      icon: <Dice5 className="h-5 w-5" />,
      title: "3D Dice Rolls",
      desc: "Start your adventure with a dice roll that determines your next destination on the map.",
    },
    {
      icon: <Navigation className="h-5 w-5" />,
      title: "Real-Time Navigation",
      desc: "Follow routes to curated locations with live maps.",
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      title: "Challenge System",
      desc: "GPS check-ins, photo proofs, QR scans, and quizzes.",
    },
    {
      icon: <QrCode className="h-5 w-5" />,
      title: "QR Rewards",
      desc: "Scan QR codes at businesses for real discounts.",
    },
    {
      icon: <Award className="h-5 w-5" />,
      title: "XP & Badges",
      desc: "Level up your explorer profile with every adventure.",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Local Partnerships",
      desc: "Challenges created by real businesses in your area.",
    },
  ];

  return (
    <section id="features" className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="text-red-500 font-medium text-sm mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold">
            Everything you need to explore
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:border-zinc-700 transition-colors"
            >
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

/* ──────────────────── For Merchants ──────────────────── */

function ForMerchants() {
  const checklist = [
    "Create challenges in minutes with our guided wizard",
    "Set GPS, QR, photo, or quiz verification",
    "Attach discount rewards with redemption limits",
    "Track completions and redemptions in real time",
  ];

  const steps = [
    { step: "1", text: "Create your business profile" },
    { step: "2", text: "Build a challenge with rewards" },
    { step: "3", text: "Submit for approval" },
    { step: "4", text: "Challenge goes live" },
    { step: "5", text: "Travelers discover your business" },
  ];

  return (
    <section id="merchants" className="py-24 bg-red-600">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left copy */}
          <div>
            <p className="text-red-200 font-medium text-sm mb-3">
              For Businesses
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
              Drive foot traffic with gamified challenges.
            </h2>
            <p className="text-red-100/80 leading-relaxed mb-8">
              Create challenges that bring travelers to your door. Set up
              QR-based rewards, track redemptions, and watch your business
              grow — all from the TravelTomo merchant dashboard.
            </p>
            <ul className="space-y-3 text-sm text-white/90 mb-8">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-white mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4">
              <Link href="/admin/register">
                <Button className="bg-white text-red-600 hover:bg-zinc-100 font-semibold rounded-full px-6">
                  Register as a Merchant
                </Button>
              </Link>
              <Link
                href="/admin/register"
                className="text-sm text-white/80 underline underline-offset-4 hover:text-white"
              >
                Register as a User
              </Link>
            </div>
          </div>

          {/* Right steps card */}
          <div className="relative">
            <div className="rounded-2xl bg-red-700/60 backdrop-blur-sm p-8 border border-red-500/30">
              <div className="space-y-5">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                      {s.step}
                    </div>
                    <span className="text-white font-medium">{s.text}</span>
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

/* ─────────────────────── CTA ────────────────────────── */

function CTA() {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background illustration */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <Image
          src="/cta-bg.png"
          alt=""
          width={1436}
          height={722}
          className="max-w-none w-[120%] object-cover"
        />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-4">
          Ready to Explore?
        </h2>
        <p className="text-zinc-400 text-lg mb-10">
          Download TravelTomo and start your first adventure today.
          Currently available in Angeles City, Pampanga.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-sm font-semibold rounded-full px-8 h-12"
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Download on iOS
          </Button>
          <Link href="/admin/register">
            <Button
              size="lg"
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-600/10 text-sm rounded-full px-8 h-12"
            >
              Become a Merchant Partner
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── Footer ───────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center gap-6">
          {/* Tagline + logo */}
          <p className="text-zinc-500 text-sm italic">
            Explore. Play. Earn. Repeat.
          </p>
          <Image src="/logo.svg" alt="TravelTomo" width={140} height={40} className="h-10 w-auto" />

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms
            </a>
            <a
              href="mailto:hello@traveltomo.app"
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
            <Link
              href="/admin/login"
              className="hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          </div>

          <p className="text-xs text-zinc-600">
            2026 Catalyst Vista Tech. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
