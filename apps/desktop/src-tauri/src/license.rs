//! Trial and paid-entitlement policy for the desktop application.
//!
//! Polar remains authoritative for paid grants. Locally persisted grants are
//! encrypted and usable only inside a bounded last-known-good window.

use chrono::{DateTime, Duration, Utc};
use parking_lot::Mutex;
use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::{settings::SettingsStore, tray, AppRuntime, EVENT_LICENSE_CHECKOUT_RETURNED};

const TRIAL_LENGTH: Duration = Duration::days(14);
const OFFLINE_TRUST: Duration = Duration::days(7);
const REFRESH_INTERVAL: Duration = Duration::hours(24);
const CLOCK_TOLERANCE: Duration = Duration::minutes(10);
const GATE_MEMO_TTL: Duration = Duration::seconds(60);
const TRIAL_SEAL_CONTEXT: &str = "looper_trial_v1";
const POLAR_DEFAULT_BASE: &str = "https://api.polar.sh";
const POLAR_DEFAULT_ORGANIZATION: &str = "98d75121-191c-4136-aa56-2c7803173973";
const GRANTED: &str = "granted";
const INVALID: &str = "invalid";
// Mientras Looper está en acceso gratuito, ninguna capacidad de producto
// depende de una prueba ni de una licencia almacenada. Conservamos el
// subsistema para cuando cambie la política, pero la decisión vive aquí para
// que todos los comandos tengan el mismo comportamiento.
const PRODUCT_ACCESS_IS_FREE: bool = true;

struct StorageKey;

