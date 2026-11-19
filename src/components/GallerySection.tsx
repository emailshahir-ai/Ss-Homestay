import { useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { HOMESTAY_PHOTOS, ROOMSTAY_PHOTOS } from '../data/propertyData';
import { GalleryPhoto } from '../types/homestay';
import { ResilientImage } from './ResilientImage';

export function GallerySection() {
  const allPhotos = [...HOMESTAY_PHOTOS, ...ROOMSTAY_PHOTOS];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openPhoto = (photo: GalleryPhoto) => {
    const idx = allPhotos.findIndex((p) => p.id === photo.id);
    if (idx !== -1) setLightboxIndex(idx);
  };

  const handlePrev = () => {
    setLightboxIndex((prev) =>
      prev === null ? null : (prev - 1 + allPhotos.length) % allPhotos.length
    );
  };

  const handleNext = () => {
    setLightboxIndex((prev) =>
      prev === null ? null : (prev + 1) % allPhotos.length
    );
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 space-y-16 py-8">
      {/* 3. Gambar Homestay */}
      <section id="gambar-homestay" className="pt-10 border-t border-[#DDE2DC]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-medium text-[#14532D] mb-2">03. Gambar Homestay</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
              Galeri Sebenar Ss Homestay
            </h2>
          </div>
          <p className="text-sm text-[#525C54]">
            Private Pool, 3 bilik tidur berhawa dingin, ruang tamu, ruang keluarga, ruang makan, dapur, tandas & risalah rasmi. Klik gambar untuk paparan penuh.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {HOMESTAY_PHOTOS.map((photo) => (
            <figure
              key={photo.id}
              className="group bg-white border border-[#DDE2DC] rounded-2xl overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => openPhoto(photo)}
                className="relative w-full aspect-[4/3] block overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-[#14532D] bg-[#EFF2EE]"
                aria-label={`Lihat gambar ${photo.title}`}
              >
                <ResilientImage
                  src={photo.src}
                  alt={photo.title}
                  title={photo.title}
                  className={`w-full h-full ${
                    photo.id === 'hs-poster' ? 'object-contain bg-[#F8F9F7]' : 'object-cover'
                  } group-hover:scale-[1.03] transition-transform duration-300`}
                />
                <span className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Expand className="w-4 h-4" />
                </span>
              </button>
              <figcaption className="p-4 flex-1">
                <h3 className="text-sm font-semibold text-[#161B17]">{photo.title}</h3>
                <p className="text-xs text-[#525C54] mt-1 leading-relaxed">{photo.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 4. Gambar Roomstay */}
      <section id="gambar-roomstay" className="pt-10 border-t border-[#DDE2DC]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-medium text-[#14532D] mb-2">04. Gambar Roomstay</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
              Galeri Sebenar Ss Roomstay
            </h2>
          </div>
          <p className="text-sm text-[#525C54]">
            Bilik tidur katil Queen, ruang tamu & ruang makan, penapis air Coway, tandas water heater serta risalah rasmi. Klik gambar untuk paparan penuh.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ROOMSTAY_PHOTOS.map((photo) => (
            <figure
              key={photo.id}
              className="group bg-white border border-[#DDE2DC] rounded-2xl overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => openPhoto(photo)}
                className="relative w-full aspect-[4/3] block overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-[#14532D] bg-[#EFF2EE]"
                aria-label={`Lihat gambar ${photo.title}`}
              >
                <ResilientImage
                  src={photo.src}
                  alt={photo.title}
                  title={photo.title}
                  className={`w-full h-full ${
                    photo.id === 'rs-risalah' ? 'object-contain bg-[#F8F9F7]' : 'object-cover'
                  } group-hover:scale-[1.03] transition-transform duration-300`}
                />
                <span className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Expand className="w-4 h-4" />
                </span>
              </button>
              <figcaption className="p-5 flex-1">
                <h3 className="text-base font-semibold text-[#161B17]">{photo.title}</h3>
                <p className="text-xs sm:text-sm text-[#525C54] mt-1 leading-relaxed">
                  {photo.caption}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Interactive Lightbox Modal */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={allPhotos[lightboxIndex].title}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Tutup paparan gambar"
            className="absolute top-4 right-4 p-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handlePrev}
            aria-label="Gambar sebelumnya"
            className="absolute left-3 sm:left-6 p-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="max-w-4xl w-full bg-[#161B17] rounded-2xl overflow-hidden border border-white/10">
            <div className="h-[70vh] w-full bg-black flex items-center justify-center">
              <ResilientImage
                src={allPhotos[lightboxIndex].src}
                alt={allPhotos[lightboxIndex].title}
                title={allPhotos[lightboxIndex].title}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">{allPhotos[lightboxIndex].title}</h4>
                <p className="text-xs text-white/75 mt-1">{allPhotos[lightboxIndex].caption}</p>
              </div>
              <span className="font-mono-tabular text-xs text-white/60 shrink-0">
                {lightboxIndex + 1} / {allPhotos.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            aria-label="Gambar seterusnya"
            className="absolute right-3 sm:right-6 p-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
