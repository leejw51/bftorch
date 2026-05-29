#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Native-window shell for the PyTorch Sandbox.
//!
//! Launches the `bftorch` pyapp binary (the FastAPI + PyTorch server), reads
//! the `[bftorch] ui-url=` line it prints on stdout, waits for that port to
//! start accepting connections, then opens a webview window pointing at it.
//! Closing the window kills the child server.

use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Locate the `bftorch` server binary relative to this executable.
fn find_bftorch() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Production layout: sibling inside the .app's MacOS/ dir.
            let sibling = dir.join("bftorch");
            if sibling.exists() {
                return sibling;
            }
            // Dev layout: tauri/target/release/bftorch-app -> ../../bftorch
            for up in ["../../bftorch", "../../../bftorch"] {
                let candidate = dir.join(up);
                if candidate.exists() {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from("bftorch")
}

fn port_open(host: &str, port: u16) -> bool {
    if let Ok(addr) = format!("{}:{}", host, port).parse() {
        TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
    } else {
        false
    }
}

fn main() {
    let bftorch_path = find_bftorch();
    eprintln!("[bftorch-app] launching {}", bftorch_path.display());

    let mut child = Command::new(&bftorch_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to start bftorch");

    let stdout = child.stdout.take().expect("no stdout");
    let stderr = child.stderr.take().expect("no stderr");

    let url_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let url_writer = url_holder.clone();

    // Mine stdout for the ui-url line; mirror everything for debugging.
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            println!("[bftorch] {}", line);
            if let Some(rest) = line.strip_prefix("[bftorch] ui-url=") {
                *url_writer.lock().unwrap() = Some(rest.trim().to_string());
            }
        }
    });

    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[bftorch] {}", line);
        }
    });

    let child_handle = Arc::new(Mutex::new(Some(child)));
    let child_for_close = child_handle.clone();
    let url_for_setup = url_holder.clone();

    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let icon: Option<tauri::image::Image<'static>> =
                app.default_window_icon().map(|i| i.clone().to_owned());
            let url_holder = url_for_setup.clone();
            thread::spawn(move || {
                // Wait until program.py prints the URL.
                let url = loop {
                    if let Some(u) = url_holder.lock().unwrap().clone() {
                        break u;
                    }
                    thread::sleep(Duration::from_millis(150));
                };

                let parsed: tauri::Url = match url.parse() {
                    Ok(u) => u,
                    Err(e) => {
                        eprintln!("[bftorch-app] bad url {}: {}", url, e);
                        return;
                    }
                };
                let host = parsed.host_str().unwrap_or("127.0.0.1").to_string();
                let port = parsed.port().unwrap_or(80);

                // Wait for uvicorn to start accepting connections. torch can
                // take a while to import on first launch, so be patient.
                let deadline = Instant::now() + Duration::from_secs(900);
                while Instant::now() < deadline {
                    if port_open(&host, port) {
                        break;
                    }
                    thread::sleep(Duration::from_millis(400));
                }
                // Small grace period for the app to finish bootstrapping.
                thread::sleep(Duration::from_millis(500));

                let app_handle_for_main = app_handle.clone();
                let icon_for_main = icon.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    let mut builder = WebviewWindowBuilder::new(
                        &app_handle_for_main,
                        "main",
                        WebviewUrl::External(parsed),
                    )
                    .title("PyTorch Sandbox")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(720.0, 520.0)
                    .resizable(true);
                    if let Some(ic) = icon_for_main {
                        builder = builder
                            .icon(ic)
                            .expect("icon set on already-decoded image");
                    }
                    if let Err(e) = builder.build() {
                        eprintln!("[bftorch-app] window build failed: {}", e);
                    }
                });
            });
            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(mut c) = child_for_close.lock().unwrap().take() {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("tauri app run failed");

    // Belt-and-suspenders: if the event loop exits, make sure bftorch is gone.
    let leftover = child_handle.lock().unwrap().take();
    if let Some(mut c) = leftover {
        let _ = c.kill();
    }
}
