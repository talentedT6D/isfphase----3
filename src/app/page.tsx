import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col items-center justify-center px-4 font-mono">
      <div className="text-[10px] tracking-[0.4em] text-stone-500 mb-2">
        INDIAN SCROLL FESTIVAL · 2026
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">
        ISF Judging System
      </h1>
      <p className="text-stone-500 text-sm mt-2">
        Pick the surface for this device.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        <Tile
          href="/admin"
          title="Admin"
          sub="Desktop · operator"
          note="Controls playback and voting."
        />
        <Tile
          href="/hall"
          title="Hall Screen"
          sub="Projector · kiosk"
          note="Plays video. Nothing else."
        />
        <Tile
          href="/voter"
          title="Voter"
          sub="Mobile · audience"
          note="Sign in, rate, vibe."
        />
      </div>

      <p className="text-stone-400 text-[10px] mt-10 tracking-wider">
        Bangalore International Centre · 16 May 2026
      </p>
    </div>
  );
}

function Tile({
  href,
  title,
  sub,
  note,
}: {
  href: string;
  title: string;
  sub: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-stone-300 bg-white p-5 hover:border-stone-900 transition-colors"
    >
      <div className="text-[10px] tracking-wider text-stone-500">
        {sub.toUpperCase()}
      </div>
      <div className="text-xl font-semibold mt-1">{title}</div>
      <div className="text-xs text-stone-600 mt-2">{note}</div>
    </Link>
  );
}
