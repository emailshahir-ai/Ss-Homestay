import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  AvailabilitySlot,
  Booking,
  BookingStatus,
  Feedback,
  SheetBookingRow,
  UnitType,
} from './types/homestay';
import {
  auth,
  db,
  getCachedAccessToken,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './lib/firebase';
import { ATTACHED_SHEET_CSV_URL, parseCsvText } from './lib/googleSheets';
import { HERO_IMAGE, HOMESTAY_DETAILS, ROOMSTAY_DETAILS } from './data/propertyData';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MAIN_MENU_ITEMS, Navbar } from './components/Navbar';
import { ResilientImage } from './components/ResilientImage';
import { BookingCalendarSection } from './components/BookingCalendarSection';
import { PropertyInfoSection } from './components/PropertyInfoSection';
import { GallerySection } from './components/GallerySection';
import { LocationSection } from './components/LocationSection';
import { FeedbackSection } from './components/FeedbackSection';

function toMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function HomestayApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(true);

  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState<boolean>(false);

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState<boolean>(true);

  const [selectedUnit, setSelectedUnit] = useState<UnitType>('homestay');
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(false);

  // Google Sheet CSV & Live Sheet states
  const [csvRows, setCsvRows] = useState<SheetBookingRow[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetBookingRow[]>([]);
  const [sheetSourceMode, setSheetSourceMode] = useState<'csv' | 'live-sheet'>('csv');
  const [sheetLoading, setSheetLoading] = useState<boolean>(true);
  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(null);
  const [connectedSheetInfo, setConnectedSheetInfo] = useState<{
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabTitle: string;
  } | null>(null);

  // Test Firestore connectivity & subscribe to auth state
  useEffect(() => {
    testConnection();
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setSheetsAccessToken(null);
        setAdminUnlocked(false);
      } else {
        const token = getCachedAccessToken();
        if (token) {
          setSheetsAccessToken(token);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Load attached Google Sheet CSV snapshot on initial boot
  useEffect(() => {
    let active = true;
    setSheetLoading(true);
    fetch(ATTACHED_SHEET_CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuatkan fail CSV Google Sheet.');
        return res.text();
      })
      .then((text) => {
        if (!active) return;
        const parsed = parseCsvText(text);
        setCsvRows(parsed);
        setSheetRows(parsed);
      })
      .catch((err) => {
        console.error('Gagal membaca CSV lampiran:', err);
      })
      .finally(() => {
        if (active) setSheetLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Public calendar occupancy listener (non-PII dates only)
  useEffect(() => {
    const unsubSlots = onSnapshot(
      collection(db, 'availability_slots'),
      (snapshot) => {
        const items: AvailabilitySlot[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            bookingId: String(data.bookingId || docSnap.id),
            userId: String(data.userId || ''),
            unitType: data.unitType === 'roomstay' ? 'roomstay' : 'homestay',
            checkIn: String(data.checkIn || ''),
            checkOut: String(data.checkOut || ''),
            status: data.status === 'cancelled' ? 'cancelled' : 'confirmed',
            createdAt: data.createdAt,
          };
        });
        setAvailabilitySlots(items);
        setSlotsLoading(false);
      },
      (error) => {
        setSlotsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'availability_slots');
      }
    );

    return () => unsubSlots();
  }, []);

  // Public guest feedback listener
  useEffect(() => {
    const unsubFeedback = onSnapshot(
      collection(db, 'feedbacks'),
      (snapshot) => {
        const items: Feedback[] = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              userId: String(data.userId || ''),
              authorName: String(data.authorName || ''),
              stayType: (data.stayType === 'roomstay' ? 'roomstay' : 'homestay') as UnitType,
              rating: Number(data.rating || 5),
              comment: String(data.comment || ''),
              createdAt: data.createdAt,
            };
          })
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

        setFeedbacks(items);
        setFeedbacksLoading(false);
      },
      (error) => {
        setFeedbacksLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'feedbacks');
      }
    );

    return () => unsubFeedback();
  }, []);

  // Private bookings listener (strictly admin-only when auth is ready)
  useEffect(() => {
    if (!authReady) return;
    const isAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);
    if (!isAdmin) {
      setUserBookings([]);
      setBookingsLoading(false);
      return;
    }

    setBookingsLoading(true);
    const bookingsQuery = collection(db, 'bookings');

    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const items: Booking[] = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              userId: String(data.userId || ''),
              unitType: (data.unitType === 'roomstay' ? 'roomstay' : 'homestay') as UnitType,
              guestName: String(data.guestName || ''),
              phone: data.phone ? String(data.phone) : undefined,
              state: String(data.state || ''),
              checkIn: String(data.checkIn || ''),
              checkOut: String(data.checkOut || ''),
              accountNumber: String(data.accountNumber || ''),
              nights: Number(data.nights || 1),
              totalAmount: Number(data.totalAmount || 0),
              status: (data.status === 'cancelled' ? 'cancelled' : 'confirmed') as BookingStatus,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            };
          })
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

        setUserBookings(items);
        setBookingsLoading(false);
      },
      (error) => {
        setBookingsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    return () => unsubBookings();
  }, [authReady, user]);

  // Merge Firestore availability slots with synced Google Sheet rows (deduplicated)
  const mergedAvailabilitySlots = useMemo<AvailabilitySlot[]>(() => {
    const bookingNameById = new Map<string, string>();
    userBookings.forEach((bk) => {
      if (bk.guestName) {
        bookingNameById.set(bk.id, bk.guestName);
      }
    });

    const sheetNameByKey = new Map<string, string>();
    sheetRows.forEach((row) => {
      sheetNameByKey.set(`${row.unitType}_${row.checkIn}_${row.checkOut}`, row.name);
    });

    const confirmedKeys = new Set<string>();
    const firestoreSlots: AvailabilitySlot[] = availabilitySlots.map((slot) => {
      const key = `${slot.unitType}_${slot.checkIn}_${slot.checkOut}`;
      if (slot.status === 'confirmed') {
        confirmedKeys.add(key);
      }
      return {
        ...slot,
        guestName: bookingNameById.get(slot.bookingId) || sheetNameByKey.get(key),
        source: 'firestore',
      };
    });

    const sheetSlots: AvailabilitySlot[] = [];
    sheetRows.forEach((row) => {
      const key = `${row.unitType}_${row.checkIn}_${row.checkOut}`;
      if (!confirmedKeys.has(key)) {
        confirmedKeys.add(key);
        sheetSlots.push({
          id: row.id,
          bookingId: row.id,
          userId: 'google_sheet',
          unitType: row.unitType,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          status: 'confirmed',
          guestName: row.name,
          source: 'sheet',
        });
      }
    });

    return [...firestoreSlots, ...sheetSlots];
  }, [availabilitySlots, sheetRows, userBookings]);

  const handleLiveRowsLoaded = (
    rows: SheetBookingRow[],
    spreadsheetId: string,
    spreadsheetTitle: string,
    tabTitle: string
  ) => {
    setSheetRows(rows);
    setSheetSourceMode('live-sheet');
    setConnectedSheetInfo({ spreadsheetId, spreadsheetTitle, tabTitle });
  };

  const handleResetToCsv = () => {
    setSheetRows(csvRows);
    setSheetSourceMode('csv');
    setConnectedSheetInfo(null);
  };

  const scrollToCalendar = (unit?: UnitType, focusAdmin?: boolean) => {
    if (unit) {
      setSelectedUnit(unit);
    }
    const el = document.getElementById('kalendar-tempahan');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
    if (focusAdmin) {
      setTimeout(() => {
        const input = document.getElementById('admin-password-input') as HTMLInputElement | null;
        input?.focus();
      }, 350);
    }
  };

  return (
    <div id="utama" className="min-h-screen flex flex-col bg-[#F8F9F7] text-[#161B17]">
      <Navbar
        adminUnlocked={adminUnlocked}
        onBookClick={() => scrollToCalendar(undefined, !adminUnlocked)}
      />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-[1360px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-10">
          {/* Primary Hero Banner */}
          <div className="rounded-2xl overflow-hidden border border-[#DDE2DC] bg-white mb-6">
            <ResilientImage
              src={HERO_IMAGE}
              alt="Gambar utama Ss Homestay Kampung Padang Enggang dengan kolam renang persendirian dan fasad banglo"
              title="Ss Homestay & Roomstay"
              className="w-full aspect-[2480/970] max-h-[460px] object-cover object-top block"
            />
          </div>

          {/* Hero Copy & Primary Actions */}
          <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-4 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#525C54]">
                <span>Tunjong, Kota Bharu, Kelantan</span>
                <span aria-hidden="true">·</span>
                <span>Muslim Homestay & Roomstay</span>
                <span aria-hidden="true">·</span>
                <span>Private Pool</span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight text-[#161B17] leading-[1.14] text-balance">
                Penginapan Selesa & Luas di Ss Homestay dan Roomstay
              </h1>

              <p className="text-sm sm:text-base text-[#525C54] leading-relaxed">
                Muslim Homestay di Kampung Padang Enggang, Tunjong, Kota Bharu dengan kolam renang persendirian (Private Pool), 3 bilik tidur berhawa dingin, WiFi laju, serta pilihan suite Roomstay. Semak kekosongan terus pada kalendar dan hubungi admin untuk tempahan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => scrollToCalendar()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors cursor-pointer"
              >
                Semak Kalendar Kekosongan
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollToCalendar(undefined, true)}
                className="px-4 py-3 rounded-xl border border-[#DDE2DC] bg-[#F8F9F7] text-sm font-medium text-[#161B17] hover:border-[#14532D] hover:text-[#14532D] transition-colors cursor-pointer"
              >
                {adminUnlocked ? 'Panel Tempahan Admin' : 'Log Masuk Admin'}
              </button>
            </div>
          </div>

          {/* 4-Column Quick Rate & Check-In Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-white border border-[#DDE2DC] rounded-xl p-4 sm:p-5">
              <span className="block text-xs text-[#525C54]">Ss Homestay (3 Bilik · Private Pool)</span>
              <span className="font-mono-tabular text-xl font-bold text-[#14532D] mt-1 block">
                RM {HOMESTAY_DETAILS.rate} / malam
              </span>
            </div>
            <div className="bg-white border border-[#DDE2DC] rounded-xl p-4 sm:p-5">
              <span className="block text-xs text-[#525C54]">Ss Roomstay (1 Bilik · Katil Queen)</span>
              <span className="font-mono-tabular text-xl font-bold text-[#14532D] mt-1 block">
                RM {ROOMSTAY_DETAILS.rate} / malam
              </span>
            </div>
            <div className="bg-white border border-[#DDE2DC] rounded-xl p-4 sm:p-5">
              <span className="block text-xs text-[#525C54]">Check In / Check Out</span>
              <span className="font-mono-tabular text-base sm:text-lg font-semibold text-[#161B17] mt-1 block">
                03:00 PM · 12:00 PM
              </span>
            </div>
            <div className="bg-white border border-[#DDE2DC] rounded-xl p-4 sm:p-5">
              <span className="block text-xs text-[#525C54]">Kapasiti & Deposit</span>
              <span className="font-mono-tabular text-base sm:text-lg font-semibold text-[#161B17] mt-1 block">
                Maks 10 Org · Dep RM 100
              </span>
            </div>
          </div>
        </section>

        {/* Booking Calendar & Form Section */}
        <BookingCalendarSection
          user={user}
          authReady={authReady}
          adminUnlocked={adminUnlocked}
          onUnlockAdmin={() => setAdminUnlocked(true)}
          onLockAdmin={() => setAdminUnlocked(false)}
          availabilitySlots={mergedAvailabilitySlots}
          slotsLoading={slotsLoading && sheetLoading}
          userBookings={userBookings}
          bookingsLoading={bookingsLoading}
          selectedUnit={selectedUnit}
          onSelectUnit={setSelectedUnit}
          sheetRows={sheetRows}
          sheetSourceMode={sheetSourceMode}
          sheetLoading={sheetLoading}
          sheetsAccessToken={sheetsAccessToken}
          onSheetsTokenObtained={setSheetsAccessToken}
          onLiveRowsLoaded={handleLiveRowsLoaded}
          onResetToCsv={handleResetToCsv}
          connectedSheetInfo={connectedSheetInfo}
        />

        {/* 1. Maklumat Homestay & 2. Maklumat Roomstay */}
        <PropertyInfoSection onChooseUnit={(unit) => scrollToCalendar(unit)} />

        {/* 3. Gambar Homestay & 4. Gambar Roomstay */}
        <GallerySection />

        {/* 5. Lokasi */}
        <LocationSection />

        {/* 6. Maklum Balas Pengguna */}
        <FeedbackSection
          user={user}
          feedbacks={feedbacks}
          feedbacksLoading={feedbacksLoading}
        />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#DDE2DC] bg-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="font-display text-lg font-semibold text-[#161B17]">
              Ss Homestay & Roomstay
            </p>
            <p className="text-xs text-[#525C54] mt-1">
              Lot 13085, Kampung Padang Enggang, 15100 Kota Bharu, Kelantan · 016-9867367 (Hjh. Sarina) · 016-9863776 (Hj. Shahir)
            </p>
          </div>

          <nav aria-label="Pautan Kaki" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#525C54]">
            {MAIN_MENU_ITEMS.map((item) => (
              <a key={item.id} href={item.href} className="hover:text-[#14532D] transition-colors">
                {item.label}
              </a>
            ))}
          </nav>

          <p className="text-xs text-[#525C54]">
            © {new Date().getFullYear()} Ss Homestay & Roomstay. Hak cipta terpelihara.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HomestayApp />
    </ErrorBoundary>
  );
}
