// pass1's crypto primitives on iOS, behind the CryptoProvider interface in @pass1/crypto
// (packages/crypto/src/provider.ts). Nothing here is trusted until the conformance checks pass
// on the device: packages/crypto/src/conformance.ts.
//
// Keys never go to JavaScript. JS gets an opaque handle ("key-3"); the key itself stays here,
// in native memory, like a non-extractable CryptoKey in the browser. forgetKeys() drops them
// all when the vault locks.

import CryptoKit
import ExpoModulesCore
import Foundation
import Security

private let keyLengthBytes = 32
private let gcmIvBytes = 12
private let gcmTagBytes = 16
private let argon2OutputBytes = 32
// Upper bounds as in KDF_LIMITS (@pass1/shared), so a hostile server can't make the phone
// allocate gigabytes or spin for minutes. Settings that are too weak never get this far: the API
// client refuses them (kdfParamsSchema). 8 KiB is Argon2's own minimum.
private let argon2MemoryKiB = 8...1024 * 1024
private let argon2Iterations = 1...20
private let argon2Parallelism = 1...8

final class InvalidInput: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Invalid input: \(param)" }
}

final class CryptoFailure: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Crypto operation failed: \(param)" }
}

/** Keys by handle. A lock, because async functions run on background threads. */
private final class KeyStore {
  private var keys: [String: SymmetricKey] = [:]
  private var nextId = 0
  private let lock = NSLock()

  func add(_ key: SymmetricKey) -> String {
    lock.lock(); defer { lock.unlock() }
    nextId += 1
    let handle = "key-\(nextId)"
    keys[handle] = key
    return handle
  }

  func get(_ handle: String) throws -> SymmetricKey {
    lock.lock(); defer { lock.unlock() }
    guard let key = keys[handle] else { throw InvalidInput("unknown key handle") }
    return key
  }

  func removeAll() {
    lock.lock(); defer { lock.unlock() }
    keys.removeAll()
  }
}

public class Pass1CryptoModule: Module {
  private let keys = KeyStore()

  public func definition() -> ModuleDefinition {
    Name("Pass1Crypto")

    AsyncFunction("argon2id") { (password: Data, salt: Data, memoryKiB: Int, iterations: Int, parallelism: Int) -> Data in
      try Self.argon2id(password: password, salt: salt, memoryKiB: memoryKiB, iterations: iterations, parallelism: parallelism)
    }.runOnQueue(.global(qos: .userInitiated))

    AsyncFunction("hkdfAesKey") { (material: Data, info: String) -> String in
      self.keys.add(Self.hkdf(material: material, info: info, length: keyLengthBytes))
    }

    AsyncFunction("hkdfBytes") { (material: Data, info: String, length: Int) -> Data in
      guard (1...255 * 32).contains(length) else { throw InvalidInput("HKDF length \(length)") }
      return Self.bytes(of: Self.hkdf(material: material, info: info, length: length))
    }

    AsyncFunction("importAesKey") { (raw: Data) -> String in
      guard raw.count == keyLengthBytes else { throw InvalidInput("AES key must be 32 bytes") }
      return self.keys.add(SymmetricKey(data: raw))
    }

    AsyncFunction("aesGcmEncrypt") { (handle: String, iv: Data, plaintext: Data, associatedData: Data) -> Data in
      let key = try self.keys.get(handle)
      let box = try AES.GCM.seal(plaintext, using: key, nonce: Self.nonce(iv), authenticating: associatedData)
      return box.ciphertext + box.tag
    }

    AsyncFunction("aesGcmDecrypt") { (handle: String, iv: Data, ciphertext: Data, associatedData: Data) -> Data in
      let key = try self.keys.get(handle)
      guard ciphertext.count >= gcmTagBytes else { throw CryptoFailure("ciphertext too short") }
      let box = try AES.GCM.SealedBox(
        nonce: Self.nonce(iv),
        ciphertext: ciphertext.prefix(ciphertext.count - gcmTagBytes),
        tag: ciphertext.suffix(gcmTagBytes)
      )
      do {
        return try AES.GCM.open(box, using: key, authenticating: associatedData)
      } catch {
        // Wrong key, changed data or changed associated data: never say which.
        throw CryptoFailure("decryption failed")
      }
    }

    Function("randomBytes") { (length: Int) -> Data in
      guard length >= 0 else { throw InvalidInput("negative length") }
      var bytes = Data(count: length)
      let status = bytes.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, length, $0.baseAddress!) }
      guard length == 0 || status == errSecSuccess else { throw CryptoFailure("system random source failed") }
      return bytes
    }

    Function("randomUUID") { () -> String in
      UUID().uuidString.lowercased()
    }

    Function("forgetKeys") {
      self.keys.removeAll()
    }
  }

  private static func argon2id(password: Data, salt: Data, memoryKiB: Int, iterations: Int, parallelism: Int) throws -> Data {
    guard argon2MemoryKiB.contains(memoryKiB) else { throw InvalidInput("Argon2 memory \(memoryKiB) KiB") }
    guard argon2Iterations.contains(iterations), argon2Parallelism.contains(parallelism) else {
      throw InvalidInput("Argon2 iterations \(iterations), parallelism \(parallelism)")
    }
    var output = Data(count: argon2OutputBytes)
    let result = output.withUnsafeMutableBytes { out in
      password.withUnsafeBytes { pwd in
        salt.withUnsafeBytes { saltBytes in
          argon2id_hash_raw(
            UInt32(iterations), UInt32(memoryKiB), UInt32(parallelism),
            pwd.baseAddress, password.count,
            saltBytes.baseAddress, salt.count,
            out.baseAddress, argon2OutputBytes
          )
        }
      }
    }
    guard result == ARGON2_OK.rawValue else { throw CryptoFailure("Argon2 error \(result)") }
    return output
  }

  /** HKDF-SHA256 with an empty salt, as pass1 uses everywhere. */
  private static func hkdf(material: Data, info: String, length: Int) -> SymmetricKey {
    HKDF<SHA256>.deriveKey(
      inputKeyMaterial: SymmetricKey(data: material),
      salt: Data(),
      info: Data(info.utf8),
      outputByteCount: length
    )
  }

  private static func nonce(_ iv: Data) throws -> AES.GCM.Nonce {
    guard iv.count == gcmIvBytes else { throw InvalidInput("IV must be 12 bytes") }
    return try AES.GCM.Nonce(data: iv)
  }

  private static func bytes(of key: SymmetricKey) -> Data {
    key.withUnsafeBytes { Data($0) }
  }
}
