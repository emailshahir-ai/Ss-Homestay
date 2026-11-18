import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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
import {
  ATTACHED_SHEET_CSV_URL,
  DEFAULT_APPS_SCRIPT_URL,
  fetchWebhookSheetRows,
  LEGACY_DEFAULT_APPS_SCRIPT_URL,
  parseCsvText,
} from './lib/googleSheets';
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
  const [bookingAccessKey, setBookingAccessKey] = useState<string | null>(null);

  // Google Sheet CSV, Apps Script Webhook & Live OAuth Sheet states
  const [csvRows, setCsvRows] = useState<SheetBookingRow[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetBookingRow[]>([]);
  const [sheetSourceMode, setSheetSourceMode] = useState<'csv' | 'live-sheet' | 'apps-script'>('csv');
  const [sheetLoading, setSheetLoading] = useState<boolean>(true);
  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(null);
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState<string | null>(DEFAULT_APPS_SCRIPT_URL);
  const [hasExistingWebhookDoc, setHasExistingWebhookDoc] = useState<boolean>(false);
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
      } else {
        const token = getCachedAccessToken();
        if (token) {
          setSheetsAccessToken(token);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Load live Google Sheet via default Apps Script URL (fallback to attached CSV snapshot)
  useEffect(() => {
    let active = true;
    setSheetLoading(true);

    const loadInitial = async () => {
      try {
        const csvRes = await fetch(ATTACHED_SHEET_CSV_URL);
        if (csvRes.ok && active) {
          const parsed = parseCsvText(await csvRes.text());
          setCsvRows(parsed);
          setSheetRows(parsed);
        }
      } catch (err) {
        console.error('Gagal membaca CSV lampiran:', err);
      }

      try {
        const liveRes = await fetchWebhookSheetRows(DEFAULT_APPS_SCRIPT_URL);
        if (active) {
          setSheetRows(liveRes.rows);
          setSheetSourceMode('apps-script');
          setConnectedSheetInfo({
            spreadsheetId: 'apps-script',
            spreadsheetTitle: liveRes.title,
            tabTitle: liveRes.tab,
          });
        }
      } catch (err) {
        console.warn('Gagal memuatkan Google Sheet langsung pada permulaan, menggunakan CSV:', err);
      } finally {
        if (active) setSheetLoading(false);
      }
    };

    void loadInitial();
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

  // Bookings listener: primary admin reads all bookings; passcode-unlocked session reads passcode-authorized bookings without needing Google login
  useEffect(() => {
    if (!authReady) return;
    const isPrimaryAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);
    if (!isPrimaryAdmin && (!adminUnlocked || !bookingAccessKey)) {
      setUserBookings([]);
      setBookingsLoading(false);
      return;
    }

    setBookingsLoading(true);
    const bookingsQuery = isPrimaryAdmin
      ? collection(db, 'bookings')
      : query(collection(db, 'bookings'), where('accessKey', '==', bookingAccessKey));

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
              accessKey: data.accessKey ? String(data.accessKey) : undefined,
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
  }, [authReady, user, adminUnlocked, bookingAccessKey]);

  // Persistent Google Sheet Apps Script Web App setting listener (admin passcode protected)
  useEffect(() => {
    if (!authReady) return;
    const isPrimaryAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);
    if (!isPrimaryAdmin && (!adminUnlocked || !bookingAccessKey)) {
      setHasExistingWebhookDoc(false);
      return;
    }

    const settingsQuery = isPrimaryAdmin
      ? collection(db, 'app_settings')
      : query(collection(db, 'app_settings'), where('accessKey', '==', bookingAccessKey));

    const unsubSettings = onSnapshot(
      settingsQuery,
      (snapshot) => {
        const gsDoc = snapshot.docs.find((d) => d.id === 'google_sheet');
        if (!gsDoc) {
          setHasExistingWebhookDoc(false);
          return;
        }
        const data = gsDoc.data();
        const storedUrl = typeof data.webhookUrl === 'string' ? data.webhookUrl : '';
        const effectiveUrl =
          storedUrl === LEGACY_DEFAULT_APPS_SCRIPT_URL ? DEFAULT_APPS_SCRIPT_URL : storedUrl;
        const label =
          typeof data.sheetLabel === 'string' ? data.sheetLabel : 'SISTEM BOOKING AI STUDIO';
        setHasExistingWebhookDoc(Boolean(effectiveUrl));
        if (storedUrl === LEGACY_DEFAULT_APPS_SCRIPT_URL) {
          void updateDoc(doc(db, 'app_settings', 'google_sheet'), {
            webhookUrl: DEFAULT_APPS_SCRIPT_URL,
            sheetLabel: 'SISTEM BOOKING AI STUDIO',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        if (effectiveUrl) {
          setSheetsWebhookUrl(effectiveUrl);
          fetchWebhookSheetRows(effectiveUrl)
            .then((res) => {
              setSheetRows(res.rows);
              setSheetSourceMode('apps-script');
              setConnectedSheetInfo({
                spreadsheetId: 'apps-script',
                spreadsheetTitle: res.title || label,
                tabTitle: res.tab || 'Form Responses 1',
              });
            })
            .catch((err) => {
              console.warn('Gagal menyelaraskan Apps Script Google Sheet secara automatik:', err);
            });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'app_settings');
      }
    );

    return () => unsubSettings();
  }, [authReady, user, adminUnlocked, bookingAccessKey]);

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

  const handleAppsScriptRowsLoaded = (
    rows: SheetBookingRow[],
    spreadsheetTitle: string,
    tabTitle: string
  ) => {
    setSheetRows(rows);
    setSheetSourceMode('apps-script');
    setConnectedSheetInfo({
      spreadsheetId: 'apps-script',
      spreadsheetTitle,
      tabTitle,
    });
  };

  const handleSaveWebhookUrl = async (webhookUrl: string, sheetLabel: string) => {
    if (!bookingAccessKey) {
      throw new Error('Sila masukkan kata kunci admin terlebih dahulu.');
    }
    const settingRef = doc(db, 'app_settings', 'google_sheet');
    if (hasExistingWebhookDoc) {
      await updateDoc(settingRef, {
        webhookUrl,
        sheetLabel,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(settingRef, {
        webhookUrl,
        sheetLabel,
        accessKey: bookingAccessKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  const handleClearWebhookUrl = async () => {
    if (!hasExistingWebhookDoc) {
      setSheetsWebhookUrl(null);
      setSheetRows(csvRows);
      setSheetSourceMode('csv');
      setConnectedSheetInfo(null);
      return;
    }
    await deleteDoc(doc(db, 'app_settings', 'google_sheet'));
    setSheetsWebhookUrl(null);
    setHasExistingWebhookDoc(false);
    setSheetRows(csvRows);
    setSheetSourceMode('csv');
    setConnectedSheetInfo(null);
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
          bookingAccessKey={bookingAccessKey}
          onUnlockAdmin={(accessKey) => {
            setBookingAccessKey(accessKey);
            setAdminUnlocked(true);
          }}
          onLockAdmin={() => {
            setAdminUnlocked(false);
            setBookingAccessKey(null);
          }}
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
          sheetsWebhookUrl={sheetsWebhookUrl}
          onSheetsTokenObtained={setSheetsAccessToken}
          onLiveRowsLoaded={handleLiveRowsLoaded}
          onAppsScriptRowsLoaded={handleAppsScriptRowsLoaded}
          onSaveWebhookUrl={handleSaveWebhookUrl}
          onClearWebhookUrl={handleClearWebhookUrl}
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
