import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
}

export const MAIN_MENU_ITEMS: NavMenuItem[] = [
  { id: 'maklumat-homestay', label: '1. Maklumat Homestay', href: '#maklumat-homestay' },
  { id: 'maklumat-roomstay', label: '2. Maklumat Roomstay', href: '#maklumat-roomstay' },
  { id: 'gambar-homestay', label: '3. Gambar Homestay', href: '#gambar-homestay' },
  { id: 'gambar-roomstay', label: '4. Gambar Roomstay', href: '#gambar-roomstay' },
  { id: 'lokasi', label: '5. Lokasi', href: '#lokasi' },
  { id: 'maklum-balas', label: '6. Maklum Balas Pengguna', href: '#maklum-balas' },
];

interface NavbarProps {
  onBookClick: () => void;
  adminUnlocked?: boolean;
}

export function Navbar({ onBookClick, adminUnlocked = false }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#F8F9F7]/95 backdrop-blur-sm border-b border-[#DDE2DC]">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#utama"
          className="font-display text-lg font-semibold tracking-tight text-[#161B17] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#14532D]"
        >
          Ss Homestay & Roomstay
        </a>

        {/* Zone 2: 6 Requested Menu Links */}
        <nav
          aria-label="Menu Utama"
          className="hidden xl:flex items-center gap-5 text-[13px] font-medium text-[#525C54]"
        >
          {MAIN_MENU_ITEMS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="hover:text-[#14532D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 py-1"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBookClick}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532D]"
          >
            {adminUnlocked ? 'Panel Tempahan Admin' : 'Kalendar & Admin'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={mobileOpen}
            className="xl:hidden p-2 rounded-lg border border-[#DDE2DC] text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Menu Drawer for Tablet & Mobile */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-[#DDE2DC] bg-white px-4 py-4">
          <nav aria-label="Menu Mudah Alih" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MAIN_MENU_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-[#161B17] hover:bg-[#EFF2EE] transition-colors whitespace-nowrap"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
