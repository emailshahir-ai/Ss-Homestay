import { GalleryPhoto } from '../types/homestay';

export const HERO_IMAGE = '/assets/aistudio/head_383dda2d.jpg';
export const OFFICIAL_POSTER_IMAGE = '/assets/aistudio/image_4ceff111_58aebfe5.jpg';
export const ROOMSTAY_PAMPHLET_IMAGE = '/assets/aistudio/PHAMPLET_ROOMSTAY_290c1da3.jpg';

export const HOMESTAY_PHOTOS: GalleryPhoto[] = [
  {
    id: 'hs-pool',
    unitType: 'homestay',
    title: 'Private Pool (Kolam Renang Persendirian)',
    caption: 'Kolam renang persendirian di halaman rumah, sesuai untuk aktiviti santai seisi keluarga.',
    src: '/assets/homestay/private_pool.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-utama',
    unitType: 'homestay',
    title: 'Bilik Tidur Utama (Berhawa Dingin)',
    caption: 'Bilik tidur utama yang luas, kemas, dan dilengkapi penyaman udara.',
    src: '/assets/homestay/bilik_utama.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-makan',
    unitType: 'homestay',
    title: 'Ruang Makan Keluarga',
    caption: 'Meja makan selesa dengan kemasan dinding moden untuk hidangan bersama keluarga.',
    src: '/assets/homestay/ruang_makan.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-tamu',
    unitType: 'homestay',
    title: 'Ruang Tamu Utama',
    caption: 'Ruang tamu lapang dengan sofa, Google TV 50" & Netflix percuma, WiFi laju, serta langsir penuh privasi.',
    src: '/assets/homestay/ruang_tamu.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-bilik2',
    unitType: 'homestay',
    title: 'Bilik Tidur Ke-2 (Berhawa Dingin)',
    caption: 'Bilik tidur kedua yang selesa dengan katil Queen, extra toto, dan penyaman udara.',
    src: '/assets/homestay/bilik_2.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-bilik3',
    unitType: 'homestay',
    title: 'Bilik Tidur Ke-3 (Berhawa Dingin)',
    caption: 'Bilik tidur ketiga yang bersih dan nyaman dengan katil Queen dan penyaman udara.',
    src: '/assets/homestay/bilik_3.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-halaman',
    unitType: 'homestay',
    title: 'Halaman Luas & Parkir Berbumbung',
    caption: 'Parking kereta berbumbung dan kawasan parkir luas yang boleh memuatkan sehingga 10 buah kereta.',
    src: '/assets/homestay/halaman_luas.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-dapur',
    unitType: 'homestay',
    title: 'Ruang Dapur Lengkap',
    caption: 'Dapur & kelengkapan peralatan memasak, penapis air, jug kettle, peti ais, serta mesin basuh.',
    src: '/assets/homestay/dapur.jpg',
    aspect: '4:3',
  },
  {
    id: 'hs-poster',
    unitType: 'homestay',
    title: 'Risalah Rasmi SS Homestay Kota Bharu',
    caption: 'Poster maklumat penuh kemudahan, panduan tempahan, dan nombor hubungan rasmi SS Homestay.',
    src: OFFICIAL_POSTER_IMAGE,
    aspect: '4:3',
  },
];

export const ROOMSTAY_PHOTOS: GalleryPhoto[] = [
  {
    id: 'rs-bilik',
    unitType: 'roomstay',
    title: 'Bilik Tidur Luas (Katil Queen)',
    caption: '1 bilik tidur yang luas dilengkapi katil Queen, toto tambahan beserta bantal, kipas dan penghawa dingin.',
    src: '/assets/roomstay/roomstay_bilik.jpg',
    aspect: '4:3',
  },
  {
    id: 'rs-ruang',
    unitType: 'roomstay',
    title: 'Ruang Tamu & Ruang Makan yang Selesa',
    caption: 'Ruang tamu serta ruang makan berhawa dingin yang kemas dengan WiFi dan Google TV (Netflix & YouTube).',
    src: '/assets/roomstay/roomstay_ruang_tamu.jpg',
    aspect: '4:3',
  },
  {
    id: 'rs-kemudahan',
    unitType: 'roomstay',
    title: 'Penapis Air Coway & Tandas (Water Heater)',
    caption: 'Dilengkapi penapis air Coway serta 1 tandas bersih dengan pemanas air (Water Heater).',
    src: '/assets/roomstay/roomstay_kemudahan.jpg',
    aspect: '4:3',
  },
  {
    id: 'rs-risalah',
    unitType: 'roomstay',
    title: 'Risalah Rasmi SS Roomstay (RM 130 / Malam)',
    caption: 'Poster promosi harga RM 130 satu malam, senarai kemudahan lengkap, lokasi strategik Bandar Baru Tunjong & kod QR Google Maps.',
    src: ROOMSTAY_PAMPHLET_IMAGE,
    aspect: '4:3',
  },
];

