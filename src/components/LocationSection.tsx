import { useState } from 'react';
import { Check, Copy, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { CONTACT_PERSONS, LOCATION_INFO } from '../data/propertyData';

export function LocationSection() {
  const [copied, setCopied] = useState(false);

  const { lat, lng } = LOCATION_INFO.coordinates;
  const googleMapsUrl = LOCATION_INFO.googleMapsUrl;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.008}%2C${lat - 0.005}%2C${lng + 0.008}%2C${lat + 0.005}&layer=mapnik&marker=${lat}%2C${lng}`;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(LOCATION_INFO.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      id="lokasi"
      className="max-w-[1360px] mx-auto px-4 sm:px-6 py-12 border-t border-[#DDE2DC]"
    >
      <div className="mb-8">
        <p className="text-xs font-medium text-[#14532D] mb-2">05. Lokasi</p>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
          Lokasi & Arah Perjalanan
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Address & Nearby Landmarks */}
        <div className="lg:col-span-5 bg-white border border-[#DDE2DC] rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-[#161B17]">
                  {LOCATION_INFO.name}
                </h3>
                <p className="text-sm text-[#525C54] mt-1 leading-relaxed">
                  {LOCATION_INFO.address}
                </p>
                <p className="text-xs font-medium text-[#14532D] mt-2">
                  {LOCATION_INFO.tagline}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5" />
                Buka di Google Maps
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] text-xs font-medium hover:bg-[#EFF2EE] transition-colors whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#14532D]" />
                    Alamat Disalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Alamat
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-5 border-t border-[#DDE2DC]">
            <h4 className="text-sm font-semibold text-[#161B17] mb-3">
              Anggaran Masa ke Destinasi Utama
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {LOCATION_INFO.landmarks.map((lm) => (
                <li
                  key={lm.place}
                  className="py-1.5 border-b border-[#EBEFEB] flex items-center justify-between gap-2"
                >
                  <span className="text-[#161B17] font-medium truncate" title={lm.place}>
                    {lm.place}
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#14532D] shrink-0">
                    {lm.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Embedded Interactive Map */}
        <div className="lg:col-span-7 bg-white border border-[#DDE2DC] rounded-2xl overflow-hidden min-h-[380px] flex flex-col">
          <iframe
            title="Peta Lokasi Ss Homestay & Roomstay Kota Bharu"
            src={osmEmbedUrl}
            className="w-full h-full min-h-[380px] flex-1 border-0"
            loading="lazy"
          />
          <div className="px-5 py-3 bg-[#F8F9F7] border-t border-[#DDE2DC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#525C54]">
            <span>Kampung Padang Enggang · Tunjong, 15100 Kota Bharu, Kelantan</span>
            <span className="font-mono-tabular">
              {CONTACT_PERSONS.map((c) => `${c.phone} (${c.name})`).join(' · ')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