impl StorageKey {
    const LICENSE: &'static str = "license_key";
    const ACTIVATION: &'static str = "license_activation_id";
    const GRANT: &'static str = "license_grant";
    const LEGACY_TRIAL_START: &'static str = "license_trial_started_at";
    const TRIAL: &'static str = "license_trial_record";
    const INSTALL: &'static str = "analytics_install_id";
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub status: LicenseStatus,
    pub license_gate_active: bool,
    pub trial_active: bool,
    pub trial_started_at: String,
    pub trial_ends_at: String,
    pub trial_days_remaining: i64,
    pub display_key: Option<String>,
    pub customer_email: Option<String>,
    pub customer_name: Option<String>,
    pub last_validated_at: Option<String>,
    pub activated_at: Option<String>,
    pub purchased_at: Option<String>,
    pub expires_at: Option<String>,
    pub validations: Option<u32>,
    pub usage: Option<u32>,
    pub limit_usage: Option<u32>,
    pub activations_limit: u32,
    pub activations_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edition: Option<LicenseEdition>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseEdition {
    Personal,
    Commercial,
    Founder,
    Contributor,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseStatus {
    Trial,
    Active,
    Expired,
    Invalid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseArgs {
    pub key: String,
}

#[derive(Debug, Deserialize)]
struct PolarLicenseResponse {
    organization_id: Option<String>,
    benefit_id: Option<String>,
    status: String,
    display_key: Option<String>,
    customer: Option<PolarCustomer>,
    activation: Option<PolarActivation>,
    expires_at: Option<String>,
    validations: Option<u32>,
    usage: Option<u32>,
    limit_usage: Option<u32>,
    limit_activations: Option<u32>,
    created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PolarActivationResponse {
    id: String,
    license_key: PolarLicenseResponse,
}

#[derive(Debug, Deserialize)]
struct PolarActivation {
    id: String,
}

#[derive(Debug, Deserialize)]
struct PolarCustomer {
    email: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
struct CachedGrant {
    status: String,
    last_validated_at: String,
    #[serde(default)]
    activated_at: Option<String>,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    purchased_at: Option<String>,
    #[serde(default)]
    benefit_id: Option<String>,
    #[serde(default)]
    display_key: Option<String>,
    #[serde(default)]
    customer_email: Option<String>,
    #[serde(default)]
    customer_name: Option<String>,
    #[serde(default)]
    validations: Option<u32>,
    #[serde(default)]
    usage: Option<u32>,
    #[serde(default)]
    limit_usage: Option<u32>,
    #[serde(default)]
    limit_activations: Option<u32>,
}

impl CachedGrant {
    fn from_polar(
        response: &PolarLicenseResponse,
        prior: Option<Self>,
        now: DateTime<Utc>,
    ) -> Self {
        let customer = response.customer.as_ref();
        Self {
            status: response.status.clone(),
            last_validated_at: now.to_rfc3339(),
            activated_at: prior
                .and_then(|grant| grant.activated_at)
                .or_else(|| Some(now.to_rfc3339())),
            expires_at: response.expires_at.clone(),
            purchased_at: response.created_at.clone(),
            benefit_id: response.benefit_id.clone(),
            display_key: response.display_key.clone(),
            customer_email: customer.and_then(|value| value.email.clone()),
            customer_name: customer.and_then(|value| value.name.clone()),
            validations: response.validations,
            usage: response.usage,
            limit_usage: response.limit_usage,
            limit_activations: response.limit_activations,
        }
    }

    fn active_at(&self, now: DateTime<Utc>, benefits: &BenefitCatalog) -> bool {
        self.status == GRANTED
            && benefits.allows(self.benefit_id.as_deref())
            && CacheWindow::new(now).trusts(&self.last_validated_at, self.expires_at.as_deref())
    }

    fn refresh_due_at(&self, now: DateTime<Utc>) -> bool {
        CacheWindow::new(now).refresh_due(&self.last_validated_at)
    }
}

#[derive(Debug, Serialize)]
struct ActivationRequest<'a> {
    key: &'a str,
    organization_id: &'a str,
    label: &'a str,
    conditions: DeviceConditions<'a>,
}

#[derive(Debug, Serialize)]
struct ValidationRequest<'a> {
    key: &'a str,
    organization_id: &'a str,
    activation_id: Option<&'a str>,
    benefit_id: Option<&'a str>,
    conditions: DeviceConditions<'a>,
}

#[derive(Debug, Serialize)]
struct DeactivationRequest<'a> {
    key: &'a str,
    organization_id: &'a str,
    activation_id: &'a str,
}

#[derive(Debug, Serialize)]
struct DeviceConditions<'a> {
    os: &'a str,
}

#[derive(Clone, Copy)]
struct GateMemo {
    active: bool,
    valid_until: DateTime<Utc>,
}

static GATE_MEMO: Mutex<Option<GateMemo>> = Mutex::new(None);

pub fn license_gate_active(store: &SettingsStore) -> bool {
    if PRODUCT_ACCESS_IS_FREE {
        return true;
    }
    if development_bypass() {
        return true;
    }
    let now = Utc::now();
    if let Some(memo) = *GATE_MEMO.lock() {
        if now < memo.valid_until {
            return memo.active;
        }
    }
    let active = get_license_state(store)
        .map(|state| state.license_gate_active)
        .unwrap_or(false);
    *GATE_MEMO.lock() = Some(GateMemo {
        active,
        valid_until: now + GATE_MEMO_TTL,
    });
    active
}

pub(crate) fn secure_grant_refresh_needed(store: &SettingsStore) -> Result<bool, String> {
    let storage = LicenseStorage::new(store);
    if storage.credential_state()? != CredentialState::Readable {
        return Ok(false);
    }
    Ok(storage
        .read_grant()?
        .map(|grant| grant.refresh_due_at(Utc::now()))
        .unwrap_or(true))
}

fn clear_gate_memo() {
    *GATE_MEMO.lock() = None;
}

fn development_bypass() -> bool {
    cfg!(debug_assertions) && option_env!("LOOPER_FORCE_LICENSE_GATE") != Some("1")
}

pub fn is_license_deep_link(raw_url: &str) -> bool {
    LicenseLink::parse(raw_url).is_some()
}

struct LicenseLink;

impl LicenseLink {
    fn parse(raw: &str) -> Option<Self> {
        let url = reqwest::Url::parse(raw).ok()?;
        if url.scheme() != "looper" {
            return None;
        }
        let by_host = url.host_str().unwrap_or_default() == "license";
        let by_path = url.path().trim_start_matches('/').starts_with("license");
        (by_host || by_path).then_some(Self)
    }
}

pub fn handle_deep_link(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    tray::toggle_settings_window(app)
        .map_err(|error| format!("Failed to open settings for license deep link: {error}"))?;
    app.emit(EVENT_LICENSE_CHECKOUT_RETURNED, ())
        .map_err(|error| format!("Failed to emit license deep link event: {error}"))
}

pub fn require_license_gate(store: &SettingsStore, feature: &str) -> Result<(), String> {
    gate_result(
        license_gate_active(store),
        format!("A Looper license is required for {feature}."),
    )
}

pub(crate) fn active_license_gate(store: &SettingsStore) -> bool {
    if PRODUCT_ACCESS_IS_FREE {
        return true;
    }
    development_bypass()
        || LicenseStorage::new(store)
            .paid_grant_active(Utc::now())
            .unwrap_or(false)
}

pub(crate) fn require_active_license(store: &SettingsStore, feature: &str) -> Result<(), String> {
    gate_result(
        active_license_gate(store),
        format!("An active Looper license is required for {feature}."),
    )
}

fn gate_result(active: bool, error: String) -> Result<(), String> {
    active.then_some(()).ok_or(error)
}

pub fn get_license_state(store: &SettingsStore) -> Result<LicenseState, String> {
    let storage = LicenseStorage::new(store);
    let trial_started_at = storage.load_trial_start()?;
    let now = Utc::now();
    let credential = storage.credential_state()?;
    let grant = storage.read_grant()?;
    Ok(LicenseSnapshot {
        now,
        trial_started_at,
        credential,
        grant,
        development_bypass: development_bypass(),
        benefits: BenefitCatalog::configured(),
    }
    .render())
}

struct LicenseSnapshot {
    now: DateTime<Utc>,
    trial_started_at: DateTime<Utc>,
    credential: CredentialState,
    grant: Option<CachedGrant>,
    development_bypass: bool,
    benefits: BenefitCatalog,
}

impl LicenseSnapshot {
    fn render(self) -> LicenseState {
        let trial_ends_at = self.trial_started_at + TRIAL_LENGTH;
        let trial_active = self.now < trial_ends_at;
        let paid_active = self.credential == CredentialState::Readable
            && self
                .grant
                .as_ref()
                .is_some_and(|grant| grant.active_at(self.now, &self.benefits));
        let status = self.status(paid_active, trial_active);
        let edition = paid_active.then(|| {
            self.benefits.resolve(
                self.grant
                    .as_ref()
                    .and_then(|grant| grant.benefit_id.as_deref()),
            )
        });
        let remaining = ((trial_ends_at - self.now).num_seconds() as f64 / 86_400.0).ceil() as i64;
        let grant = self.grant.as_ref();
        LicenseState {
            status,
            license_gate_active: PRODUCT_ACCESS_IS_FREE
                || paid_active
                || trial_active
                || self.development_bypass,
            trial_active,
            trial_started_at: self.trial_started_at.to_rfc3339(),
            trial_ends_at: trial_ends_at.to_rfc3339(),
            trial_days_remaining: remaining.max(0),
            display_key: grant.and_then(|value| value.display_key.clone()),
            customer_email: grant.and_then(|value| value.customer_email.clone()),
            customer_name: grant.and_then(|value| value.customer_name.clone()),
            last_validated_at: grant.map(|value| value.last_validated_at.clone()),
            activated_at: grant.and_then(|value| value.activated_at.clone()),
            purchased_at: grant.and_then(|value| value.purchased_at.clone()),
            expires_at: grant.and_then(|value| value.expires_at.clone()),
            validations: grant.and_then(|value| value.validations),
            usage: grant.and_then(|value| value.usage),
            limit_usage: grant.and_then(|value| value.limit_usage),
            activations_limit: grant.and_then(|value| value.limit_activations).unwrap_or(5),
            activations_count: None,
            edition,
        }
    }

