import React, { useMemo, useState } from 'react';
import { Star, Trash2, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  ADMIN_EMAIL,
  Feedback,
  UNIT_RATES,
  UnitType,
  VALIDATION_LIMITS,
} from '../types/homestay';
import {
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
} from '../lib/firebase';

interface FeedbackSectionProps {
  user: User | null;
  feedbacks: Feedback[];
  feedbacksLoading: boolean;
}

type FeedbackFilter = 'all' | UnitType;

export function FeedbackSection({
  user,
  feedbacks,
  feedbacksLoading,
}: FeedbackSectionProps) {
  const [filter, setFilter] = useState<FeedbackFilter>('all');
  const [authorName, setAuthorName] = useState('');
  const [stayType, setStayType] = useState<UnitType>('homestay');
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredFeedbacks = useMemo(() => {
    if (filter === 'all') return feedbacks;
    return feedbacks.filter((fb) => fb.stayType === filter);
  }, [feedbacks, filter]);

  const averageRating = useMemo(() => {
    if (feedbacks.length === 0) return '0.0';
    const total = feedbacks.reduce((sum, item) => sum + item.rating, 0);
    return (total / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  const isAdminUser = user?.email === ADMIN_EMAIL;

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!user) {
      setErrorMsg('Sila log masuk dengan akaun Google terlebih dahulu untuk menghantar maklum balas.');
      return;
    }

    const trimmedName = (authorName || user.displayName || '').trim();
    const trimmedComment = comment.trim();

    if (
      trimmedName.length < VALIDATION_LIMITS.AUTHOR_NAME_MIN ||
      trimmedName.length > VALIDATION_LIMITS.AUTHOR_NAME_MAX
    ) {
      setErrorMsg('Sila masukkan nama anda (2 hingga 80 aksara).');
      return;
    }

    if (
      trimmedComment.length < VALIDATION_LIMITS.COMMENT_MIN ||
      trimmedComment.length > VALIDATION_LIMITS.COMMENT_MAX
    ) {
      setErrorMsg('Sila tulis ulasan antara 5 hingga 600 aksara.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'feedbacks'), {
        userId: user.uid,
        authorName: trimmedName,
        stayType,
        rating,
        comment: trimmedComment,
        createdAt: serverTimestamp(),
      });
      setComment('');
      setRating(5);
      setSuccessMsg('Terima kasih! Maklum balas anda telah diterbitkan.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'feedbacks');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'feedbacks', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `feedbacks/${id}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      id="maklum-balas"
      className="scroll-mt-28 max-w-[1360px] mx-auto px-4 sm:px-6 py-12 border-t border-[#DDE2DC]"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-medium text-[#14532D] mb-2">
            06. Maklum Balas Pengguna
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#161B17]">
            Ulasan & Pengalaman Tetamu
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-[#161B17]">
            Purata Penilaian:{' '}
            <strong className="font-mono-tabular text-[#14532D]">
              {feedbacks.length > 0 ? `${averageRating} / 5.0` : 'Belum ada penilaian'}
            </strong>
            <span className="text-[#525C54]"> · {feedbacks.length} ulasan</span>
          </div>

          <div
            className="inline-flex p-1 bg-[#EFF2EE] rounded-lg border border-[#DDE2DC]"
            role="tablist"
            aria-label="Penapis Maklum Balas"
          >
            {(['all', 'homestay', 'roomstay'] as FeedbackFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === key
                    ? 'bg-white text-[#161B17] shadow-xs'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                {key === 'all' ? 'Semua' : key === 'homestay' ? 'Homestay' : 'Roomstay'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Reviews Feed */}
        <div className="lg:col-span-7 space-y-4">
          {feedbacksLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-32 rounded-2xl bg-[#EFF2EE]" />
              <div className="h-32 rounded-2xl bg-[#EFF2EE]" />
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="bg-white border border-[#DDE2DC] rounded-2xl p-8 text-center">
              <p className="text-sm font-medium text-[#161B17]">
                Belum ada maklum balas untuk kategori ini.
              </p>
              <p className="text-xs text-[#525C54] mt-1">
                Jadilah tetamu pertama berkongsi pengalaman penginapan anda di Ss Homestay & Roomstay.
              </p>
            </div>
          ) : (
            filteredFeedbacks.map((fb) => {
              const canDelete = user && (user.uid === fb.userId || isAdminUser);
              return (
                <article
                  key={fb.id}
                  className="bg-white border border-[#DDE2DC] rounded-2xl p-6 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#161B17]">{fb.authorName}</h3>
                      <div className="flex items-center gap-2 text-xs text-[#525C54] mt-0.5">
                        <span>{UNIT_RATES[fb.stayType].label}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular text-[#14532D] font-medium">
                          {fb.rating}.0 / 5 Bintang
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5" aria-label={`${fb.rating} daripada 5 bintang`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= fb.rating
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-[#DDE2DC]'
                            }`}
                          />
                        ))}
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deletingId === fb.id}
                          onClick={() => handleDeleteFeedback(fb.id)}
                          aria-label="Padam ulasan"
                          className="p-1.5 rounded-lg text-[#525C54] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-[#161B17] leading-relaxed">{fb.comment}</p>
                </article>
              );
            })
          )}
        </div>

        {/* Right: Submit Feedback Form */}
        <div className="lg:col-span-5 bg-white border border-[#DDE2DC] rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-xl font-semibold text-[#161B17] mb-1">
            Tulis Maklum Balas Anda
          </h3>
          <p className="text-xs text-[#525C54] mb-5">
            Kongsi pengalaman anda menginap di Ss Homestay atau Ss Roomstay.
          </p>

          {!user && (
            <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] flex items-center justify-between gap-3 mb-4">
              <p className="text-xs text-[#525C54]">
                Log masuk Google diperlukan untuk menghantar ulasan.
              </p>
              <button
                type="button"
                onClick={() => signInWithGoogle().catch(() => {})}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161B17] text-white text-xs font-medium hover:bg-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Log Masuk
              </button>
            </div>
          )}

          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            <div>
              <label htmlFor="fb-name" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                Nama Anda
              </label>
              <input
                id="fb-name"
                type="text"
                maxLength={VALIDATION_LIMITS.AUTHOR_NAME_MAX}
                value={authorName || user?.displayName || ''}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Nama anda"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
              />
            </div>

            <div>
              <label htmlFor="fb-unit" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                Unit Penginapan
              </label>
              <select
                id="fb-unit"
                value={stayType}
                onChange={(e) => setStayType(e.target.value as UnitType)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D] cursor-pointer"
              >
                <option value="homestay">Ss Homestay</option>
                <option value="roomstay">Ss Roomstay</option>
              </select>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#161B17] mb-1.5">
                Penilaian ({rating} / 5 Bintang)
              </span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    aria-label={`Beri ${starVal} bintang`}
                    className="p-1.5 rounded-lg border border-[#DDE2DC] hover:bg-[#F8F9F7] transition-colors cursor-pointer"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        starVal <= rating ? 'fill-amber-500 text-amber-500' : 'text-[#DDE2DC]'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="fb-comment" className="block text-xs font-semibold text-[#161B17] mb-1.5">
                Ulasan Penginapan
              </label>
              <textarea
                id="fb-comment"
                rows={4}
                required
                maxLength={VALIDATION_LIMITS.COMMENT_MAX}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Nyatakan kebersihan, keselesaan bilik, dan kemudahan..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
              />
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-[#F1F7F3] border border-[#84B395] flex items-start gap-2 text-xs text-[#14532D]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Menghantar...' : 'Hantar Maklum Balas'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
