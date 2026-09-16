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
    println!("cargo:rerun-if-changed=migrations");
    println!("cargo:rerun-if-env-changed=BERD_APP_VERSION");
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");

    let app_version =
        std::env::var("BERD_APP_VERSION").unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned());
    println!("cargo:rustc-env=BERD_BUILD_VERSION={app_version}");

    #[cfg(target_os = "macos")]
    {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            swift_rs::SwiftLinker::new("14.0")
                .with_package("BerdAirPodsBridge", "swift/BerdAirPodsBridge")
                .link();
            // Swift 6.4 may place static products under
            // `out/Products/{Debug,Release}` instead of swift-rs's historical
            // target-triple directory. Add the directory containing the
            // archive that was actually produced; the original swift-rs path
            // remains in the search list for older toolchains.
            add_swift_product_search_path("BerdAirPodsBridge");

            // Swift packages linked into a Rust executable use @rpath for the
            // system Swift runtime, which is available from this stable path.
            println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        }
    }
    tauri_build::build()
}