    fn status(&self, paid_active: bool, trial_active: bool) -> LicenseStatus {
        if paid_active {
            LicenseStatus::Active
        } else if self
            .grant
            .as_ref()
            .is_some_and(|grant| grant.status == GRANTED)
        {
            LicenseStatus::Expired
        } else if self.grant.is_some() {
            LicenseStatus::Invalid
        } else if trial_active {
            LicenseStatus::Trial
        } else {
            LicenseStatus::Expired
        }
    }
}

pub async fn activate_license(
    client: Client,
    store: &SettingsStore,
    args: ActivateLicenseArgs,
) -> Result<LicenseState, String> {
    let key = normalized_key(&args.key)?;
    let organization = polar_organization();
    let request = ActivationRequest {
        key: &key,
        organization_id: organization,
        label: platform_activation_label(),
        conditions: device_conditions(),
    };
    let response = PolarTransport::new(&client)
        .post("activate", &request)
        .await?;
    if !response.status().is_success() {
        return Err(PolarFailure::from_http(response.status())
            .message()
            .to_owned());
    }
    let activation = response
        .json::<PolarActivationResponse>()
        .await
        .map_err(|error| format!("Polar returned an unreadable license response: {error}"))?;
    validate_polar_license(&activation.license_key, None)?;

    let storage = LicenseStorage::new(store);
    storage.write_key(Some(&key))?;
    storage.write_plain(StorageKey::ACTIVATION, &activation.id)?;
    storage.cache_polar(&activation.license_key, Utc::now())?;
    clear_gate_memo();
    get_license_state(store)
}

pub async fn refresh_license(
    client: Client,
    store: &SettingsStore,
) -> Result<LicenseState, String> {
    let storage = LicenseStorage::new(store);
    let Some(key) = storage.read_key()? else {
        return get_license_state(store);
    };
    let activation = storage.read_plain(StorageKey::ACTIVATION)?;
    let benefits = BenefitCatalog::configured();
    let only_benefit = benefits.single_id();
    let request = ValidationRequest {
        key: &key,
        organization_id: polar_organization(),
        activation_id: activation.as_deref(),
        benefit_id: only_benefit.as_deref(),
        conditions: device_conditions(),
    };
    let response = PolarTransport::new(&client)
        .post("validate", &request)
        .await?;
    if !response.status().is_success() {
        let failure = PolarFailure::from_http(response.status());
        if failure.revokes_cache() {
            storage.revoke_grant(Utc::now())?;
        }
        return Err(failure.message().to_owned());
    }
    let validated = response
        .json::<PolarLicenseResponse>()
        .await
        .map_err(|error| format!("Polar returned an unreadable license response: {error}"))?;
    if let Err(error) = validate_polar_license(&validated, activation.as_deref()) {
        storage.revoke_grant(Utc::now())?;
        return Err(error);
    }
    if let Some(confirmed) = &validated.activation {
        storage.write_plain(StorageKey::ACTIVATION, &confirmed.id)?;
    }
    storage.write_key(Some(&key))?;
    storage.cache_polar(&validated, Utc::now())?;
    clear_gate_memo();
    get_license_state(store)
}

pub async fn deactivate_license(
    client: Client,
    store: &SettingsStore,
) -> Result<LicenseState, String> {
    let storage = LicenseStorage::new(store);
    let key = match storage.read_key() {
        Ok(value) => value,
        Err(error) => {
            tracing::error!(
                "Clearing local license after decryption failure during deactivate: {error}"
            );
            storage.clear_paid_state()?;
            clear_gate_memo();
            return get_license_state(store);
        }
    };
    let activation = storage.read_plain(StorageKey::ACTIVATION)?;
    if let (Some(key), Some(activation)) = (key.as_deref(), activation.as_deref()) {
        let request = DeactivationRequest {
            key,
            organization_id: polar_organization(),
            activation_id: activation,
        };
        let response = PolarTransport::new(&client)
            .post("deactivate", &request)
            .await?;
        if response.status().is_server_error() {
            return Err(PolarFailure::from_http(response.status())
                .message()
                .to_owned());
        }
    }
    storage.clear_paid_state()?;
    clear_gate_memo();
    get_license_state(store)
}

struct PolarTransport<'a> {
    client: &'a Client,
}

