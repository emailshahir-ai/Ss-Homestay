import { useState } from 'react';
import { Lock, Menu, Unlock, X } from 'lucide-react';

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
}

export const MAIN_MENU_ITEMS: NavMenuItem[] = [
  { id: 'maklumat-homestay', label: 'Maklumat Homestay', href: '#maklumat-homestay' },
  { id: 'maklumat-roomstay', label: 'Maklumat Roomstay', href: '#maklumat-roomstay' },
  { id: 'gambar-homestay', label: 'Gambar Homestay', href: '#gambar-homestay' },
  { id: 'gambar-roomstay', label: 'Gambar Roomstay', href: '#gambar-roomstay' },
  { id: 'lokasi', label: 'Lokasi', href: '#lokasi' },
  { id: 'maklum-balas', label: 'Maklum Balas Pengguna', href: '#maklum-balas' },
];

interface NavbarProps {
  onBookClick: () => void;
  adminUnlocked?: boolean;
}

export function Navbar({ onBookClick, adminUnlocked = false }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 shadow-xs">
      {/* Top Brand & Admin Row */}
      <div className="bg-[#F8F9F7]/95 backdrop-blur-sm border-b border-[#DDE2DC]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <a
            href="#utama"
            className="font-display text-lg font-semibold tracking-tight text-[#161B17] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#14532D]"
          >
            Ss Homestay & Roomstay
          </a>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onBookClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold tracking-wide text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532D]"
            >
              {adminUnlocked ? (
                <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>ADMIN</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={mobileOpen}
              className="md:hidden p-2 rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Colored Navigation Bar (Tablet & Desktop) */}
      <div className="hidden md:block bg-[#14532D] border-b border-[#0F3F22]">
        <nav
          aria-label="Menu Utama"
          className="max-w-[1360px] mx-auto px-4 sm:px-6 flex items-center justify-between"
        >
          <div className="flex items-center divide-x divide-white/15 w-full">
            {MAIN_MENU_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="flex-1 text-center px-3 py-2.5 text-xs lg:text-[13px] font-medium text-white/95 hover:text-white hover:bg-[#166534] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      {/* Colored Mobile Menu Drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-[#14532D] border-b border-[#0F3F22] px-4 py-3">
          <nav aria-label="Menu Mudah Alih" className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {MAIN_MENU_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="px-3.5 py-2.5 rounded-lg text-sm font-medium text-white/95 hover:text-white hover:bg-[#166534] transition-colors whitespace-nowrap"
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
