Pod::Spec.new do |s|
  s.name = 'HinsdaleEngine'
  s.version = '1.0.0'
  s.summary = 'Embedded Rust EVM decompiler for Hinsdale'
  s.description = 'Expo native module binding to the bundled Hinsdale Rust engine.'
  s.author = 'Hinsdale'
  s.homepage = 'https://github.com/flipflowglobal/hinsdale'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/flipflowglobal/hinsdale.git', :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{swift,h,m}'
  s.public_header_files = 'ios/HinsdaleEngine.h'
  s.vendored_frameworks = 'ios/HinsdaleEngine.xcframework'
  s.dependency 'ExpoModulesCore'
end
