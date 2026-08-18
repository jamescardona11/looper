use std::ffi::c_void;
use std::os::windows::io::AsRawHandle;
use std::path::PathBuf;
use std::sync::OnceLock;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HANDLE, HMODULE};
use windows::Win32::System::Diagnostics::Debug as debug_api;
use windows::Win32::System::LibraryLoader as loader_api;
use windows::Win32::System::Threading as process_api;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const CONTINUE_EXCEPTION_SEARCH: i32 = 0;
const MINIDUMP_NAME: &str = "crash.dmp";

type Filter = unsafe extern "system" fn(*const debug_api::EXCEPTION_POINTERS) -> i32;

struct CrashOutput {
    directory: PathBuf,
    marker: PathBuf,
}

impl CrashOutput {
    fn new(directory: PathBuf, marker: PathBuf) -> Self {
        Self { directory, marker }
    }

    fn minidump_path(&self) -> PathBuf {
        self.directory.join(MINIDUMP_NAME)
    }

    fn save_marker(&self, marker: &NativeMarker<'_>) {
        let _ = std::fs::write(&self.marker, marker.render());
    }

    unsafe fn capture_minidump(&self, exception: *const debug_api::EXCEPTION_POINTERS) -> bool {
        let Ok(destination) = std::fs::File::create(self.minidump_path()) else {
            return false;
        };
        let exception_details = debug_api::MINIDUMP_EXCEPTION_INFORMATION {
            ThreadId: process_api::GetCurrentThreadId(),
            ExceptionPointers: exception.cast_mut(),
            ClientPointers: false.into(),
        };
        let dump_kind = debug_api::MINIDUMP_TYPE(debug_api::MiniDumpWithThreadInfo.0);
        let destination = HANDLE(destination.as_raw_handle().cast());

        debug_api::MiniDumpWriteDump(
            process_api::GetCurrentProcess(),
            process_api::GetCurrentProcessId(),
            destination,
            dump_kind,
            Some(std::ptr::addr_of!(exception_details)),
            None,
            None,
        )
        .is_ok()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FaultSite {
    module: String,
    location: String,
}

impl FaultSite {
    fn unknown() -> Self {
        Self {
            module: "unknown".to_owned(),
            location: "unknown".to_owned(),
        }
    }

    fn in_module(module: String, module_base: usize, address: usize) -> Self {
        let relative_address = address.saturating_sub(module_base);
        let location = format!("{module}+{relative_address:#x}");
        Self { module, location }
    }

    unsafe fn resolve(address: *mut c_void) -> Self {
        LoadedModule::for_address(address)
            .map(|module| Self::in_module(module.name, module.base, address as usize))
            .unwrap_or_else(Self::unknown)
    }
}

struct LoadedModule {
    name: String,
    base: usize,
}

impl LoadedModule {
    unsafe fn for_address(address: *mut c_void) -> Option<Self> {
        if address.is_null() {
            return None;
        }

        let mut handle = HMODULE::default();
        let lookup_flags = loader_api::GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
            | loader_api::GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
        loader_api::GetModuleHandleExW(lookup_flags, PCWSTR(address.cast::<u16>()), &mut handle)
            .ok()?;

        let mut path_buffer = [0_u16; 260];
        let length = loader_api::GetModuleFileNameW(Some(handle), &mut path_buffer);
        if length == 0 {
            return None;
        }
        let full_path = String::from_utf16_lossy(&path_buffer[..length as usize]);
        Some(Self {
            name: file_name(&full_path).to_owned(),
            base: handle.0 as usize,
        })
    }
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

struct NativeFault {
    code: u32,
    address: *mut c_void,
}

impl NativeFault {
    unsafe fn read(exception: *const debug_api::EXCEPTION_POINTERS) -> Option<Self> {
        let pointers = exception.as_ref()?;
        let record = pointers.ExceptionRecord.as_ref();
        Some(match record {
            Some(record) => Self {
                code: record.ExceptionCode.0 as u32,
                address: record.ExceptionAddress,
            },
            None => Self {
                code: 0,
                address: std::ptr::null_mut(),
            },
        })
    }
}

struct NativeMarker<'a> {
    fault: &'a NativeFault,
    site: &'a FaultSite,
    dump_created: bool,
    phase: &'a str,
}

impl NativeMarker<'_> {
    fn render(&self) -> String {
        let dump = if self.dump_created {
            MINIDUMP_NAME
        } else {
            "none"
        };
        format!(
            "{VERSION}\n{}\nnative\nexception_code={:#010x}\nfaulting_module={}\nminidump={dump}\ncrash_phase={}\n",
            self.site.location, self.fault.code, self.site.module, self.phase,
        )
    }
}

static OUTPUT: OnceLock<CrashOutput> = OnceLock::new();
static REPLACED_FILTER: OnceLock<Option<Filter>> = OnceLock::new();

pub fn install(log_dir: PathBuf, marker: PathBuf) {
    if OUTPUT.set(CrashOutput::new(log_dir, marker)).is_err() {
        return;
    }
    let previous = unsafe { debug_api::SetUnhandledExceptionFilter(Some(handle_exception)) };
    let _ = REPLACED_FILTER.set(previous);
}

unsafe extern "system" fn handle_exception(exception: *const debug_api::EXCEPTION_POINTERS) -> i32 {
    let Some(output) = OUTPUT.get() else {
        return CONTINUE_EXCEPTION_SEARCH;
    };
    if exception.is_null() {
        return CONTINUE_EXCEPTION_SEARCH;
    }

    let dump_created = output.capture_minidump(exception);
    let Some(fault) = NativeFault::read(exception) else {
        return CONTINUE_EXCEPTION_SEARCH;
    };
    let site = FaultSite::resolve(fault.address);
    output.save_marker(&NativeMarker {
        fault: &fault,
        site: &site,
        dump_created,
        phase: crate::analytics::crash_phase(),
    });

    chain_to_replaced_filter(exception)
}

unsafe fn chain_to_replaced_filter(exception: *const debug_api::EXCEPTION_POINTERS) -> i32 {
    REPLACED_FILTER
        .get()
        .copied()
        .flatten()
        .map_or(CONTINUE_EXCEPTION_SEARCH, |filter| filter(exception))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fault(code: u32) -> NativeFault {
        NativeFault {
            code,
            address: std::ptr::null_mut(),
        }
    }

    #[test]
    fn marker_wire_format_preserves_order_padding_and_terminal_newline() {
        let fault = fault(0xc0000005);
        let site = FaultSite::in_module("nvcuda.dll".to_owned(), 0x1000, 0x2234);
        let marker = NativeMarker {
            fault: &fault,
            site: &site,
            dump_created: true,
            phase: "model_load",
        };

        assert_eq!(
            marker.render(),
            concat!(
                env!("CARGO_PKG_VERSION"),
                "\nnvcuda.dll+0x1234\nnative\n",
                "exception_code=0xc0000005\n",
                "faulting_module=nvcuda.dll\n",
                "minidump=crash.dmp\n",
                "crash_phase=model_load\n"
            )
        );
    }

    #[test]
    fn failed_dump_is_explicit_in_the_marker() {
        let fault = fault(0);
        let site = FaultSite::unknown();
        let marker = NativeMarker {
            fault: &fault,
            site: &site,
            dump_created: false,
            phase: "setup",
        }
        .render();
        assert!(marker.contains("\nunknown\nnative\nexception_code=0x00000000\n"));
        assert!(marker.contains("\nfaulting_module=unknown\nminidump=none\n"));
    }

    #[test]
    fn module_location_uses_saturating_aslr_independent_offset() {
        assert_eq!(
            FaultSite::in_module("player.exe".to_owned(), 0x4000, 0x412a).location,
            "player.exe+0x12a"
        );
        assert_eq!(
            FaultSite::in_module("player.exe".to_owned(), 0x4000, 0x20).location,
            "player.exe+0x0"
        );
    }

    #[test]
    fn module_file_name_accepts_windows_and_forward_separators() {
        assert_eq!(
            file_name(r"C:\Program Files\Looper\looper.exe"),
            "looper.exe"
        );
        assert_eq!(file_name("C:/Program Files/Looper/codec.dll"), "codec.dll");
        assert_eq!(file_name("standalone.dll"), "standalone.dll");
    }

    #[test]
    fn null_exception_pointer_is_rejected_without_dereferencing() {
        assert!(unsafe { NativeFault::read(std::ptr::null()) }.is_none());
    }

    #[test]
    fn minidump_path_keeps_the_existing_file_name_contract() {
        let output = CrashOutput::new(PathBuf::from(r"C:\Logs"), PathBuf::from("marker"));
        assert_eq!(
            output.minidump_path(),
            std::path::Path::new(r"C:\Logs").join("crash.dmp")
        );
    }
}