impl<'a> PolarTransport<'a> {
    fn new(client: &'a Client) -> Self {
        Self { client }
    }

    async fn post<T: Serialize + ?Sized>(
        &self,
        operation: &str,
        body: &T,
    ) -> Result<Response, String> {
        self.client
            .post(format!(
                "{}/v1/customer-portal/license-keys/{operation}",
                polar_api_base()
            ))
            .json(body)
            .send()
            .await
            .map_err(|error| format!("Could not reach Polar: {error}"))
    }
}

enum PolarFailure {
    DeviceLimit,
    Missing,
    InvalidForApp,
    Other,
}

impl PolarFailure {
    fn from_http(status: StatusCode) -> Self {
        match status.as_u16() {
            403 => Self::DeviceLimit,
            404 => Self::Missing,
            422 => Self::InvalidForApp,
            _ => Self::Other,
        }
    }

    fn message(&self) -> &'static str {
        match self {
            Self::DeviceLimit => "This activation code has reached its device limit.",
            Self::Missing => "That activation code was not found.",
            Self::InvalidForApp => "That activation code is not valid for this app.",
            Self::Other => "Polar could not validate that activation code.",
        }
    }

    fn revokes_cache(&self) -> bool {
        matches!(
            self,
            Self::DeviceLimit | Self::Missing | Self::InvalidForApp
        )
    }
}

fn validate_polar_license(
    response: &PolarLicenseResponse,
    expected_activation: Option<&str>,
) -> Result<(), String> {
    PolarGrantPolicy {
        now: Utc::now(),
        organization: polar_organization(),
        benefits: BenefitCatalog::configured(),
        expected_activation,
    }
    .validate(response)
}

struct PolarGrantPolicy<'a> {
    now: DateTime<Utc>,
    organization: &'a str,
    benefits: BenefitCatalog,
    expected_activation: Option<&'a str>,
}

impl PolarGrantPolicy<'_> {
    fn validate(&self, response: &PolarLicenseResponse) -> Result<(), String> {
        if response
            .organization_id
            .as_deref()
            .is_some_and(|value| value != self.organization)
        {
            return Err("Polar returned a license for a different organization.".to_owned());
        }
        if response.status != GRANTED {
            return Err(status_failure_message(&response.status).to_owned());
        }
        if !self.benefits.allows(response.benefit_id.as_deref()) {
            return Err("That activation code is not valid for this Looper edition.".to_owned());
        }
        if let Some(expected) = self.expected_activation {
            match response.activation.as_ref() {
                Some(actual) if actual.id == expected => {}
                Some(_) => {
                    return Err(
                        "Polar returned a license for a different device activation.".to_owned(),
                    )
                }
                None => return Err("Polar did not confirm this device activation.".to_owned()),
            }
        }
        if !expiration_valid(self.now, response.expires_at.as_deref()) {
            return Err("That activation code is expired.".to_owned());
        }
        if response
            .limit_usage
            .is_some_and(|limit| response.usage.unwrap_or_default() > limit)
        {
            return Err("That activation code has reached its usage limit.".to_owned());
        }
        Ok(())
    }
}

fn expiration_valid(now: DateTime<Utc>, expires_at: Option<&str>) -> bool {
    let Some(raw) = expires_at else {
        return true;
    };
    DateTime::parse_from_rfc3339(raw)
        .map(|expiration| now < expiration.with_timezone(&Utc))
        .unwrap_or(false)
}

#[derive(Debug, PartialEq, Eq)]
enum CredentialState {
    Missing,
    Readable,
    Unreadable,
}

struct LicenseStorage<'a> {
    store: &'a SettingsStore,
}

impl<'a> LicenseStorage<'a> {
    fn new(store: &'a SettingsStore) -> Self {
        Self { store }
    }

    fn read_plain(&self, key: &str) -> Result<Option<String>, String> {
        self.store
            .read_app_value::<String>(key, String::new())
            .map(|raw| {
                let value = raw.trim().to_owned();
                (!value.is_empty()).then_some(value)
            })
            .map_err(|error| error.to_string())
    }

    fn write_plain(&self, key: &str, value: &str) -> Result<(), String> {
        self.store
            .write_app_value(key, &value.to_owned())
            .map_err(|error| error.to_string())
    }

    fn credential_state(&self) -> Result<CredentialState, String> {
        let Some(ciphertext) = self.read_plain(StorageKey::LICENSE)? else {
            return Ok(CredentialState::Missing);
        };
        if !crate::crypto::looks_encrypted(&ciphertext) {
            return Ok(CredentialState::Unreadable);
        }
        let Some(device_key) = crate::crypto::get_hardware_uuid() else {
            return Ok(CredentialState::Unreadable);
        };
        Ok(
            if crate::crypto::decrypt(&ciphertext, &device_key).is_ok() {
                CredentialState::Readable
            } else {
                CredentialState::Unreadable
            },
        )
    }

