#[cfg(target_os = "macos")]
fn add_swift_product_search_path(package: &str) {
    let configuration = if std::env::var("DEBUG").as_deref() == Ok("true") {
        "Debug"
    } else {
        "Release"
    };
    let product_directory =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR is set"))
            .join("swift-rs")
            .join(package)
            .join("out/Products")
            .join(configuration);
    if product_directory.join(format!("lib{package}.a")).is_file() {
        println!(
            "cargo:rustc-link-search=native={}",
            product_directory.display()
        );
    }
}

fn main() {
    #[cfg(target_os = "macos")]
    {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            println!("cargo:rerun-if-changed=native/siri_tts_bridge.h");
            println!("cargo:rerun-if-changed=native/siri_tts_bridge.m");
            cc::Build::new()
                .file("native/siri_tts_bridge.m")
                .flag("-fobjc-arc")
                .compile("berd_siri_tts_bridge");
            swift_rs::SwiftLinker::new("14.0")
                .with_package("BerdMacSpeechBridge", "swift/BerdMacSpeechBridge")
                .link();
            // Swift 6.4 may place static products under
            // `out/Products/{Debug,Release}` instead of swift-rs's historical
            // target-triple directory. Add the directory containing the
            // archive that was actually produced; the original swift-rs path
            // remains in the search list for older toolchains.
            add_swift_product_search_path("BerdMacSpeechBridge");
            for framework in ["Foundation", "AVFoundation", "AudioToolbox", "CoreAudio"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
            println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        }
    }
}
