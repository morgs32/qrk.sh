import Link from 'next/link';
import { HomeShell } from '@/components/home/home-shell';

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

      <HomeShell workItems={workItems} />
    </div>
  );
}
