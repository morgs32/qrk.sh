import type { ReactNode } from 'react';
import Link from 'next/link';

const portfolioItems = [
  { color: 'bg-[#E86F3A]', icon: 'flag' },
  { color: 'bg-[#1A1A1A]', icon: 'circle' },
  { color: 'bg-[#4A7C59]', icon: 'arch' },
  { color: 'bg-[#3B7FBD]', icon: 'grid' },
  { color: 'bg-[#F5F0E6]', icon: 'bench' },
  { color: 'bg-[#4A7C59]', icon: 'g-logo' },
  { color: 'bg-[#F5F0E6]', icon: 'square' },
  { color: 'bg-[#F5D6D0]', icon: 'dots' },
  { color: 'bg-[#1A1A1A]', icon: 'm-logo' },
  { color: 'bg-[#E86F3A]', icon: 'block' },
  { color: 'bg-[#8B7BB5]', icon: 'lines' },
  { color: 'bg-[#F5D6D0]', icon: 'asterisk' },
  { color: 'bg-[#4A7C59]', icon: null },
  { color: 'bg-[#4A7C59]', icon: 'cross' },
];

const workItems = [
  { name: 'Blanchette', category: 'Identity' },
  { name: 'Yalika Bay Tower Station', category: 'Identity' },
  { name: 'Little Phil App', category: 'Identity' },
  { name: 'Banka', category: 'Identity' },
  { name: 'Used Venue Garage', category: 'Identity' },
  { name: 'Yarrawee Place Identity', category: 'Identity' },
  { name: 'Yarrawee Place Signage', category: 'Identity' },
  { name: 'Kane Identity', category: 'Identity' },
  { name: 'Southland Regional Art Gallery', category: 'Identity' },
  { name: 'Pan Andino', category: 'Packaging' },
  { name: 'Souki Oil', category: 'Identity' },
  { name: 'Buddy Johnson', category: 'Identity' },
  { name: 'Piccoli', category: 'Identity' },
  { name: "Sydney New Year's Eve", category: 'Identity' },
  { name: 'Type And Fonts', category: 'Identity' },
  { name: 'Benvito', category: 'Identity' },
  { name: 'City Planning Authority', category: 'Identity' },
  { name: 'Attrakt Identity', category: 'Identity' },
  { name: 'Joey Ramone', category: 'Identity' },
  { name: 'Sally Scott', category: 'Typography' },
  { name: 'The Code', category: 'Identity' },
  { name: 'Rio Carmen', category: 'Identity' },
  { name: 'Jarvis Bell', category: 'Photography' },
  { name: 'Artwork Shrines', category: 'Identity' },
  { name: 'Civic exhibition', category: 'Identity' },
  { name: 'Syllabutterpark', category: 'Publishing' },
  { name: 'SLM Launch', category: 'Big Image' },
  { name: 'Almenada Primary Mercurio', category: 'Publishing' },
  { name: 'Year of The Rainbow', category: 'Publishing' },
  { name: 'Desert Atlas', category: 'Publishing' },
  { name: 'Happy Home', category: 'Identity' },
  { name: 'Made Nice Illustration', category: 'Identity' },
  { name: 'Good Reasons Awards 2017', category: 'Identity' },
  { name: 'The Premise Main Identity', category: 'Identity' },
  { name: 'Azerbaijan Record', category: 'Identity' },
  { name: 'ADI Open Sydney 2023', category: 'Identity' },
  { name: 'Good Fortune Awards 2018', category: 'Identity' },
  { name: 'All Home', category: 'Identity' },
  { name: 'Charing Business', category: 'Identity' },
  { name: 'Bopha Plus Project', category: 'Big Image' },
  { name: 'Matrimoji Identity', category: 'Identity' },
  { name: 'Matthew Calico Interop', category: 'Identity' },
  { name: 'Nowra', category: 'Identity' },
  { name: 'Aspinal Review', category: 'Identity' },
  { name: 'The Architects Bookshop', category: 'Identity' },
  { name: 'Perl Tangara Conference', category: 'Identity' },
];