    fn read_key(&self) -> Result<Option<String>, String> {
        let Some(ciphertext) = self.read_plain(StorageKey::LICENSE)? else {
            return Ok(None);
        };
        if !crate::crypto::looks_encrypted(&ciphertext) {
            return Err(
                "Stored license credential is not secure. Activate the license again.".to_owned(),
            );
        }
        let Some(device_key) = crate::crypto::get_hardware_uuid() else {
            return Err("Could not decrypt license key on this device.".to_owned());
        };
        crate::crypto::decrypt(&ciphertext, &device_key)
            .map(Some)
            .map_err(|error| format!("Failed to decrypt license key: {error}"))
    }

    fn write_key(&self, key: Option<&str>) -> Result<(), String> {
        let Some(key) = key.filter(|value| !value.trim().is_empty()) else {
            return self.write_plain(StorageKey::LICENSE, "");
        };
        let Some(device_key) = crate::crypto::get_hardware_uuid() else {
            return Err("Could not securely store the license key on this device.".to_owned());
        };
        let encrypted = crate::crypto::encrypt(key, &device_key)
            .map_err(|error| format!("Failed to encrypt license key: {error}"))?;
        self.write_plain(StorageKey::LICENSE, &encrypted)
    }

    fn read_grant(&self) -> Result<Option<CachedGrant>, String> {
        let Some(ciphertext) = self.read_plain(StorageKey::GRANT)? else {
            return Ok(None);
        };
        if !crate::crypto::looks_encrypted(&ciphertext) {
            return Ok(None);
        }
        let Some(device_key) = crate::crypto::get_hardware_uuid() else {
            return Ok(None);
        };
        let Ok(serialized) = crate::crypto::decrypt(&ciphertext, &device_key) else {
            return Ok(None);
        };
        Ok(serde_json::from_str(&serialized).ok())
    }

    fn write_grant(&self, grant: &CachedGrant) -> Result<(), String> {
        let Some(device_key) = crate::crypto::get_hardware_uuid() else {
            return Err("Could not securely store the license grant on this device.".to_owned());
        };
        let serialized = serde_json::to_string(grant)
            .map_err(|error| format!("Failed to serialize license grant: {error}"))?;
        let encrypted = crate::crypto::encrypt(&serialized, &device_key)
            .map_err(|error| format!("Failed to encrypt license grant: {error}"))?;
        self.write_plain(StorageKey::GRANT, &encrypted)
    }

    fn cache_polar(
        &self,
        response: &PolarLicenseResponse,
        now: DateTime<Utc>,
    ) -> Result<(), String> {
        let prior = self.read_grant()?;
        self.write_grant(&CachedGrant::from_polar(response, prior, now))
    }

    fn revoke_grant(&self, now: DateTime<Utc>) -> Result<(), String> {
        let mut grant = self.read_grant()?.unwrap_or_default();
        grant.status = INVALID.to_owned();
        grant.last_validated_at = now.to_rfc3339();
        self.write_grant(&grant)?;
        clear_gate_memo();
        Ok(())
    }

    fn paid_grant_active(&self, now: DateTime<Utc>) -> Result<bool, String> {
        if self.credential_state()? != CredentialState::Readable {
            return Ok(false);
        }
        let benefits = BenefitCatalog::configured();
        Ok(self
            .read_grant()?
            .as_ref()
            .is_some_and(|grant| grant.active_at(now, &benefits)))
    }

    fn clear_paid_state(&self) -> Result<(), String> {
        for key in [
            StorageKey::LICENSE,
            StorageKey::ACTIVATION,
            StorageKey::GRANT,
        ] {
            self.write_plain(key, "")?;
        }
        Ok(())
    }

    fn load_trial_start(&self) -> Result<DateTime<Utc>, String> {
        let install_id = self.install_id()?;
        if let Some(record) = self.read_plain(StorageKey::TRIAL)? {
            return Ok(TrialRecord::parse(&record, &install_id)
                .map(|trial| trial.started_at)
                .unwrap_or_else(expired_trial_start));
        }
        if let Some(legacy) = self.read_plain(StorageKey::LEGACY_TRIAL_START)? {
            if let Ok(parsed) = DateTime::parse_from_rfc3339(&legacy) {
                let started_at = parsed.with_timezone(&Utc);
                self.write_trial(started_at, &install_id)?;
                self.write_plain(StorageKey::LEGACY_TRIAL_START, "")?;
                return Ok(started_at);
            }
        }
        let started_at = Utc::now();
        self.write_trial(started_at, &install_id)?;
        Ok(started_at)
    }

    fn write_trial(&self, started_at: DateTime<Utc>, install_id: &str) -> Result<(), String> {
        self.write_plain(
            StorageKey::TRIAL,
            &TrialRecord::new(started_at, install_id).encode(),
        )
    }

    fn install_id(&self) -> Result<String, String> {
        let value = self
            .store
            .read_app_value(StorageKey::INSTALL, String::new())
            .map_err(|error| error.to_string())?;
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_owned());
        }
        let generated = uuid::Uuid::new_v4().to_string();
        self.write_plain(StorageKey::INSTALL, &generated)?;
        Ok(generated)
    }
}

struct TrialRecord {
    started_at: DateTime<Utc>,
    encoded_time: String,
    seal: String,
}

impl TrialRecord {
    fn new(started_at: DateTime<Utc>, install_id: &str) -> Self {
        let encoded_time = started_at.to_rfc3339();
        let seal = trial_seal(&encoded_time, install_id);
        Self {
            started_at,
            encoded_time,
            seal,
        }
    }

