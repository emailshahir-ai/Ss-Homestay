export type UnitType = 'homestay' | 'roomstay';

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  userId: string;
  unitType: UnitType;
  guestName: string;
  phone?: string;
  state: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  accountNumber: string;
  nights: number;
  discountAmount?: number;
  totalAmount: number;
  status: BookingStatus;
  accessKey?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SheetBookingRow {
  id: string;
  timestamp: string;
  name: string;
  phone: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  unitType: UnitType;
  rawChoice: string;
  totalAmount?: number;
  perkara?: string;
  expenseAmount?: number;
  source: 'csv' | 'live-sheet';
}

export interface SheetFinanceRow {
  id: string;
  rowIndex: number;
  timestamp: string;
  date: string; // YYYY-MM-DD (from TARIKH MASUK or Timestamp)
  name: string;
  unitType: UnitType | null;
  rawChoice: string;
  perkara: string;
  wangMasuk: number;
  wangKeluar: number;
  source: 'csv' | 'live-sheet';
}

export interface FinanceEntry {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  entryType: 'expense' | 'income';
  perkara: string;
  amount: number;
  syncedToSheet?: boolean;
  accessKey?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AvailabilitySlot {
  id: string;
  bookingId: string;
  userId: string;
  unitType: UnitType;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  status: BookingStatus;
  guestName?: string;
  source?: 'firestore' | 'sheet';
  createdAt?: unknown;
}

export interface Feedback {
  id: string;
  userId: string;
  authorName: string;
  stayType: UnitType;
  rating: number;
  comment: string;
  createdAt?: unknown;
}

export interface GalleryPhoto {
  id: string;
  unitType: UnitType;
  title: string;
  caption: string;
  src: string;
  aspect: '16:9' | '4:3';
}

export const MALAYSIA_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'WP Kuala Lumpur',
  'WP Labuan',
  'WP Putrajaya',
] as const;

export const UNIT_RATES: Record<UnitType, { label: string; ratePerNight: number; subtitle: string; maxGuests: number }> = {
  homestay: {
    label: 'Ss Homestay',
    ratePerNight: 300,
    subtitle: '3 Bilik Tidur (3 Aircond) · Private Pool · Maksimum 10 Orang',
    maxGuests: 10,
  },
  roomstay: {
    label: 'Ss Roomstay',
    ratePerNight: 130,
    subtitle: 'Bilik Studio Persendirian · 1 Katil Queen · Maksimum 3 Tetamu',
    maxGuests: 3,
  },
};

export const VALIDATION_LIMITS = {
  GUEST_NAME_MIN: 2,
  GUEST_NAME_MAX: 100,
  ACCOUNT_MIN: 4,
  ACCOUNT_MAX: 34,
  ACCOUNT_PATTERN: /^[0-9A-Za-z\-\s]{4,34}$/,
  AUTHOR_NAME_MIN: 2,
  AUTHOR_NAME_MAX: 80,
  COMMENT_MIN: 5,
  COMMENT_MAX: 600,
  MIN_NIGHTS: 1,
  MAX_NIGHTS: 60,
  DISCOUNT_MAX: 100000,
  PERKARA_MIN: 2,
  PERKARA_MAX: 200,
  AMOUNT_MAX: 1000000,
} as const;

export const ADMIN_EMAIL = 'emailshahir@gmail.com';
