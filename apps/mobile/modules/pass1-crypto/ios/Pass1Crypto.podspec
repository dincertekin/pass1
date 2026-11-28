# pass1's crypto primitives on iOS: Argon2id from the reference C code (vendor/argon2), and
# HKDF, AES-256-GCM and random bytes from Apple's CryptoKit and Security frameworks.
Pod::Spec.new do |s|
  s.name           = 'Pass1Crypto'
  s.version        = '0.1.0'
  s.summary        = "pass1's crypto primitives on the device"
  s.description    = 'Argon2id, HKDF-SHA256, AES-256-GCM and secure random for the pass1 app.'
  s.author         = 'pass1'
  s.homepage       = 'https://github.com/dincertekin/pass1'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,c,swift}'
  # Swift sees only argon2.h; the rest of the Argon2 code stays private to this pod.
  s.public_header_files = 'vendor/argon2/include/argon2.h'
  s.private_header_files = 'vendor/argon2/src/**/*.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # pass1 always uses one lane, so Argon2's thread code is compiled out.
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ARGON2_NO_THREADS=1',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/vendor/argon2/include" "$(PODS_TARGET_SRCROOT)/vendor/argon2/src"',
  }
end