    fn parse(record: &str, install_id: &str) -> Option<Self> {
        let (encoded_time, seal) = record.rsplit_once('|')?;
        if trial_seal(encoded_time, install_id) != seal {
            return None;
        }
        let started_at = DateTime::parse_from_rfc3339(encoded_time)
            .ok()?
            .with_timezone(&Utc);
        Some(Self {
            started_at,
            encoded_time: encoded_time.to_owned(),
            seal: seal.to_owned(),
        })
    }

    fn encode(&self) -> String {
        format!("{}|{}", self.encoded_time, self.seal)
    }
}

fn expired_trial_start() -> DateTime<Utc> {
    Utc::now() - TRIAL_LENGTH - Duration::days(1)
}

fn trial_seal(started_at: &str, install_id: &str) -> String {
    let digest = Sha256::new()
        .chain_update(TRIAL_SEAL_CONTEXT.as_bytes())
        .chain_update(install_id.as_bytes())
        .chain_update(started_at.as_bytes())
        .finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct CacheWindow {
    now: DateTime<Utc>,
}

impl CacheWindow {
    fn new(now: DateTime<Utc>) -> Self {
        Self { now }
    }

    fn trusts(&self, validated_at: &str, expires_at: Option<&str>) -> bool {
        let Some(validated) = parse_utc(validated_at) else {
            return false;
        };
        if validated > self.now + CLOCK_TOLERANCE || self.now - validated > OFFLINE_TRUST {
            return false;
        }
        expires_at
            .map(|value| parse_utc(value).is_some_and(|expiration| self.now < expiration))
            .unwrap_or(true)
    }

    fn refresh_due(&self, validated_at: &str) -> bool {
        let Some(validated) = parse_utc(validated_at) else {
            return true;
        };
        validated > self.now + CLOCK_TOLERANCE || self.now - validated >= REFRESH_INTERVAL
    }
}

fn parse_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.with_timezone(&Utc))
}

fn normalized_key(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        Err("Enter your Looper activation code.".to_owned())
    } else {
        Ok(value.to_owned())
    }
}

fn polar_organization() -> &'static str {
    option_env!("LOOPER_POLAR_ORGANIZATION_ID")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(POLAR_DEFAULT_ORGANIZATION)
}

fn polar_api_base() -> &'static str {
    option_env!("LOOPER_POLAR_API_BASE").unwrap_or(POLAR_DEFAULT_BASE)
}

fn platform_activation_label() -> &'static str {
    match std::env::consts::OS {
        "macos" => "Looper for Mac",
        "windows" => "Looper for Windows",
        _ => "Looper",
    }
}

fn device_conditions() -> DeviceConditions<'static> {
    DeviceConditions {
        os: std::env::consts::OS,
    }
}

struct BenefitCatalog {
    entries: Vec<(LicenseEdition, String)>,
}

impl BenefitCatalog {
    fn configured() -> Self {
        let entries = [
            LicenseEdition::Personal,
            LicenseEdition::Commercial,
            LicenseEdition::Founder,
            LicenseEdition::Contributor,
        ]
        .into_iter()
        .filter_map(|edition| benefit_id(edition).map(|identifier| (edition, identifier)))
        .collect();
        Self { entries }
    }

    fn unique_ids(&self) -> Vec<String> {
        let mut identifiers: Vec<_> = self
            .entries
            .iter()
            .map(|(_, identifier)| identifier.clone())
            .collect();
        identifiers.sort();
        identifiers.dedup();
        identifiers
    }

    fn single_id(&self) -> Option<String> {
        let identifiers = self.unique_ids();
        (identifiers.len() == 1).then(|| identifiers[0].clone())
    }

    fn allows(&self, benefit: Option<&str>) -> bool {
        let identifiers = self.unique_ids();
        identifiers.is_empty()
            || benefit.is_some_and(|actual| identifiers.iter().any(|expected| expected == actual))
    }

    fn resolve(&self, benefit: Option<&str>) -> LicenseEdition {
        let Some(benefit) = benefit else {
            return LicenseEdition::Personal;
        };
        [
            LicenseEdition::Founder,
            LicenseEdition::Contributor,
            LicenseEdition::Commercial,
            LicenseEdition::Personal,
        ]
        .into_iter()
        .find(|edition| {
            self.entries
                .iter()
                .any(|(candidate, identifier)| candidate == edition && identifier == benefit)
        })
        .unwrap_or(LicenseEdition::Personal)
    }
}

fn benefit_id(edition: LicenseEdition) -> Option<String> {
    let value = match edition {
        LicenseEdition::Personal => option_env!("LOOPER_POLAR_BENEFIT_PERSONAL"),
        LicenseEdition::Commercial => option_env!("LOOPER_POLAR_BENEFIT_COMMERCIAL"),
        LicenseEdition::Founder => option_env!("LOOPER_POLAR_BENEFIT_FOUNDER"),
        LicenseEdition::Contributor => option_env!("LOOPER_POLAR_BENEFIT_CONTRIBUTOR"),
    }?;
    (!value.trim().is_empty()).then(|| value.to_owned())
}

