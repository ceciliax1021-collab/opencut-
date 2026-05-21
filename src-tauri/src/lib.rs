mod commands;
mod migrate;
mod models;
mod storage;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use commands::AppState;
use storage::Storage;

static SUPPRESS_BLUR_HIDE: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");

            let clips_dir = data_dir.join("clips");
            migrate::migrate_legacy_data(&data_dir, &clips_dir);

            let state = Arc::new(AppState {
                storage: Storage::new(clips_dir),
                skip_clipboard_watch: AtomicBool::new(false),
                last_clipboard_hash: Mutex::new(None),
            });

            app.manage(state.clone());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
                attach_window_behaviors(window);
            }

            build_tray(app)?;

            commands::start_clipboard_watcher(app.handle().clone(), state);

            app.global_shortcut()
                .register(global_shortcut())
                .expect("failed to register global shortcut");

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_images,
            commands::upload_image,
            commands::delete_image,
            commands::rename_image,
            commands::move_images,
            commands::create_group,
            commands::rename_group,
            commands::delete_group,
            commands::get_texts,
            commands::save_text,
            commands::toggle_pin_text,
            commands::delete_text,
            commands::update_text,
            commands::clear_unpinned_texts,
            commands::copy_image_to_clipboard,
            commands::copy_text_to_clipboard,
            commands::open_local_image,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
        });
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "打开 OpenCut", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 OpenCut", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate.png"))
        .expect("failed to load tray icon");

    #[cfg(target_os = "macos")]
    {
        TrayIconBuilder::new()
            .icon(tray_icon)
            .icon_as_template(true)
            .menu(&tray_menu)
            .show_menu_on_left_click(false)
            .tooltip("OpenCut")
            .on_menu_event(|app, event| match event.id.as_ref() {
                "show" => show_main_window(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    toggle_main_window(tray.app_handle());
                }
            })
            .build(app)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        TrayIconBuilder::new()
            .icon(tray_icon)
            .menu(&tray_menu)
            .show_menu_on_left_click(false)
            .tooltip("OpenCut")
            .on_menu_event(|app, event| match event.id.as_ref() {
                "show" => show_main_window(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    toggle_main_window(tray.app_handle());
                }
            })
            .build(app)?;
    }

    Ok(())
}

fn global_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    {
        return Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV)
    }
}

fn attach_window_behaviors(window: WebviewWindow) {
    let window_for_event = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            if SUPPRESS_BLUR_HIDE.load(Ordering::SeqCst) {
                return;
            }
            let _ = window_for_event.hide();
        }
    });
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
        show_main_window(app);
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        SUPPRESS_BLUR_HIDE.store(true, Ordering::SeqCst);
        position_panel(&window);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();

        let window_clone = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            SUPPRESS_BLUR_HIDE.store(false, Ordering::SeqCst);
            let _ = window_clone.set_focus();
        });
    }
}

fn position_panel(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen = monitor.size();
        let scale = monitor.scale_factor();
        let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(1280, 820));

        let screen_width = screen.width as f64 / scale;
        let screen_height = screen.height as f64 / scale;
        let win_width = window_size.width as f64 / scale;

        let x = (screen_width - win_width) / 2.0;

        #[cfg(target_os = "macos")]
        let y = 28.0;

        #[cfg(not(target_os = "macos"))]
        let y = {
            let win_height = window_size.height as f64 / scale;
            ((screen_height - win_height) / 2.0).max(40.0)
        };

        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    }
}
