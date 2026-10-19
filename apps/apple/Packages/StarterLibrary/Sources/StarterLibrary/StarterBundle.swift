import Foundation

#if canImport(CryptoKit)
import CryptoKit
#endif

public enum BundleError: Error, Sendable, Equatable {
    case format
    case unknownKey
    case signature
    case rollback
    case content
    /// Signature checking needs CryptoKit (Apple platforms).
    case unsupportedPlatform
}

/// The file that ships in the app and arrives from the server: payload bytes plus a signature over
/// exactly those bytes, so reading never depends on a canonical JSON form.
public struct StarterBundle: Sendable {
    struct Envelope: Decodable {
        var format: String
        var formatVersion: Int
        var keyId: String
        var algorithm: String
        var payload: String
        var signature: String
    }

    /// Verifies and decodes a bundle. `trustedKeys` maps key id to the raw 32-byte Ed25519 public key
    /// pinned in the app. `installedVersion` is the highest bundle version already installed; an
    /// older or equal bundle is refused so a replayed old file cannot bring back retired items.
    public static func open(
        _ data: Data,
        trustedKeys: [String: Data],
        installedVersion: Int? = nil
    ) throws -> StarterLibraryContent {
        let decoder = Self.decoder()
        guard let env = try? decoder.decode(Envelope.self, from: data),
            env.format == "demo-starter-bundle", env.formatVersion == 1, env.algorithm == "ed25519",
            let bytes = Data(base64Encoded: env.payload),
            let sig = Data(base64Encoded: env.signature)
        else { throw BundleError.format }
        guard let rawKey = trustedKeys[env.keyId] else { throw BundleError.unknownKey }
        #if canImport(CryptoKit)
        guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: rawKey),
            key.isValidSignature(sig, for: bytes)
        else { throw BundleError.signature }
        #else
        _ = (rawKey, sig)
        throw BundleError.unsupportedPlatform
        #endif
        let content = try decodeUnverified(payload: bytes)
        if let installed = installedVersion, content.bundleVersion <= installed {
            throw BundleError.rollback
        }
        return content
    }

    /// The one decoder for bundle content. `open` uses it after the signature check; screens and
    /// tests that load an unsigned fixture payload use it too, so the wire format is read one way.
    /// It does not check a signature: never feed it downloaded bytes, only `open` does that.
    public static func decodeUnverified(payload: Data) throws -> StarterLibraryContent {
        guard let content = try? decoder().decode(StarterLibraryContent.self, from: payload),
            content.schemaVersion == 1
        else { throw BundleError.content }
        return content
    }

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
