fn main() {
    let compile_time_keys = compile_time_keys();
    let mut forwarded = std::collections::HashSet::new();
    forward_workspace_env(compile_time_keys, &mut forwarded);
    forward_process_env(compile_time_keys, &forwarded);

    tauri_build::build()
}

fn compile_time_keys() -> &'static [&'static str] {
    &[
        "POSTHOG_API_KEY",
        "POSTHOG_HOST",
        "LOOPER_FORCE_LICENSE_GATE",
        "LOOPER_MODEL_MIRROR_BASE_URL",
        "LOOPER_POLAR_API_BASE",
        "LOOPER_POLAR_BENEFIT_COMMERCIAL",
        "LOOPER_POLAR_BENEFIT_CONTRIBUTOR",
        "LOOPER_POLAR_BENEFIT_FOUNDER",
        "LOOPER_POLAR_BENEFIT_PERSONAL",
        "LOOPER_POLAR_ORGANIZATION_ID",
    ]
}

fn forward_workspace_env(keys: &[&str], forwarded: &mut std::collections::HashSet<String>) {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    let Ok(contents) = std::fs::read_to_string(path) else {
        println!("cargo:rerun-if-changed=../.env");
        return;
    };

    for line in contents.lines().map(str::trim) {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if !key.is_empty() && !value.is_empty() && keys.contains(&key) {
            println!("cargo:rustc-env={key}={value}");
            forwarded.insert(key.to_owned());
        }
    }
    println!("cargo:rerun-if-changed=../.env");
}

fn forward_process_env(keys: &[&str], forwarded: &std::collections::HashSet<String>) {
    for key in keys.iter().filter(|key| !forwarded.contains(**key)) {
        let Some(value) = std::env::var(key).ok().map(|value| value.trim().to_owned()) else {
            continue;
        };
        if !value.is_empty() {
            println!("cargo:rustc-env={key}={value}");
        }
    }
}
