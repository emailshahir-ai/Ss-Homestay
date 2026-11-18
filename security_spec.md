# Security Specification & Payload-First TDD (`Ss Homestay & Roomstay`)

## 1. Data Invariants
1. **Admin-Only Bookings & PII Isolation**: Private guest details (`guestName`, `phone`, `state`, `accountNumber`) reside exclusively in `/bookings/{bookingId}` and can only be read or written by the verified admin (`emailshahir@gmail.com`).
2. **Atomic Calendar Sync**: Creating a `/bookings/{bookingId}` document MUST occur in the same batch as creating `/availability_slots/{bookingId}` (`existsAfter`), and vice versa.
3. **Immutable Ownership & Timestamps**: `userId` and `createdAt` can never be altered after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. **Admin State Control**: Only verified admin (`emailshahir@gmail.com`) can create, update, cancel, or delete booking records and availability slots.
5. **Path Hardening**: All document IDs (`bookingId`, `slotId`, `feedbackId`) must match `^[a-zA-Z0-9_-]+$` and be $\le 128$ chars.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Booking**: `{ ...validBooking, isAdmin: true }` -> Blocked by `keys().hasOnly(...)`.
2. **Identity Spoofing on Booking**: `{ ...validBooking, userId: "victim_uid" }` -> Blocked by `incoming().userId == request.auth.uid`.
3. **Unverified Email Write**: Valid booking submitted with `request.auth.token.email_verified == false` -> Blocked by `isVerified()`.
4. **Orphan Booking Without Calendar Slot**: Writing `/bookings/b1` without matching `/availability_slots/b1` in the same batch -> Blocked by `existsAfter(...)`.
5. **Orphan Slot Without Booking**: Writing `/availability_slots/s1` without `/bookings/s1` -> Blocked by `existsAfter(...)`.
6. **Negative / Zero Night or Amount Tampering**: `{ ...validBooking, totalAmount: -100, nights: 0 }` -> Blocked by numeric bounds (`nights >= 1 && totalAmount > 0`).
7. **ID Poisoning**: Document ID `"../admin/hack"` or 500-char string -> Blocked by `isValidId()`.
8. **Blanket Booking Scrape**: Non-admin running `list` on `/bookings` without `where('userId', '==', uid)` -> Blocked by `resource.data.userId == request.auth.uid`.
9. **Unauthorized PII Get**: Non-owner calling `get` on `/bookings/other_id` -> Blocked by owner/admin check.
10. **Client Timestamp Forgery**: `{ ...validBooking, createdAt: "2020-01-01T00:00:00Z" }` -> Blocked by `incoming().createdAt == request.time`.
11. **Re-opening Cancelled Booking**: Updating a `cancelled` booking back to `confirmed` as non-admin -> Blocked by terminal state lock.
12. **Out-of-Range Feedback Rating**: `{ ...validFeedback, rating: 99, comment: "x" }` -> Blocked by `rating >= 1 && rating <= 5` and `comment.size() >= 5`.