function PortfolioIcon({ type }: { type: string | null }) {
  if (!type) return null;

  const iconMap: Record<string, ReactNode> = {
    flag: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <path d="M30 20 L30 80 M30 20 L70 35 L30 50" fill="currentColor" />
      </svg>
    ),
    circle: <div className="w-20 h-20 rounded-full bg-current" />,
    arch: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <path
          d="M20 80 L20 50 Q20 20 50 20 Q80 20 80 50 L80 80 M40 80 L40 50 Q40 40 50 40 Q60 40 60 50 L60 80"
          fill="currentColor"
        />
      </svg>
    ),
    grid: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <rect x="15" y="15" width="30" height="30" fill="currentColor" />
        <rect x="55" y="15" width="30" height="30" fill="currentColor" />
        <rect x="15" y="55" width="30" height="30" fill="currentColor" />
        <rect x="55" y="55" width="30" height="30" fill="currentColor" />
      </svg>
    ),
    bench: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <rect x="20" y="50" width="25" height="30" fill="currentColor" />
        <rect x="55" y="30" width="25" height="50" fill="currentColor" />
      </svg>
    ),
    'g-logo': (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <path
          d="M70 30 Q30 30 30 50 Q30 70 50 70 L70 70 L70 50 L50 50"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
        />
      </svg>
    ),
    square: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <rect
          x="25"
          y="25"
          width="50"
          height="50"
          rx="8"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
        />
      </svg>
    ),
    dots: (
      <div className="grid grid-cols-3 gap-3">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-full bg-current" />
        ))}
      </div>
    ),
    'm-logo': (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <path
          d="M20 70 L20 30 L35 50 L50 30 L50 70 M50 70 L50 30 L65 50 L80 30 L80 70"
          fill="currentColor"
        />
      </svg>
    ),
    block: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <rect x="20" y="20" width="30" height="60" fill="currentColor" />
        <rect x="55" y="20" width="25" height="30" fill="currentColor" />
        <rect x="55" y="55" width="25" height="25" fill="currentColor" />
      </svg>
    ),
    lines: (
      <svg viewBox="0 0 100 100" className="w-20 h-20">
        <rect x="20" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="35" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="50" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="65" y="15" width="8" height="70" rx="4" fill="currentColor" />
      </svg>
    ),
    asterisk: (
      <svg viewBox="0 0 100 100" className="w-16 h-16">
        <path
          d="M50 20 L50 80 M20 35 L80 65 M20 65 L80 35"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
    ),
    cross: (
      <svg viewBox="0 0 100 100" className="w-12 h-12">
        <path
          d="M30 30 L45 50 L30 70 M70 30 L55 50 L70 70"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
  };

  return <>{iconMap[type]}</>;
}

export default function HomePage() {
  return (
    <div className="h-screen overflow-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-background px-6">
        <Link href="/" className="text-sm font-medium">
          Garlott
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/work"
            className="text-xs transition-opacity hover:opacity-70"
          >
            Work
          </Link>
          <Link
            href="/about"
            className="text-xs transition-opacity hover:opacity-70"
          >
            About
          </Link>
          <Link
            href="/follow"
            className="text-xs transition-opacity hover:opacity-70"
          >
            Follow
          </Link>
          <Link
            href="/admin"
            className="text-xs transition-opacity hover:opacity-70"
          >
            Admin
          </Link>
        </nav>
        <button
          type="button"
          className="rounded-full bg-foreground px-3 py-1.5 text-[10px] text-background transition-opacity hover:opacity-90"
        >
          START A PROJECT
        </button>
      </header>

      <div className="flex h-screen pt-16">
        <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
          <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">
            Hello
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
            We are a Sydney-based design studio specialising in branding and
            wayfinding.
          </p>
        </div>

        <div className="ml-auto h-[calc(100vh-4rem)] w-1/2 overflow-y-auto">
          <div className="grid grid-cols-2">
            {portfolioItems.map((item, index) => (
              <div
                key={index}
                className={`${item.color} flex aspect-square items-center justify-center ${
                  item.color.includes('1A1A1A')
                    ? 'text-white'
                    : item.color.includes('F5F0E6') ||
                        item.color.includes('F5D6D0')
                      ? 'text-foreground'
                      : 'text-black'
                }`}
              >
                <PortfolioIcon type={item.icon} />
              </div>
            ))}
          </div>

          <div className="bg-[#F0EDE8] px-6 py-16">
            <h2 className="mb-12 text-6xl font-bold">Work</h2>
            <div className="space-y-4">
              {workItems.map((item, index) => (
                <Link
                  key={index}
                  href="#"
                  className="block transition-opacity hover:opacity-70"
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.category}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