fn status_failure_message(status: &str) -> &'static str {
    if matches!(status, "revoked" | "disabled") {
        "That activation code is no longer active."
    } else {
        "Polar did not grant that activation code."
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(value: &str) -> DateTime<Utc> {
        parse_utc(value).unwrap()
    }

    fn granted_response() -> PolarLicenseResponse {
        PolarLicenseResponse {
            organization_id: Some(polar_organization().to_owned()),
            benefit_id: BenefitCatalog::configured().unique_ids().into_iter().next(),
            status: GRANTED.to_owned(),
            display_key: None,
            customer: None,
            activation: None,
            expires_at: None,
            validations: None,
            usage: None,
            limit_usage: None,
            limit_activations: None,
            created_at: None,
        }
    }

    fn snapshot(
        now: &str,
        trial_start: &str,
        credential: CredentialState,
        grant: Option<CachedGrant>,
    ) -> LicenseState {
        LicenseSnapshot {
            now: at(now),
            trial_started_at: at(trial_start),
            credential,
            grant,
            development_bypass: false,
            benefits: BenefitCatalog::configured(),
        }
        .render()
    }

    #[test]
    fn deep_link_accepts_license_host_or_path_only_for_looper_scheme() {
        assert!(is_license_deep_link("looper://license"));
        assert!(is_license_deep_link("looper://settings/license/returned"));
        assert!(!is_license_deep_link("https://license"));
        assert!(!is_license_deep_link("looper://settings/account"));
        assert!(!is_license_deep_link("not a url"));
    }

    #[test]
    fn guards_keep_feature_specific_public_errors() {
        assert_eq!(gate_result(true, "ignored".to_owned()), Ok(()));
        assert_eq!(
            gate_result(
                false,
                "A Looper license is required for Library.".to_owned()
            ),
            Err("A Looper license is required for Library.".to_owned())
        );
    }

    #[test]
    fn trial_snapshot_rounds_partial_days_up_and_expires_at_boundary() {
        let active = snapshot(
            "2026-05-14T12:00:01Z",
            "2026-05-01T12:00:00Z",
            CredentialState::Missing,
            None,
        );
        assert_eq!(active.status, LicenseStatus::Trial);
        assert_eq!(active.trial_days_remaining, 1);
        let expired = snapshot(
            "2026-05-15T12:00:00Z",
            "2026-05-01T12:00:00Z",
            CredentialState::Missing,
            None,
        );
        assert_eq!(expired.status, LicenseStatus::Expired);
        assert!(!expired.trial_active);
        assert_eq!(expired.trial_days_remaining, 0);
    }

    #[test]
    fn expired_license_state_keeps_product_access_open_while_free() {
        let grant = CachedGrant {
            status: GRANTED.to_owned(),
            last_validated_at: "2026-05-25T11:59:00Z".to_owned(),
            ..Default::default()
        };
        let state = snapshot(
            "2026-05-25T12:00:00Z",
            "2026-01-01T00:00:00Z",
            CredentialState::Unreadable,
            Some(grant),
        );
        assert_eq!(state.status, LicenseStatus::Expired);
        assert!(state.license_gate_active);
    }

    #[test]
    fn active_snapshot_preserves_customer_usage_and_default_activation_limit() {
        let grant = CachedGrant {
            status: GRANTED.to_owned(),
            last_validated_at: "2026-05-25T11:59:00Z".to_owned(),
            customer_email: Some("person@example.com".to_owned()),
            usage: Some(2),
            ..Default::default()
        };
        let state = snapshot(
            "2026-05-25T12:00:00Z",
            "2026-01-01T00:00:00Z",
            CredentialState::Readable,
            Some(grant),
        );
        assert_eq!(state.status, LicenseStatus::Active);
        assert_eq!(state.customer_email.as_deref(), Some("person@example.com"));
        assert_eq!(state.usage, Some(2));
        assert_eq!(state.activations_limit, 5);
        assert_eq!(state.edition, Some(LicenseEdition::Personal));
    }

    #[test]
    fn polar_policy_accepts_current_grant_and_rejects_wrong_organization() {
        assert!(validate_polar_license(&granted_response(), None).is_ok());
        let mut response = granted_response();
        response.organization_id = Some("other-organization".to_owned());
        assert_eq!(
            validate_polar_license(&response, None),
            Err("Polar returned a license for a different organization.".to_owned())
        );
    }

    #[test]
    fn polar_policy_rejects_status_activation_expiry_and_usage_in_order() {
        let mut response = granted_response();
        response.status = "revoked".to_owned();
        assert_eq!(
            validate_polar_license(&response, None),
            Err("That activation code is no longer active.".to_owned())
        );

        response = granted_response();
        response.activation = Some(PolarActivation {
            id: "different".to_owned(),
        });
        assert_eq!(
            validate_polar_license(&response, Some("expected")),
            Err("Polar returned a license for a different device activation.".to_owned())
        );

        response = granted_response();
        response.expires_at = Some("2000-01-01T00:00:00Z".to_owned());
        assert_eq!(
            validate_polar_license(&response, None),
            Err("That activation code is expired.".to_owned())
        );

        response = granted_response();
        response.usage = Some(3);
        response.limit_usage = Some(2);
        assert_eq!(
            validate_polar_license(&response, None),
            Err("That activation code has reached its usage limit.".to_owned())
        );
    }

    #[test]
    fn activation_request_wire_contract_includes_label_and_os_condition() {
        let request = ActivationRequest {
            key: "KEY",
            organization_id: "ORG",
            label: "DEVICE",
            conditions: DeviceConditions { os: "macos" },
        };
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({
                "key": "KEY",
                "organization_id": "ORG",
                "label": "DEVICE",
                "conditions": { "os": "macos" },
            })
        );
    }

    #[test]
    fn validation_request_wire_keeps_optional_activation_and_benefit_fields() {
        let request = ValidationRequest {
            key: "KEY",
            organization_id: "ORG",
            activation_id: None,
            benefit_id: Some("BENEFIT"),
            conditions: DeviceConditions { os: "windows" },
        };
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({
                "key": "KEY",
                "organization_id": "ORG",
                "activation_id": null,
                "benefit_id": "BENEFIT",
                "conditions": { "os": "windows" },
            })
        );
    }

    #[test]
    fn deactivation_wire_and_activation_response_keep_polar_field_names() {
        let request = DeactivationRequest {
            key: "KEY",
            organization_id: "ORG",
            activation_id: "ACTIVATION",
        };
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({
                "key": "KEY",
                "organization_id": "ORG",
                "activation_id": "ACTIVATION",
            })
        );
        let decoded: PolarActivationResponse = serde_json::from_value(serde_json::json!({
            "id": "ACTIVATION",
            "license_key": {
                "organization_id": "ORG",
                "benefit_id": null,
                "status": "granted",
                "display_key": "LOOP-****",
                "customer": { "email": "person@example.com", "name": "Person" },
                "activation": { "id": "ACTIVATION" },
                "expires_at": null,
                "validations": 3,
                "usage": 1,
                "limit_usage": 20,
                "limit_activations": 5,
                "created_at": "2026-01-01T00:00:00Z"
            }
        }))
        .unwrap();
        assert_eq!(decoded.id, "ACTIVATION");
        assert_eq!(decoded.license_key.validations, Some(3));
        assert_eq!(
            decoded
                .license_key
                .customer
                .and_then(|customer| customer.email)
                .as_deref(),
            Some("person@example.com")
        );
    }

    #[test]
    fn cache_trust_includes_seven_day_boundary_and_rejects_future_skew() {
        let window = CacheWindow::new(at("2026-05-25T12:00:00Z"));
        assert!(window.trusts("2026-05-18T12:00:00Z", None));
        assert!(!window.trusts("2026-05-18T11:59:59Z", None));
        assert!(window.trusts("2026-05-25T12:10:00Z", None));
        assert!(!window.trusts("2026-05-25T12:10:01Z", None));
        assert!(!window.trusts("invalid", None));
    }

    #[test]
    fn cache_expiration_and_refresh_boundaries_are_distinct() {
        let window = CacheWindow::new(at("2026-05-25T12:00:00Z"));
        assert!(!window.trusts("2026-05-25T11:59:00Z", Some("2026-05-25T12:00:00Z")));
        assert!(!window.refresh_due("2026-05-24T12:00:01Z"));
        assert!(window.refresh_due("2026-05-24T12:00:00Z"));
        assert!(window.refresh_due("2030-01-01T00:00:00Z"));
    }

    #[test]
    fn grant_refresh_and_activity_delegate_to_cache_policy() {
        let now = at("2026-05-25T12:00:00Z");
        let grant = CachedGrant {
            status: GRANTED.to_owned(),
            last_validated_at: "2026-05-25T11:59:00Z".to_owned(),
            ..Default::default()
        };
        assert!(grant.active_at(now, &BenefitCatalog::configured()));
        assert!(!grant.refresh_due_at(now));
        let revoked = CachedGrant {
            status: INVALID.to_owned(),
            ..grant
        };
        assert!(!revoked.active_at(now, &BenefitCatalog::configured()));
    }

    #[test]
    fn trial_record_binds_time_to_installation() {
        let started_at = at("2026-05-25T00:00:00Z");
        let encoded = TrialRecord::new(started_at, "install-a").encode();
        assert_eq!(
            TrialRecord::parse(&encoded, "install-a")
                .unwrap()
                .started_at,
            started_at
        );
        assert!(TrialRecord::parse(&encoded, "install-b").is_none());
        let tampered = encoded.replace("2026-05-25", "2028-05-25");
        assert!(TrialRecord::parse(&tampered, "install-a").is_none());
    }

    #[test]
    fn normalization_and_http_failures_keep_user_facing_messages() {
        assert_eq!(normalized_key("  ABC  "), Ok("ABC".to_owned()));
        assert_eq!(
            normalized_key("  "),
            Err("Enter your Looper activation code.".to_owned())
        );
        assert_eq!(
            PolarFailure::from_http(StatusCode::FORBIDDEN).message(),
            "This activation code has reached its device limit."
        );
        assert!(PolarFailure::from_http(StatusCode::NOT_FOUND).revokes_cache());
        assert!(!PolarFailure::from_http(StatusCode::TOO_MANY_REQUESTS).revokes_cache());
    }

    #[test]
    fn cached_grant_keeps_original_activation_timestamp_on_refresh() {
        let first = CachedGrant {
            activated_at: Some("2026-01-01T00:00:00Z".to_owned()),
            ..Default::default()
        };
        let refreshed =
            CachedGrant::from_polar(&granted_response(), Some(first), at("2026-05-25T12:00:00Z"));
        assert_eq!(
            refreshed.activated_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(refreshed.last_validated_at, "2026-05-25T12:00:00+00:00");
    }
}
