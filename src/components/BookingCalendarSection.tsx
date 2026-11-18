import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileDown,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  AvailabilitySlot,
  Booking,
  MALAYSIA_STATES,
  SheetBookingRow,
  UNIT_RATES,
  UnitType,
  VALIDATION_LIMITS,
} from '../types/homestay';
import {
  calculateNights,
  formatDisplayDate,
  formatMYR,
  getMonthCalendarDays,
  getTodayString,
  isNightOccupied,
  MALAY_MONTHS,
  MALAY_WEEKDAYS_SHORT,
  rangesOverlap,
} from '../lib/dateUtils';
import {
  db,
  getCachedAccessToken,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from '../lib/firebase';
import { verifyAdminPasswordSync } from '../lib/adminAuth';
import { downloadBookingPdf, downloadCalendarSlotPdf } from '../lib/bookingPdf';
import { HOMESTAY_DETAILS } from '../data/propertyData';
import { GoogleSheetSyncPanel } from './GoogleSheetSyncPanel';

interface BookingCalendarSectionProps {
  user: User | null;
  authReady: boolean;
  adminUnlocked: boolean;
  onUnlockAdmin: () => void;
  onLockAdmin: () => void;
  availabilitySlots: AvailabilitySlot[];
  slotsLoading: boolean;
  userBookings: Booking[];
  bookingsLoading: boolean;
  selectedUnit: UnitType;
  onSelectUnit: (unit: UnitType) => void;
  sheetRows: SheetBookingRow[];
  sheetSourceMode: 'csv' | 'live-sheet';
  sheetLoading: boolean;
  sheetsAccessToken: string | null;
  onSheetsTokenObtained: (token: string) => void;
  onLiveRowsLoaded: (
    rows: SheetBookingRow[],
    spreadsheetId: string,
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
  onResetToCsv: () => void;
  connectedSheetInfo: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabTitle: string;
  } | null;
}

type CalendarViewFilter = UnitType | 'all';
type RightPanelTab = 'form' | 'records';

export function BookingCalendarSection({
  user,
  authReady,
  adminUnlocked,
  onUnlockAdmin,
  onLockAdmin,
  availabilitySlots,
  slotsLoading,
  userBookings,
  bookingsLoading,
  selectedUnit,
  onSelectUnit,
  sheetRows,
  sheetSourceMode,
  sheetLoading,
  sheetsAccessToken,
  onSheetsTokenObtained,
  onLiveRowsLoaded,
  onResetToCsv,
  connectedSheetInfo,
}: BookingCalendarSectionProps) {
  const now = new Date();
  const todayStr = getTodayString();

  const [viewYear, setViewYear] = useState<number>(now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth());
  const [calendarFilter, setCalendarFilter] = useState<CalendarViewFilter>(selectedUnit);
  const [rightTab, setRightTab] = useState<RightPanelTab>('form');

  // Admin password gate states
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [verifyingAdmin, setVerifyingAdmin] = useState<boolean>(false);
  const [visitorClickNotice, setVisitorClickNotice] = useState<string | null>(null);

  // Form states (synced with calendar selection)
  const [guestName, setGuestName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [stateOrigin, setStateOrigin] = useState<string>('Kelantan');
  const [checkIn, setCheckIn] = useState<string>('');
  const [checkOut, setCheckOut] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<Booking | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const isGoogleSignedIn = Boolean(user && user.emailVerified);

  // Keep calendar filter aligned when parent triggers Homestay/Roomstay selection
  const handleUnitChange = (unit: UnitType) => {
    onSelectUnit(unit);
    setCalendarFilter(unit);
    setFormError(null);
  };

  const activeSlots = useMemo(
    () => availabilitySlots.filter((slot) => slot.status === 'confirmed'),
    [availabilitySlots]
  );

  const calendarCells = useMemo(
    () => getMonthCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const nights = useMemo(() => calculateNights(checkIn, checkOut), [checkIn, checkOut]);
  const nightlyRate = UNIT_RATES[selectedUnit].ratePerNight;
  const totalAmount = nights * nightlyRate;

  const hasOverlap = useMemo(() => {
    if (!checkIn || !checkOut || nights <= 0) return false;
    return activeSlots.some(
      (slot) =>
        slot.unitType === selectedUnit &&
        rangesOverlap(checkIn, checkOut, slot.checkIn, slot.checkOut)
    );
  }, [activeSlots, selectedUnit, checkIn, checkOut, nights]);

  // Confirmed slots that touch the currently viewed month
  const monthBookingsList = useMemo(() => {
    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return activeSlots
      .filter((slot) => {
        if (calendarFilter !== 'all' && slot.unitType !== calendarFilter) return false;
        return slot.checkIn <= monthEnd && slot.checkOut > monthStart;
      })
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  }, [activeSlots, viewYear, viewMonth, calendarFilter]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleResetToCurrentMonth = () => {
    const current = new Date();
    setViewYear(current.getFullYear());
    setViewMonth(current.getMonth());
  };

  const handleDayClick = (dateStr: string) => {
    if (!adminUnlocked) {
      if (dateStr < todayStr) return;
      const unitForCheck = selectedUnit;
      const isDayBookedForUnit = activeSlots.some(
        (s) => s.unitType === unitForCheck && isNightOccupied(dateStr, s.checkIn, s.checkOut)
      );
      setVisitorClickNotice(
        isDayBookedForUnit
          ? `Tarikh ${formatDisplayDate(dateStr)} sudah ditempah untuk ${UNIT_RATES[unitForCheck].label}.`
          : `Tarikh ${formatDisplayDate(dateStr)} masih kosong untuk ${UNIT_RATES[unitForCheck].label}. Tempahan hanya direkodkan oleh Admin — masukkan kata kunci admin atau WhatsApp Admin.`
      );
      return;
    }

    const unitForCheck = selectedUnit;
    const isDayBookedForUnit = activeSlots.some(
      (s) => s.unitType === unitForCheck && isNightOccupied(dateStr, s.checkIn, s.checkOut)
    );

    setVisitorClickNotice(null);
    setFormError(null);
    setBookingSuccess(null);

    // If starting fresh or already have a complete range
    if (!checkIn || (checkIn && checkOut)) {
      if (isDayBookedForUnit) {
        setFormError(
          `Tarikh ${formatDisplayDate(dateStr)} sudah ditempah untuk ${UNIT_RATES[unitForCheck].label}. Sila pilih tarikh masuk yang kosong.`
        );
        return;
      }
      setCheckIn(dateStr);
      setCheckOut('');
      return;
    }

    // Selecting check-out
    if (dateStr <= checkIn) {
      if (isDayBookedForUnit) {
        setFormError(
          `Tarikh ${formatDisplayDate(dateStr)} sudah ditempah untuk ${UNIT_RATES[unitForCheck].label}.`
        );
        return;
      }
      setCheckIn(dateStr);
      setCheckOut('');
      return;
    }

    // Check overlap for [checkIn, dateStr)
    const conflict = activeSlots.some(
      (s) =>
        s.unitType === unitForCheck &&
        rangesOverlap(checkIn, dateStr, s.checkIn, s.checkOut)
    );
    if (conflict) {
      setFormError(
        'Julat tarikh yang dipilih bertindih dengan tempahan sedia ada. Sila pilih tarikh keluar lebih awal atau julat lain.'
      );
      return;
    }

    setCheckOut(dateStr);
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setFormError(null);
    try {
      const signedInUser = await signInWithGoogle();
      if (!guestName && signedInUser.displayName) {
        setGuestName(signedInUser.displayName);
      }
      const token = getCachedAccessToken();
      if (token) {
        onSheetsTokenObtained(token);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal log masuk dengan Google.';
      if (msg.includes('popup-blocked')) {
        setFormError(
          'Tetingkap log masuk Google disekat oleh pelayar. Sila klik butang "Log Masuk Google Admin" di atas untuk mengesahkan akaun.'
        );
      } else if (!msg.includes('popup-closed-by-user')) {
        setFormError(`Log masuk Google tidak berjaya (${msg}). Sila cuba lagi.`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUnlockAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);
    setVerifyingAdmin(true);

    const ok = verifyAdminPasswordSync(adminPasswordInput);
    if (!ok) {
      setAdminAuthError('Kata kunci admin tidak sah. Sila cuba lagi.');
      setVerifyingAdmin(false);
      return;
    }

    onUnlockAdmin();
    setAdminPasswordInput('');
    setVisitorClickNotice(null);
    setVerifyingAdmin(false);

    // Call signInWithGoogle synchronously in the same click event if no Google account is signed in yet
    if (!user) {
      void handleGoogleSignIn();
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBookingSuccess(null);

    if (!adminUnlocked) {
      setFormError('Akses tempahan dikunci. Sila masukkan kata kunci terlebih dahulu.');
      return;
    }

    if (!user) {
      setFormError('Kata kunci disahkan. Sila log masuk mana-mana akaun Google terlebih dahulu untuk menyimpan tempahan ke pangkalan data.');
      return;
    }

    const trimmedName = guestName.trim();
    const trimmedPhone = phone.trim();
    const trimmedAccount = accountNumber.trim();

    if (
      trimmedName.length < VALIDATION_LIMITS.GUEST_NAME_MIN ||
      trimmedName.length > VALIDATION_LIMITS.GUEST_NAME_MAX
    ) {
      setFormError('Sila masukkan nama penuh yang sah (sekurang-kurangnya 2 aksara).');
      return;
    }

    if (trimmedPhone.length > 24) {
      setFormError('No. Telefon tidak boleh melebihi 24 aksara.');
      return;
    }

    if (!checkIn || !checkOut) {
      setFormError('Sila pilih Tarikh Masuk dan Tarikh Keluar pada kalendar atau borang.');
      return;
    }

    if (nights < VALIDATION_LIMITS.MIN_NIGHTS || nights > VALIDATION_LIMITS.MAX_NIGHTS) {
      setFormError('Tempoh penginapan mestilah antara 1 hingga 60 malam.');
      return;
    }

    if (hasOverlap) {
      setFormError(
        `Maaf, tarikh tersebut bertindih dengan tempahan sedia ada bagi ${UNIT_RATES[selectedUnit].label}. Sila pilih tarikh lain.`
      );
      return;
    }

    if (
      trimmedAccount.length < VALIDATION_LIMITS.ACCOUNT_MIN ||
      trimmedAccount.length > VALIDATION_LIMITS.ACCOUNT_MAX ||
      !VALIDATION_LIMITS.ACCOUNT_PATTERN.test(trimmedAccount)
    ) {
      setFormError('Sila masukkan No. Akaun Bank yang sah (4 hingga 34 aksara huruf/nombor).');
      return;
    }

    let currentUser = user;
    if (!currentUser) {
      setFormError('Sila log masuk dengan akaun Google terlebih dahulu untuk mengesahkan tempahan anda.');
      return;
    }

    setSubmitting(true);
    const bookingId = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const batch = writeBatch(db);
      const bookingRef = doc(collection(db, 'bookings'), bookingId);
      const slotRef = doc(collection(db, 'availability_slots'), bookingId);

      batch.set(bookingRef, {
        userId: currentUser.uid,
        unitType: selectedUnit,
        guestName: trimmedName,
        phone: trimmedPhone,
        state: stateOrigin,
        checkIn,
        checkOut,
        accountNumber: trimmedAccount,
        nights,
        totalAmount,
        status: 'confirmed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(slotRef, {
        bookingId,
        userId: currentUser.uid,
        unitType: selectedUnit,
        checkIn,
        checkOut,
        status: 'confirmed',
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setBookingSuccess({
        id: bookingId,
        userId: currentUser.uid,
        unitType: selectedUnit,
        guestName: trimmedName,
        phone: trimmedPhone,
        state: stateOrigin,
        checkIn,
        checkOut,
        accountNumber: trimmedAccount,
        nights,
        totalAmount,
        status: 'confirmed',
      });

      // Jump calendar to the booked check-in month
      const [bookedYear, bookedMonth] = checkIn.split('-').map(Number);
      setViewYear(bookedYear);
      setViewMonth(bookedMonth - 1);

      setCheckIn('');
      setCheckOut('');
      setAccountNumber('');
      setPhone('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    if (!user || booking.status === 'cancelled') return;
    setCancellingId(booking.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'availability_slots', booking.id), {
        status: 'cancelled',
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    } finally {
      setCancellingId(null);
    }
  };

  const yearOptions = useMemo(() => {
    const years = new Set<number>([
      now.getFullYear(),
      now.getFullYear() + 1,
      now.getFullYear() + 2,
    ]);
    activeSlots.forEach((slot) => {
      const y = Number(slot.checkIn.slice(0, 4));
      if (y >= 2020 && y <= 2100) years.add(y);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [activeSlots, now]);

  return (
    <section id="kalendar-tempahan" className="max-w-[1360px] mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-medium text-[#14532D] tracking-wide mb-2">
            Kalendar Kekosongan & Tempahan Admin
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#161B17] text-balance">
            Semak Tarikh & Pengurusan Tempahan
          </h2>
        </div>
        <p className="text-sm text-[#525C54] max-w-md leading-relaxed">
          Pilih bulan carian untuk melihat kekosongan terkini. Tempahan baharu hanya boleh dibuat oleh Admin dengan memasukkan kata kunci pentadbir.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN (7 cols): Interactive Availability Calendar */}
        <div className="lg:col-span-7 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-7">
          {/* Calendar Top Controls: Unit Filter + Month/Year Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#DDE2DC]">
            {/* Unit filter segmented buttons */}
            <div
              className="inline-flex items-center p-1 bg-[#EFF2EE] rounded-lg border border-[#DDE2DC] self-start"
              role="tablist"
              aria-label="Penapis Unit Kalendar"
            >
              <button
                type="button"
                role="tab"
                aria-selected={calendarFilter === 'homestay'}
                onClick={() => handleUnitChange('homestay')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  calendarFilter === 'homestay'
                    ? 'bg-white text-[#161B17] shadow-xs'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                Homestay (RM 300)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={calendarFilter === 'roomstay'}
                onClick={() => handleUnitChange('roomstay')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  calendarFilter === 'roomstay'
                    ? 'bg-white text-[#161B17] shadow-xs'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                Roomstay (RM 130)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={calendarFilter === 'all'}
                onClick={() => setCalendarFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  calendarFilter === 'all'
                    ? 'bg-white text-[#161B17] shadow-xs'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                Semua Unit
              </button>
            </div>

            {/* Month & Year Search Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="carian-bulan" className="sr-only">
                Pilih Bulan Carian
              </label>
              <select
                id="carian-bulan"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="px-3 py-2 text-sm font-medium bg-[#F8F9F7] border border-[#DDE2DC] rounded-lg text-[#161B17] focus:outline-none focus:border-[#14532D] cursor-pointer"
              >
                {MALAY_MONTHS.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <label htmlFor="carian-tahun" className="sr-only">
                Pilih Tahun Carian
              </label>
              <select
                id="carian-tahun"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="px-3 py-2 text-sm font-mono-tabular font-medium bg-[#F8F9F7] border border-[#DDE2DC] rounded-lg text-[#161B17] focus:outline-none focus:border-[#14532D] cursor-pointer"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Bulan sebelumnya"
                  className="p-2 rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Bulan seterusnya"
                  className="p-2 rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetToCurrentMonth}
                  className="px-2.5 py-2 text-xs font-medium rounded-lg border border-[#DDE2DC] bg-white text-[#525C54] hover:text-[#161B17] hover:bg-[#EFF2EE] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Bulan Ini
                </button>
              </div>
            </div>
          </div>

          {/* Active Selected Check-In & Check-Out Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-[#DDE2DC]">
            <div>
              <span className="block text-[11px] font-medium text-[#525C54]">Tarikh Masuk</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#161B17]">
                {checkIn ? formatDisplayDate(checkIn) : 'Pilih tarikh'}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-[#525C54]">Tarikh Keluar</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#161B17]">
                {checkOut ? formatDisplayDate(checkOut) : 'Pilih tarikh'}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-[#525C54]">Tempoh</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#161B17]">
                {nights > 0 ? `${nights} Malam` : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-[#525C54]">Anggaran Jumlah</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#14532D]">
                {nights > 0 ? formatMYR(totalAmount) : '—'}
              </span>
            </div>
          </div>

          {/* Calendar Month Title & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-5 pb-4">
            <h3 className="font-display text-xl font-semibold text-[#161B17]">
              {MALAY_MONTHS[viewMonth]} {viewYear}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#525C54]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded border border-[#DDE2DC] bg-white inline-block" aria-hidden="true" />
                Kosong
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded border border-red-200 booked-hatch inline-block" aria-hidden="true" />
                Ditempah (Penuh)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-[#14532D] inline-block" aria-hidden="true" />
                Pilihan Anda
              </span>
            </div>
          </div>

          {/* 7-Column Calendar Grid */}
          {slotsLoading ? (
            <div className="grid grid-cols-7 gap-1.5 animate-pulse">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[#EFF2EE]" />
              ))}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {MALAY_WEEKDAYS_SHORT.map((dayName) => (
                  <div
                    key={dayName}
                    className="text-center text-xs font-semibold text-[#525C54] py-1.5"
                  >
                    {dayName}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarCells.map((cell, index) => {
                  if (!cell) {
                    return <div key={`empty-${index}`} className="h-[72px] sm:h-[82px] rounded-lg bg-[#F8F9F7]/60" />;
                  }

                  const { dateStr, day } = cell;
                  const isPast = dateStr < todayStr;
                  const isToday = dateStr === todayStr;

                  const homestaySlot = activeSlots.find(
                    (s) => s.unitType === 'homestay' && isNightOccupied(dateStr, s.checkIn, s.checkOut)
                  );
                  const roomstaySlot = activeSlots.find(
                    (s) => s.unitType === 'roomstay' && isNightOccupied(dateStr, s.checkIn, s.checkOut)
                  );

                  const homestayBooked = Boolean(homestaySlot);
                  const roomstayBooked = Boolean(roomstaySlot);

                  const isBookedForSelectedFilter =
                    calendarFilter === 'homestay'
                      ? homestayBooked
                      : calendarFilter === 'roomstay'
                      ? roomstayBooked
                      : homestayBooked && roomstayBooked;

                  const activeUnitSlot =
                    calendarFilter === 'homestay'
                      ? homestaySlot
                      : calendarFilter === 'roomstay'
                      ? roomstaySlot
                      : homestaySlot || roomstaySlot;

                  const isCheckInDay = checkIn === dateStr;
                  const isCheckOutDay = checkOut === dateStr;
                  const isInSelectedRange =
                    Boolean(checkIn && checkOut) && dateStr > checkIn && dateStr < checkOut;

                  const hasAnyBookedInAll = calendarFilter === 'all' && (homestayBooked || roomstayBooked);
                  const isVisuallyBooked = isBookedForSelectedFilter || hasAnyBookedInAll;

                  let cellClasses =
                    'bg-white border-[#DDE2DC] text-[#161B17] hover:border-[#14532D] hover:bg-[#F8F9F7]';

                  if (isCheckInDay || isCheckOutDay) {
                    cellClasses = 'bg-[#14532D] border-[#14532D] text-white';
                  } else if (isInSelectedRange) {
                    cellClasses = 'bg-[#E6F0E9] border-[#84B395] text-[#14532D]';
                  } else if (isPast && isVisuallyBooked) {
                    cellClasses = `booked-hatch border-red-200/80 text-red-900/85 ${
                      adminUnlocked ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`;
                  } else if (isPast) {
                    cellClasses = `bg-[#F8F9F7] border-[#EBEFEB] text-[#9AA39C] ${
                      adminUnlocked ? 'hover:border-[#14532D] cursor-pointer' : 'cursor-not-allowed'
                    }`;
                  } else if (isBookedForSelectedFilter) {
                    cellClasses = 'booked-hatch border-red-200 text-red-900';
                  }

                  const cellTooltip =
                    calendarFilter === 'all'
                      ? [
                          homestaySlot
                            ? `Homestay: ${homestaySlot.guestName || 'Ditempah'} (${formatDisplayDate(homestaySlot.checkIn)} – ${formatDisplayDate(homestaySlot.checkOut)})`
                            : null,
                          roomstaySlot
                            ? `Roomstay: ${roomstaySlot.guestName || 'Ditempah'} (${formatDisplayDate(roomstaySlot.checkIn)} – ${formatDisplayDate(roomstaySlot.checkOut)})`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' | ') || undefined
                      : activeUnitSlot
                      ? `${activeUnitSlot.guestName || 'Ditempah'} (${formatDisplayDate(activeUnitSlot.checkIn)} – ${formatDisplayDate(activeUnitSlot.checkOut)})`
                      : undefined;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={isPast && !adminUnlocked}
                      onClick={() => handleDayClick(dateStr)}
                      title={cellTooltip}
                      aria-label={`${day} ${MALAY_MONTHS[viewMonth]} ${viewYear}${
                        isVisuallyBooked
                          ? ` (${activeUnitSlot?.guestName || 'Ditempah'})`
                          : ' (Kosong)'
                      }`}
                      className={`relative h-[72px] sm:h-[82px] rounded-lg border p-1.5 flex flex-col justify-between text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#14532D] ${
                        isPast && !adminUnlocked ? '' : 'cursor-pointer'
                      } ${cellClasses}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`font-mono-tabular text-xs sm:text-sm font-semibold ${
                            isToday && !isCheckInDay && !isCheckOutDay ? 'underline decoration-2 underline-offset-2' : ''
                          }`}
                        >
                          {day}
                        </span>
                        {isToday && (
                          <span
                            className={`text-[9px] font-medium ${
                              isCheckInDay || isCheckOutDay ? 'text-white/90' : 'text-[#14532D]'
                            }`}
                          >
                            Hari ini
                          </span>
                        )}
                      </div>

                      {/* Guest name & explicit non-hue status text inside cell */}
                      <div className="w-full min-w-0">
                        {isCheckInDay ? (
                          <span className="block text-[10px] font-semibold tracking-tight truncate">Masuk</span>
                        ) : isCheckOutDay ? (
                          <span className="block text-[10px] font-semibold tracking-tight truncate">Keluar</span>
                        ) : isInSelectedRange ? (
                          <span className="block text-[10px] font-medium truncate">Dipilih</span>
                        ) : calendarFilter === 'all' ? (
                          <div className="space-y-0.5 text-[9.5px] leading-tight">
                            {homestaySlot && (
                              <span className="block truncate text-red-800 font-semibold">
                                H: {homestaySlot.guestName || 'Penuh'}
                              </span>
                            )}
                            {roomstaySlot && (
                              <span className="block truncate text-amber-900 font-semibold">
                                R: {roomstaySlot.guestName || 'Penuh'}
                              </span>
                            )}
                            {!homestaySlot && !roomstaySlot && !isPast && (
                              <span className="block text-[10px] text-[#525C54]">Kosong</span>
                            )}
                            {!homestaySlot && !roomstaySlot && isPast && (
                              <span className="block text-[10px] text-[#9AA39C]">Tamat</span>
                            )}
                          </div>
                        ) : isBookedForSelectedFilter ? (
                          <div className="space-y-0.5 leading-tight">
                            {activeUnitSlot?.guestName ? (
                              <>
                                <span className="block truncate text-[10px] font-semibold text-red-900">
                                  {activeUnitSlot.guestName}
                                </span>
                                <span className="block text-[9px] font-medium text-red-700/85">
                                  Penuh
                                </span>
                              </>
                            ) : (
                              <span className="block text-[10px] font-semibold text-red-700">Penuh</span>
                            )}
                          </div>
                        ) : !isPast ? (
                          <span className="block text-[10px] text-[#525C54]">Kosong</span>
                        ) : (
                          <span className="block text-[10px] text-[#9AA39C]">Tamat</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Month Occupied Dates Summary Table (Shows Nama, Tarikh Masuk & Tarikh Keluar clearly) */}
          <div className="mt-6 pt-5 border-t border-[#DDE2DC]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[#161B17]">
                Senarai Tarikh Ditempah · {MALAY_MONTHS[viewMonth]} {viewYear}
              </h4>
              <span className="font-mono-tabular text-xs text-[#525C54]">
                {monthBookingsList.length} tempahan aktif
              </span>
            </div>

            {monthBookingsList.length === 0 ? (
              <p className="text-xs text-[#525C54] py-3 px-4 rounded-lg bg-[#F8F9F7] border border-[#DDE2DC]">
                Tiada tempahan direkodkan pada bulan {MALAY_MONTHS[viewMonth]} {viewYear}. Semua tarikh masih kosong.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#DDE2DC] text-[#525C54]">
                      <th className="py-2 pr-3 font-medium">Nama</th>
                      <th className="py-2 px-3 font-medium">Penginapan</th>
                      <th className="py-2 px-3 font-medium">Tarikh Masuk</th>
                      <th className="py-2 px-3 font-medium">Tarikh Keluar</th>
                      <th className="py-2 px-3 font-medium text-right">Status</th>
                      {adminUnlocked && (
                        <th className="py-2 pl-3 font-medium text-right">Slip</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEFEB]">
                    {monthBookingsList.map((slot) => {
                      const matchedBooking = userBookings.find((b) => b.id === slot.bookingId);
                      const matchedSheet = sheetRows.find(
                        (r) =>
                          r.unitType === slot.unitType &&
                          r.checkIn === slot.checkIn &&
                          r.checkOut === slot.checkOut
                      );

                      return (
                        <tr key={slot.id} className="text-[#161B17]">
                          <td className="py-2.5 pr-3 font-semibold text-[#161B17]">
                            {slot.guestName || 'Tetamu Berdaftar'}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#525C54]">
                            {UNIT_RATES[slot.unitType].label}
                          </td>
                          <td className="py-2.5 px-3 font-mono-tabular">
                            {formatDisplayDate(slot.checkIn)}
                          </td>
                          <td className="py-2.5 px-3 font-mono-tabular">
                            {formatDisplayDate(slot.checkOut)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-red-700">
                            Ditempah
                          </td>
                          {adminUnlocked && (
                            <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  downloadCalendarSlotPdf(slot, matchedBooking, matchedSheet)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#DDE2DC] bg-[#F8F9F7] text-[#14532D] font-medium hover:bg-[#F1F7F3] hover:border-[#14532D] transition-colors cursor-pointer"
                                title="Muat turun PDF slip tempahan ini"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                PDF
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Admin-Only Booking Form & Records */}
        <div className="lg:col-span-5 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-7">
          {!adminUnlocked ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 pb-4 border-b border-[#DDE2DC]">
                <div className="p-2.5 rounded-xl bg-[#F1F7F3] text-[#14532D] shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#161B17]">
                    Tempahan Admin Sahaja
                  </h3>
                  <p className="text-xs text-[#525C54] mt-1 leading-relaxed">
                    Tempahan hanya boleh dibuat oleh Admin. Sila masukkan kata kunci admin di bawah untuk membuka borang tempahan.
                  </p>
                </div>
              </div>

              {visitorClickNotice && (
                <div className="p-3.5 rounded-xl bg-[#F1F7F3] border border-[#C6DEC9] text-xs text-[#14532D] leading-relaxed">
                  {visitorClickNotice}
                </div>
              )}

              <form onSubmit={handleUnlockAdminSubmit} className="space-y-3">
                <label
                  htmlFor="admin-password-input"
                  className="flex items-center gap-2 text-xs font-semibold text-[#161B17]"
                >
                  <KeyRound className="w-4 h-4 text-[#14532D]" />
                  <span>Kata Kunci Admin</span>
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => {
                    setAdminPasswordInput(e.target.value);
                    setAdminAuthError(null);
                  }}
                  placeholder="Masukkan kata kunci admin"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                />

                {adminAuthError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                    <span>{adminAuthError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifyingAdmin}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#161B17] text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer disabled:opacity-50"
                >
                  {verifyingAdmin ? 'Mengesahkan...' : 'Masuk Sebagai Admin'}
                </button>
              </form>

              <div className="pt-5 border-t border-[#DDE2DC] space-y-2.5">
                <p className="text-xs text-[#525C54] leading-relaxed">
                  Untuk pengunjung yang ingin membuat tempahan, sila semak tarikh kosong pada kalendar dan hubungi Admin melalui WhatsApp:
                </p>
                <a
                  href={HOMESTAY_DETAILS.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp Admin Untuk Tempahan (016-9867367)
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Form / Admin Records Switcher */}
              <div className="flex items-center justify-between gap-2 pb-4 mb-5 border-b border-[#DDE2DC]">
                <div className="inline-flex p-1 bg-[#EFF2EE] rounded-lg border border-[#DDE2DC]">
                  <button
                    type="button"
                    onClick={() => setRightTab('form')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      rightTab === 'form'
                        ? 'bg-white text-[#161B17] shadow-xs'
                        : 'text-[#525C54] hover:text-[#161B17]'
                    }`}
                  >
                    Borang Tempahan
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('records')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      rightTab === 'records'
                        ? 'bg-white text-[#161B17] shadow-xs'
                        : 'text-[#525C54] hover:text-[#161B17]'
                    }`}
                  >
                    Semua Rekod ({userBookings.length})
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onLockAdmin();
                      setCheckIn('');
                      setCheckOut('');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#525C54] hover:text-[#161B17] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Kunci Admin
                  </button>
                  {authReady && user && (
                    <button
                      type="button"
                      onClick={() => {
                        onLockAdmin();
                        signOutUser();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#525C54] hover:text-[#161B17] transition-colors whitespace-nowrap cursor-pointer"
                      title={user.email || 'Log Keluar'}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log Keluar
                    </button>
                  )}
                </div>
              </div>

              {rightTab === 'form' ? (
                <form onSubmit={handleSubmitBooking} className="space-y-4">
                  {!isGoogleSignedIn ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                      <p className="text-xs text-amber-950 leading-relaxed">
                        Kata kunci disahkan. Sila log masuk dengan mana-mana akaun Google untuk menyimpan tempahan ke pangkalan data.
                      </p>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={authLoading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        {authLoading ? 'Menyambung...' : 'Log Masuk Akaun Google'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-[#525C54] pb-1">
                      <span>
                        Akaun Aktif: <strong className="text-[#161B17]">{user?.email}</strong>
                      </span>
                      <span className="font-medium text-[#14532D]">Kata Kunci Disahkan</span>
                    </div>
                  )}

              {/* 1. Pilihan Homestay atau Roomstay */}
              <div>
                <label className="block text-xs font-semibold text-[#161B17] mb-2">
                  Pilihan Homestay atau Roomstay
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['homestay', 'roomstay'] as UnitType[]).map((unitKey) => {
                    const active = selectedUnit === unitKey;
                    const cfg = UNIT_RATES[unitKey];
                    return (
                      <button
                        key={unitKey}
                        type="button"
                        onClick={() => handleUnitChange(unitKey)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-[#14532D] bg-[#F1F7F3] text-[#161B17]'
                            : 'border-[#DDE2DC] bg-white text-[#525C54] hover:border-[#9AA39C]'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-[#161B17]">
                          {cfg.label}
                        </span>
                        <span className="block font-mono-tabular text-xs font-medium text-[#14532D] mt-0.5">
                          RM {cfg.ratePerNight} / malam
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Nama */}
              <div>
                <label htmlFor="booking-name" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                  Nama Penuh
                </label>
                <input
                  id="booking-name"
                  type="text"
                  required
                  maxLength={VALIDATION_LIMITS.GUEST_NAME_MAX}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Contoh: Ahmad Syafiq bin Razak"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              {/* 3. No. Telefon & Negeri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="booking-phone" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                    No. Telefon
                  </label>
                  <input
                    id="booking-phone"
                    type="tel"
                    maxLength={24}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Contoh: 012-3456789"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label htmlFor="booking-state" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                    Negeri
                  </label>
                  <select
                    id="booking-state"
                    value={stateOrigin}
                    onChange={(e) => setStateOrigin(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D] cursor-pointer"
                  >
                    {MALAYSIA_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4 & 5. Tarikh Masuk & Tarikh Keluar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="booking-checkin" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                    Tarikh Masuk
                  </label>
                  <input
                    id="booking-checkin"
                    type="date"
                    required
                    value={checkIn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCheckIn(val);
                      setFormError(null);
                      if (val) {
                        const [y, m] = val.split('-').map(Number);
                        setViewYear(y);
                        setViewMonth(m - 1);
                      }
                    }}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label htmlFor="booking-checkout" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                    Tarikh Keluar
                  </label>
                  <input
                    id="booking-checkout"
                    type="date"
                    required
                    min={checkIn || undefined}
                    value={checkOut}
                    onChange={(e) => {
                      setCheckOut(e.target.value);
                      setFormError(null);
                    }}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              {/* 6. No Akaun */}
              <div>
                <label htmlFor="booking-account" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                  No. Akaun Bank / Rujukan Pembayaran
                </label>
                <input
                  id="booking-account"
                  type="text"
                  required
                  maxLength={VALIDATION_LIMITS.ACCOUNT_MAX}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Contoh: 1621 0648 9210 (Maybank)"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              {/* 7. Jumlah (Paparan Tarikh Masuk, Tarikh Keluar & Jumlah) */}
              <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] space-y-2">
                <div className="flex items-center justify-between text-xs text-[#525C54]">
                  <span>Tarikh Masuk</span>
                  <span className="font-mono-tabular font-medium text-[#161B17]">
                    {checkIn ? formatDisplayDate(checkIn) : 'Belum dipilih'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#525C54]">
                  <span>Tarikh Keluar</span>
                  <span className="font-mono-tabular font-medium text-[#161B17]">
                    {checkOut ? formatDisplayDate(checkOut) : 'Belum dipilih'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#525C54]">
                  <span>Kadar ({UNIT_RATES[selectedUnit].label})</span>
                  <span className="font-mono-tabular text-[#161B17]">
                    {nights > 0 ? `${nights} malam × RM ${nightlyRate}` : `RM ${nightlyRate} / malam`}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#DDE2DC] flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#161B17]">Jumlah Perlu Dibayar</span>
                  <span className="font-mono-tabular text-lg font-bold text-[#14532D]">
                    {nights > 0 ? formatMYR(totalAmount) : 'RM 0.00'}
                  </span>
                </div>
              </div>

              {/* Overlap / Error Alert */}
              {(formError || hasOverlap) && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                  <span>
                    {formError ||
                      `Tarikh yang dipilih bertindih dengan tempahan sedia ada untuk ${UNIT_RATES[selectedUnit].label}.`}
                  </span>
                </div>
              )}

              {/* Success Confirmation Receipt */}
              {bookingSuccess && (
                <div className="p-4 rounded-xl bg-[#F1F7F3] border border-[#84B395] space-y-2 text-xs text-[#161B17]">
                  <div className="flex items-center gap-2 font-semibold text-[#14532D] text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Tempahan Berjaya Direkodkan
                  </div>
                  <p className="text-[#525C54]">
                    {UNIT_RATES[bookingSuccess.unitType].label} atas nama{' '}
                    <strong className="text-[#161B17]">{bookingSuccess.guestName}</strong> ({bookingSuccess.state}).
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono-tabular">
                    <div>
                      <span className="block text-[11px] text-[#525C54]">Masuk</span>
                      <span className="font-semibold">{formatDisplayDate(bookingSuccess.checkIn)}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#525C54]">Keluar</span>
                      <span className="font-semibold">{formatDisplayDate(bookingSuccess.checkOut)}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#525C54]">No. Akaun</span>
                      <span className="font-semibold">{bookingSuccess.accountNumber}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#525C54]">Jumlah</span>
                      <span className="font-semibold text-[#14532D]">
                        {formatMYR(bookingSuccess.totalAmount)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#C6DEC9] flex justify-end">
                    <button
                      type="button"
                      onClick={() => downloadBookingPdf(bookingSuccess)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Muat Turun PDF Slip Tempahan
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || hasOverlap}
                className="w-full py-3 px-4 rounded-xl bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting ? 'Menyimpan Tempahan...' : 'Sahkan Tempahan'}
              </button>
            </form>
          ) : (
            /* Rekod Tempahan Saya / Admin View */
            <div className="space-y-3">
              {!user ? (
                <div className="text-center py-8 px-4 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC]">
                  <CalendarIcon className="w-8 h-8 text-[#525C54] mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#161B17] mb-1">
                    Log Masuk untuk Lihat Rekod
                  </p>
                  <p className="text-xs text-[#525C54] mb-4">
                    Maklumat tempahan peribadi seperti nama dan nombor akaun hanya dipaparkan kepada pemilik tempahan.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={authLoading}
                    className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors cursor-pointer"
                  >
                    Log Masuk dengan Google
                  </button>
                </div>
              ) : bookingsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-28 rounded-xl bg-[#EFF2EE]" />
                  <div className="h-28 rounded-xl bg-[#EFF2EE]" />
                </div>
              ) : userBookings.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC]">
                  <p className="text-sm font-medium text-[#161B17]">Tiada rekod tempahan ditemui.</p>
                  <p className="text-xs text-[#525C54] mt-1">
                    Buat tempahan baharu melalui tab Borang Tempahan.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {userBookings.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-[#DDE2DC] bg-[#F8F9F7] space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-[#14532D]">
                            {UNIT_RATES[item.unitType].label}
                          </span>
                          <h4 className="text-sm font-semibold text-[#161B17]">{item.guestName}</h4>
                          <p className="text-xs text-[#525C54]">
                            Negeri: {item.state}
                            {item.phone ? ` · Tel: ${item.phone}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold inline-flex items-center gap-1 ${
                            item.status === 'confirmed' ? 'text-[#14532D]' : 'text-[#525C54]'
                          }`}
                        >
                          {item.status === 'confirmed' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Disahkan
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              Dibatalkan
                            </>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DDE2DC] text-xs">
                        <div>
                          <span className="block text-[11px] text-[#525C54]">Tarikh Masuk</span>
                          <span className="font-mono-tabular font-semibold text-[#161B17]">
                            {formatDisplayDate(item.checkIn)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-[#525C54]">Tarikh Keluar</span>
                          <span className="font-mono-tabular font-semibold text-[#161B17]">
                            {formatDisplayDate(item.checkOut)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-[#525C54]">No. Akaun</span>
                          <span className="font-mono-tabular text-[#161B17]">
                            {item.accountNumber}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-[#525C54]">Jumlah ({item.nights} malam)</span>
                          <span className="font-mono-tabular font-bold text-[#14532D]">
                            {formatMYR(item.totalAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#EBEFEB] flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => downloadBookingPdf(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#14532D] bg-white text-xs font-semibold text-[#14532D] hover:bg-[#F1F7F3] transition-colors cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          Muat Turun PDF
                        </button>

                        {item.status === 'confirmed' && (
                          <button
                            type="button"
                            disabled={cancellingId === item.id}
                            onClick={() => handleCancelBooking(item)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {cancellingId === item.id ? 'Membatalkan...' : 'Batalkan Tempahan'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Google Sheet Integration & Synced Records Table (Admin Unlocked Only) */}
      {adminUnlocked ? (
        <GoogleSheetSyncPanel
          sheetRows={sheetRows}
          sheetSourceMode={sheetSourceMode}
          sheetLoading={sheetLoading}
          sheetsAccessToken={sheetsAccessToken}
          onSheetsTokenObtained={onSheetsTokenObtained}
          onLiveRowsLoaded={onLiveRowsLoaded}
          onResetToCsv={onResetToCsv}
          onJumpToCalendarDate={(dateStr, unit) => {
            const [y, m] = dateStr.split('-').map(Number);
            if (y && m) {
              setViewYear(y);
              setViewMonth(m - 1);
            }
            handleUnitChange(unit);
          }}
          latestCreatedBooking={bookingSuccess}
          connectedSheetInfo={connectedSheetInfo}
        />
      ) : (
        <div className="mt-10 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-[#525C54] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-[#161B17]">
                Integrasi & Rekod Penuh Google Sheet (Akses Admin Sahaja)
              </h3>
              <p className="text-xs text-[#525C54] mt-0.5">
                Tarikh tempahan daripada Google Sheet telah diselaraskan pada kalendar di atas. Masukkan kata laluan pentadbir pada panel kanan untuk membuka jadual penuh dan mengemas kini Google Sheet.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
