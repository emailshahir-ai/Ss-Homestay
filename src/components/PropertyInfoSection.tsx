import { Check, ArrowRight, AlertCircle, MessageCircle, Phone } from 'lucide-react';
import { CONTACT_PERSONS, HOMESTAY_DETAILS, ROOMSTAY_DETAILS } from '../data/propertyData';
import { UnitType } from '../types/homestay';

interface PropertyInfoSectionProps {
  onChooseUnit: (unit: UnitType) => void;
}

export function PropertyInfoSection({ onChooseUnit }: PropertyInfoSectionProps) {
  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 space-y-16 py-12">
      {/* 1. Maklumat Homestay */}
      <section
        id="maklumat-homestay"
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pt-10 border-t border-[#DDE2DC] items-start"
      >
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs font-medium text-[#14532D]">01. Maklumat Homestay</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
            {HOMESTAY_DETAILS.title}
          </h2>
          <p className="text-base font-medium text-[#161B17]">
            {HOMESTAY_DETAILS.subtitle}
          </p>
          <p className="text-xs sm:text-sm font-medium text-[#14532D] bg-[#F1F7F3] border border-[#C6DEC9] rounded-xl px-3.5 py-2.5 leading-relaxed">
            {HOMESTAY_DETAILS.guestPolicy}
          </p>
          <p className="text-sm text-[#525C54] leading-relaxed">
            {HOMESTAY_DETAILS.description}
          </p>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#DDE2DC] text-xs">
            <div>
              <span className="block text-[#525C54]">Kadar & Deposit</span>
              <span className="font-mono-tabular text-lg font-bold text-[#14532D]">
                RM {HOMESTAY_DETAILS.rate} / malam
              </span>
              <span className="block font-mono-tabular text-[#525C54] mt-0.5">
                Deposit: RM {HOMESTAY_DETAILS.deposit}
              </span>
            </div>
            <div>
              <span className="block text-[#525C54]">Kapasiti & Bilik</span>
              <span className="font-semibold text-sm text-[#161B17]">
                {HOMESTAY_DETAILS.capacity}
              </span>
              <span className="block text-[#525C54] mt-0.5">{HOMESTAY_DETAILS.rooms}</span>
            </div>
            <div>
              <span className="block text-[#525C54]">Check In</span>
              <span className="font-mono-tabular font-semibold text-[#161B17]">
                {HOMESTAY_DETAILS.checkInTime}
              </span>
            </div>
            <div>
              <span className="block text-[#525C54]">Check Out</span>
              <span className="font-mono-tabular font-semibold text-[#161B17]">
                {HOMESTAY_DETAILS.checkOutTime}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onChooseUnit('homestay')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#14532D] text-white text-sm font-medium hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap"
            >
              Pilih & Semak Tarikh Homestay
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href={HOMESTAY_DETAILS.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#14532D] text-[#14532D] text-sm font-medium hover:bg-[#F1F7F3] transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Slot Kosong
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 sm:p-8">
            <h3 className="text-base font-semibold text-[#161B17] mb-5">
              Kemudahan Lengkap Ss Homestay
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              {HOMESTAY_DETAILS.amenities.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#161B17]">
                  <Check className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Notis Penting & Hubungi Kami */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-[#161B17] mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-700" />
                Polisi & Notis Penting Tetamu
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-[#525C54]">
                {HOMESTAY_DETAILS.notices.map((notice) => (
                  <li key={notice} className="flex items-start gap-2">
                    <span className="text-red-700 font-semibold" aria-hidden="true">•</span>
                    <span className="text-[#161B17]">{notice}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#161B17] mb-1 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#14532D]" />
                  Hubungi Segera Untuk Slot Kosong
                </h3>
                <p className="text-xs text-[#525C54] mb-3">
                  Klik nombor telefon atau WhatsApp terus untuk pertanyaan pantas.
                </p>
                <ul className="space-y-2.5 text-xs sm:text-sm">
                  {CONTACT_PERSONS.map((person) => (
                    <li key={person.phone} className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#161B17]">{person.name}</span>
                      <div className="flex items-center gap-2.5">
                        <a
                          href={`tel:${person.tel}`}
                          className="font-mono-tabular font-semibold text-[#14532D] hover:underline"
                        >
                          {person.phone}
                        </a>
                        <a
                          href={person.whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-[#14532D] underline underline-offset-2 hover:text-[#166534]"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href={HOMESTAY_DETAILS.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Chat WhatsApp: wasap.my/60169867367
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Maklumat Roomstay */}
      <section
        id="maklumat-roomstay"
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pt-10 border-t border-[#DDE2DC] items-start"
      >
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs font-medium text-[#14532D]">02. Maklumat Roomstay</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
            {ROOMSTAY_DETAILS.title}
          </h2>
          <p className="text-base font-medium text-[#161B17]">
            {ROOMSTAY_DETAILS.subtitle}
          </p>
          <p className="text-sm text-[#525C54] leading-relaxed">
            {ROOMSTAY_DETAILS.description}
          </p>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#DDE2DC] text-xs">
            <div>
              <span className="block text-[#525C54]">{ROOMSTAY_DETAILS.promoLabel}</span>
              <span className="font-mono-tabular text-lg font-bold text-[#14532D]">
                RM {ROOMSTAY_DETAILS.rate} / malam
              </span>
              <span className="block font-mono-tabular text-[#525C54] mt-0.5">
                Deposit: RM {ROOMSTAY_DETAILS.deposit}
              </span>
            </div>
            <div>
              <span className="block text-[#525C54]">Bilik & Kelengkapan</span>
              <span className="font-semibold text-sm text-[#161B17]">
                {ROOMSTAY_DETAILS.rooms}
              </span>
              <span className="block text-[#525C54] mt-0.5">{ROOMSTAY_DETAILS.capacity}</span>
            </div>
            <div>
              <span className="block text-[#525C54]">Check In</span>
              <span className="font-mono-tabular font-semibold text-[#161B17]">
                {ROOMSTAY_DETAILS.checkInTime}
              </span>
            </div>
            <div>
              <span className="block text-[#525C54]">Check Out</span>
              <span className="font-mono-tabular font-semibold text-[#161B17]">
                {ROOMSTAY_DETAILS.checkOutTime}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onChooseUnit('roomstay')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#161B17] text-white text-sm font-medium hover:bg-black transition-colors cursor-pointer whitespace-nowrap"
            >
              Pilih & Semak Tarikh Roomstay
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href={ROOMSTAY_DETAILS.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#14532D] text-[#14532D] text-sm font-medium hover:bg-[#F1F7F3] transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Roomstay
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 sm:p-8">
            <h3 className="text-base font-semibold text-[#161B17] mb-5">
              Kami Menyediakan — Kemudahan Lengkap Ss Roomstay
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              {ROOMSTAY_DETAILS.amenities.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#161B17]">
                  <Check className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#161B17] flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#14532D]" />
                Hubungi & Media Sosial Ss Roomstay
              </h3>
              <p className="text-xs text-[#525C54]">
                WhatsApp / Telefon: <strong className="font-mono-tabular text-[#161B17]">016-9863776</strong> /{' '}
                <strong className="font-mono-tabular text-[#161B17]">016-9867367</strong> · Facebook:{' '}
                <strong className="text-[#161B17]">{ROOMSTAY_DETAILS.facebookPage}</strong>
              </p>
            </div>
            <a
              href={ROOMSTAY_DETAILS.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors shrink-0 whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Tempah / Tanya Roomstay
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