export const HOMESTAY_DETAILS = {
  title: 'Ss Homestay',
  subtitle: 'Muslim Homestay · Padang Enggang, Kota Bharu',
  guestPolicy:
    'Muslim Homestay untuk keluarga diutamakan, sama jantina dan pasangan yang sudah berkahwin sahaja.',
  rate: 300,
  deposit: 100,
  capacity: 'Maksimum 10 Orang (Termasuk Kanak-Kanak)',
  rooms: '3 Bilik Tidur (3 Aircond) · 2 Bilik Air · 3 Katil Queen + Extra Toto',
  checkInTime: '03:00 PM',
  checkOutTime: '12:00 PM',
  whatsappUrl: 'https://www.wasap.my/60169867367/',
  description:
    'Terletak di Padang Enggang, Kota Bharu, Kelantan. Ss Homestay menawarkan penginapan Muslim yang selesa dengan Private Pool sesuai untuk keluarga, 3 bilik tidur berhawa dingin, kelengkapan memasak lengkap, Google TV 50" & Netflix percuma, serta kawasan parkir luas sehingga 10 buah kereta. Hubungi segera untuk slot kosong!',
  amenities: [
    '3 Bilik Tidur + 2 Bilik Air (Water Heater)',
    '3 Katil Queen + Extra Toto',
    'Bilik Tidur 1, 2 & 3 (Semua Aircond)',
    'Private Pool Sesuai untuk Keluarga',
    'Google TV 50" & Netflix Akses Percuma + WiFi',
    'Dapur & Kelengkapan Peralatan Memasak',
    'Penapis Air & Jug Kettle',
    'Washing Machine & Peti Ais',
    'Set BBQ untuk Aktiviti Keluarga',
    'Iron & Iron Board',
    'Parking Kereta Berbumbung',
    'Parking Luas Memuatkan Sehingga 10 Kereta',
  ],
  notices: [
    'Muslim Homestay: Keluarga diutamakan, sama jantina dan pasangan yang dah berkahwin sahaja',
    'Dilarang Merokok di dalam kawasan penginapan',
    'Dilarang Membawa Durian ke dalam rumah',
    'Sila Jaga Kebersihan sepanjang menginap',
  ],
};

export const ROOMSTAY_DETAILS = {
  title: 'Ss Roomstay',
  subtitle: 'Kampung Padang Enggang, Kota Bharu · Lokasi Strategik Bandar Baru Tunjong',
  rate: 130,
  promoLabel: 'Harga Promosi · Satu Malam',
  deposit: 100,
  capacity: 'Katil Queen + Toto Tambahan & Bantal',
  rooms: '1 Bilik Tidur Luas · 1 Tandas + Water Heater',
  checkInTime: '03:00 PM',
  checkOutTime: '12:00 PM',
  facebookPage: 'ssroomstay',
  whatsappUrl: 'https://www.wasap.my/60169863776/',
  description:
    'Terletak di lokasi yang strategik berhampiran Bandar Baru Tunjong, Kampung Padang Enggang, Kota Bharu. Ss Roomstay menawarkan harga promosi RM 130 satu malam lengkap dengan 1 bilik tidur luas, ruang tamu dan ruang makan selesa, penapis air Coway, WiFi & Google TV (Netflix, YouTube), serta kolam renang persendirian (berkongsi dengan Homestay).',
  amenities: [
    '1 Bilik Tidur yang Luas (Katil Queen)',
    '1 Tandas + Water Heater',
    'Kipas dan Penghawa Dingin (Aircond)',
    'Toto Tambahan Beserta Bantal',
    'Penapis Air Coway',
    'Ruang Tamu yang Selesa',
    'Ruang Makan',
    'WiFi & Google TV (Netflix, YouTube)',
    'Laman Parkir Kereta yang Luas',
    'Kolam Renang Persendirian (Berkongsi dengan Homestay)',
  ],
};

export const CONTACT_PERSONS = [
  { name: 'Hjh. Sarina', phone: '016-9867367', tel: '+60169867367', whatsapp: 'https://www.wasap.my/60169867367/' },
  { name: 'Hj. Shahir', phone: '016-9863776', tel: '+60169863776', whatsapp: 'https://www.wasap.my/60169863776/' },
];

export const LOCATION_INFO = {
  name: 'Ss Homestay & Roomstay (Padang Enggang, Kota Bharu)',
  address: 'Lot 13085, Kampung Padang Enggang, 15100 Kota Bharu, Kelantan',
  coordinates: {
    lat: 6.0865,
    lng: 102.2389,
  },
  tagline: 'Jom Bederat di Kota Bharu!',
  landmarks: [
    { place: 'Tunjong', time: '5 Minit' },
    { place: 'Pasar Wakaf Che Yeh', time: '5 Minit' },
    { place: 'Mydin Mall Tunjong', time: '5 Minit' },
    { place: 'RTC Tunjong', time: '5 Minit' },
    { place: 'Bandar Kota Bharu', time: '15 Minit' },
    { place: 'Pasar Siti Khadijah', time: '15 Minit' },
    { place: 'Aeon Mall Kota Bharu', time: '15 Minit' },
    { place: 'Lembah Sireh', time: '15 Minit' },
    { place: 'HUSM Kubang Kerian', time: '15 Minit' },
    { place: 'HRPZ (Hospital Raja Perempuan Zainab II)', time: '15 Minit' },
    { place: 'KPTM Kota Bharu', time: '15 Minit' },
    { place: 'Airport (Sultan Ismail Petra)', time: '30 Minit' },
    { place: 'UMK (Universiti Malaysia Kelantan)', time: '30 Minit' },
    { place: 'UiTM Machang', time: '45 Minit' },
  ],
};
