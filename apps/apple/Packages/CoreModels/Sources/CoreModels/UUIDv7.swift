import Foundation

/// UUIDv7 (RFC 9562): a 48-bit Unix millisecond timestamp followed by random bits.
///
/// Ids are generated on the device so records can be created offline, and they sort by
/// creation time, which keeps database indexes compact.
public enum UUIDv7 {
    /// Makes a new UUIDv7 for the given time.
    public static func make(at date: Date = Date()) -> UUID {
        var generator = SystemRandomNumberGenerator()
        return make(at: date, using: &generator)
    }

    /// Makes a UUIDv7 with a caller-supplied random source (deterministic in tests).
    public static func make<G: RandomNumberGenerator>(
        at date: Date, using generator: inout G
    ) -> UUID {
        let millis = UInt64(max(0, (date.timeIntervalSince1970 * 1000).rounded(.down)))
        var bytes = [UInt8](repeating: 0, count: 16)
        for index in 0..<6 {
            bytes[index] = UInt8(truncatingIfNeeded: millis >> (8 * (5 - index)))
        }
        for index in 6..<16 {
            bytes[index] = UInt8.random(in: 0...255, using: &generator)
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x70  // version 7
        bytes[8] = (bytes[8] & 0x3F) | 0x80  // RFC 9562 variant
        return UUID(
            uuid: (
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
            ))
    }

    /// The timestamp embedded in a UUIDv7, or nil if the id is not version 7.
    public static func date(of id: UUID) -> Date? {
        let raw = id.uuid
        guard raw.6 >> 4 == 7 else { return nil }
        let head = [raw.0, raw.1, raw.2, raw.3, raw.4, raw.5]
        let millis = head.reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        return Date(timeIntervalSince1970: Double(millis) / 1000)
    }
}
