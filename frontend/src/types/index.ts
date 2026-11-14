export interface BackupCodeItem {
  code: string;
  is_used: boolean;
}

export interface SecurityQuestionItem {
  question: string;
  answer: string;
}

export interface ApiKeyItem {
  id: string;
  label: string;
  key?: string;
  key_masked: string;
  created_at?: string;
  expires_at?: string;
}

export interface EnvVarItem {
  key: string;
  value?: string;
  value_masked: string;
}

export interface TagItem {
  name: string;
  color?: string;
}

export type ScopeFilter = 'all' | 'business' | 'personal';
export type EntityScope = 'business' | 'personal' | 'shared';
export type OwnershipType = 'client' | 'own' | 'independent';

export interface EmailAccount {
  id: string;
  address: string;
  provider: string;
  scope?: EntityScope;
  inbox_url?: string;
  icon?: string;
  notes?: string;
  has_password: boolean;
  password_masked: string;
  password_plain?: string;
  password_entropy: number;
  entropy_details?: {
    bits: number;
    score: number;
    label: string;
    color: string;
  };
  recovery_email_id?: string;
  recovery_email_address?: string;
  recovery_phone?: string;
  two_factor_method: 'authenticator' | 'passkey' | 'sms' | 'email' | 'none';
  backup_codes: BackupCodeItem[];
  security_questions: SecurityQuestionItem[];
  aliases: string[];
  platform_count: number;
  prospect_count?: number;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformAccount {
  id: string;
  name: string;
  email_id?: string | null;
  email_address?: string;
  scope?: EntityScope;
  ownership_type?: OwnershipType;
  prospect_id?: string | null;
  project_id?: string | null;
  business_share_percent?: number;
  payment_alias?: string;
  specific_alias?: string;
  login_url?: string;
  username?: string;
  notes?: string;
  icon_url?: string;
  icon_type: 'catalog' | 'extracted' | 'custom' | 'initials';
  access_type: 'own_password' | 'sso';
  has_password: boolean;
  password_masked: string;
  password_plain?: string;
  pin_masked?: string;
  pin_plain?: string;
  recovery_codes_plain?: string;
  api_keys: ApiKeyItem[];
  env_variables: EnvVarItem[];
  subscription_status: 'active' | 'paused' | 'cancelled' | 'free_trial' | 'free';
  subscription_cost: number;
  currency: string;
  billing_cycle: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | 'free';
  start_date?: string;
  next_billing_date?: string;
  trial_end_date?: string;
  payment_method_id?: string;
  tags: TagItem[];
  has_totp?: boolean;
  totp_code?: string;
  totp_remaining?: number;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethod {
  id: string;
  issuer: string;
  alias: string;
  last_four: string;
  scope?: EntityScope;
  expiry_month?: string;
  expiry_year?: string;
  card_number_masked: string;
  card_number_plain?: string;
  billing_notes?: string;
  linked_subscriptions_count: number;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VaultStatus {
  is_setup: boolean;
  is_unlocked: boolean;
  remaining_seconds: number;
  timeout_minutes: number;
  clipboard_clear_seconds: number;
  allow_reveal_passwords: boolean;
  search_hotkey: string;
  accent_color: string;
  canvas_style: string;
  budget_cap_amount?: number;
  budget_cap_currency?: string;
  password_rotation_days_root?: number;
  password_rotation_days_secondary?: number;
  trash_retention_days?: number;
  max_followup_attempts?: number;
}

export interface PasswordReuseGroup {
  password_masked: string;
  count: number;
  entities: { id: string; name: string; type: string; provider?: string; parent_email?: string }[];
}

export interface StaleAccountItem {
  id: string;
  name: string;
  type: 'email' | 'platform';
  provider?: string;
  parent_email?: string;
  age_days: number;
  threshold_days: number;
  last_updated?: string;
}

export interface ApiKeyAlertItem {
  id: string;
  label: string;
  key_prefix?: string;
  platform_id: string;
  platform_name: string;
  parent_email?: string;
  expires_at: string;
  days_remaining: number;
  status: 'expired' | 'expiring_soon';
}

export interface SecurityAuditResponse {
  health_score: number | null;
  total_accounts: number;
  vulnerable_accounts_count: number;
  reused_passwords_count: number;
  weak_passwords_count: number;
  no_2fa_emails_count: number;
  stale_passwords_count: number;
  expiring_api_keys_count?: number;
  expiring_soon_api_keys_count?: number;
  expired_api_keys_count?: number;
  password_rotation_days_root?: number;
  password_rotation_days_secondary?: number;
  reuse_groups: PasswordReuseGroup[];
  weak_accounts: { id: string; name: string; type: string; entropy: any }[];
  unprotected_emails: { id: string; address: string; provider: string; platform_count: number }[];
  stale_accounts?: StaleAccountItem[];
  api_key_alerts?: ApiKeyAlertItem[];
}

export interface BillingRecord {
  id: string;
  platform_id: string;
  platform_name: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  charged_date: string;
  billing_date?: string;
  payment_method_id?: string;
  created_at?: string;
}

export interface EmergencyKitResponse {
  generated_at: string;
  total_emails: number;
  total_platforms: number;
  root_emails: { address: string; provider: string; two_factor: string; phone: string }[];
  recovery_chains: { from_email: string; recovers_to: string }[];
  instructions: string[];
}

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  is_manual: boolean;
  updated_at: string;
  synced?: boolean;
  source?: string;
}

export interface GraphNode {
  id: string;
  entity_id?: string;
  label: string;
  type: 'email' | 'platform' | 'payment' | 'prospect';
  sub_type?: string;
  icon?: string;
  status?: string;
  is_critical_failure_point: boolean;
  metrics: Record<string, any>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'child' | 'recovery' | 'payment' | 'prospect';
  is_cycle?: boolean;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  cycles_detected: string[][];
  critical_nodes: string[];
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  details?: string;
  ip_address?: string;
}

export interface VaultCredentialItem {
  id: string;
  entity_id: string;
  category: string;
  scope?: EntityScope;
  name: string;
  username?: string;
  provider?: string;
  parent_email?: string;
  type: 'email_password' | 'platform_password' | 'pin' | 'api_key';
  access_type?: string;
  has_credential: boolean;
  credential_masked: string;
  credential_plain?: string;
  entropy?: {
    bits: number;
    score: number;
    label: string;
    color: string;
  };
  expires_at?: string;
  last_updated?: string;
}

export interface PwnedCheckResponse {
  is_pwned: boolean;
  pwned_count: number;
  severity: string;
  message: string;
}

export interface AuditLogsResponse {
  total: number;
  offset: number;
  limit: number;
  items: AuditLogItem[];
}

export interface TotpSetupResponse {
  code: string;
  remaining_seconds: number;
}

export type ProspectWorkflowType = 'demo_first' | 'direct_quote';

export type ProspectStatus =
  | 'nuevo'
  | 'demo_creada'
  | 'primer_contacto'
  | 'en_cotizacion'
  | 'respondido'
  | 'tiempo_agotado'
  | 'archivado_frio';

export type ProspectSlaStatus = 'en_tiempo' | 'cumplido' | 'vencido';

export type ProspectFollowupStatus = 'en_tiempo' | 'vencido' | 'sin_iniciar' | 'completado';

export interface Prospect {
  id: string;
  company_name: string;
  contact_name?: string;
  contact_email?: string;
  email_id?: string;
  email_address?: string;
  email_provider?: string;
  specific_alias?: string;
  scope?: EntityScope;
  workflow_type: ProspectWorkflowType;
  status: ProspectStatus;
  demo_url?: string;
  estimated_value?: number;
  currency?: string;
  billing_type?: 'one_time' | 'monthly_retainer';
  whatsapp?: string;
  phones?: string;
  maps_url?: string;
  social_links?: string;
  notes?: string;
  tags: TagItem[];
  started_at?: string;
  sla_hours: number;
  responded_at?: string;
  response_time_seconds?: number;
  met_sla?: boolean;
  elapsed_seconds: number;
  sla_seconds: number;
  sla_status: ProspectSlaStatus;
  last_contacted_at?: string;
  followup_count?: number;
  last_contact_channel?: string;
  followup_sla_hours?: number;
  followup_elapsed_seconds?: number;
  followup_sla_seconds?: number;
  followup_remaining_seconds?: number;
  followup_status?: ProspectFollowupStatus;
  max_followup_attempts?: number;
  needs_recontact?: boolean;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export type IncomeCategory = 'anticipo' | 'liquidacion' | 'iguala_mensual' | 'dominio_hosting' | 'renovacion_dominio_hosting' | 'otro' | string;
export type IncomeStatus = 'cobrado' | 'pendiente';

export interface ClientIncome {
  id: string;
  prospect_id?: string | null;
  project_id?: string | null;
  ownership_type?: OwnershipType;
  scope?: EntityScope;
  business_share_percent?: number;
  client_name: string;
  concept: string;
  category: IncomeCategory;
  amount: number;
  currency: string;
  status: IncomeStatus;
  received_date: string;
  payment_method_label?: string | null;
  is_recurring: boolean;
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export type RenewalServiceType = 'dominio' | 'hosting' | 'dominio_y_hosting' | 'ssl_otro' | string;
export type RenewalPaidBy = 'me' | 'client';
export type RenewalStatus = 'activo' | 'renovado' | 'vencido' | 'cancelado';
export type RenewalExpirySemaphore = 'en_orden' | 'proximo' | 'urgente' | 'vencido' | 'cancelado';

export interface AdvanceRenewalPayload {
  create_income?: boolean;
  charged_amount?: number;
  charged_currency?: string;
  payment_method_label?: string;
  income_status?: IncomeStatus;
}

export interface DomainRenewal {
  id: string;
  prospect_id?: string | null;
  project_id?: string | null;
  platform_id?: string | null;
  ownership_type?: OwnershipType;
  scope?: EntityScope;
  business_share_percent?: number;
  client_name: string;
  domain_or_service: string;
  service_type: RenewalServiceType;
  provider?: string | null;
  renewal_date: string;
  renewal_cost: number;
  client_charge_amount?: number;
  currency: string;
  billing_cycle: 'yearly' | 'monthly';
  paid_by: RenewalPaidBy;
  status: RenewalStatus;
  auto_renew: boolean;
  notes?: string | null;
  days_remaining: number;
  expiry_semaphore: RenewalExpirySemaphore;
  created_income_id?: string | null;
  margin_amount?: number | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OneTimeExpense {
  id: string;
  concept: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  scope: EntityScope;
  business_share_percent: number;
  ownership_type: OwnershipType;
  vendor?: string | null;
  payment_method_label?: string | null;
  prospect_id?: string | null;
  project_id?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export type InternalProjectStatus = 'idea' | 'en_desarrollo' | 'en_produccion' | 'pausado';

export interface InternalProject {
  id: string;
  name: string;
  category: string;
  status: InternalProjectStatus;
  scope: EntityScope;
  email_id?: string | null;
  email_address?: string | null;
  production_url?: string | null;
  repo_url?: string | null;
  tech_stack?: string | null;
  monthly_maintenance_cost: number;
  currency: string;
  linked_platform_ids: string[];
  linked_domain_ids: string[];
  tags: TagItem[];
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export type SecureResourceType =
  | 'env_file'
  | 'ssh_key'
  | 'backup_codes'
  | 'software_license'
  | 'nota_segura'
  | string;

export interface SecureResource {
  id: string;
  title: string;
  resource_type: SecureResourceType;
  scope: EntityScope;
  ownership_type: OwnershipType;
  content?: string | null;
  content_masked: string;
  email_id?: string | null;
  platform_id?: string | null;
  prospect_id?: string | null;
  project_id?: string | null;
  tags: TagItem[];
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export type CoreUserRole = 'owner' | 'business_admin' | 'seller' | 'readonly';

export interface CoreUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: CoreUserRole;
  is_active: boolean;
  is_totp_enabled: boolean;
  must_change_password: boolean;
  created_at?: string;
}

export interface CoreLoginResponse {
  token: string;
  user: CoreUser;
  expires_in_minutes: number;
}

export interface CoreUserCreateResponse extends CoreUser {
  temporary_password: string;
}

export interface TotpSetupResponse {
  secret: string;
  recovery_codes: string[];
}

export type WriteupStatus = 'borrador' | 'en_revision' | 'finalizado' | 'entregado';
export type WriteupSeverity = 'informativa' | 'baja' | 'media' | 'alta' | 'critica';
export type WriteupExportFormat = 'pdf' | 'docx' | 'html' | 'md_zip' | 'md' | 'sarif' | 'json' | 'csv';

export interface WriteupStructuredFinding {
  id: string;
  title: string;
  severity: WriteupSeverity;
  cvss_score?: number | null;
  cvss_vector?: string | null;
  cwe_id?: string | null;
  cve_id?: string | null;
  affected_target?: string | null;
  status: 'abierta' | 'mitigada' | 'riesgo_aceptado' | 'falso_positivo';
  summary: string;
  remediation: string;
  anchor_id?: string | null;
}

export interface WriteupAsset {
  id: string;
  writeup_id: string;
  filename: string;
  mime_type: string;
  original_size_bytes: number;
  optimized_size_bytes: number;
  width: number;
  height: number;
  sha256: string;
  exif_stripped: boolean;
  caption?: string | null;
  created_at: string;
}

export interface WriteupBoard {
  id: string;
  writeup_id: string;
  title: string;
  scene_json: string;
  svg_snapshot?: string | null;
  element_count: number;
  created_at: string;
  updated_at: string;
}

export interface WriteupCitation {
  id: string;
  writeup_id: string;
  board_id: string;
  anchor_id: string;
  board_element_id?: string | null;
  heading_path?: string | null;
  line_start: number;
  line_end: number;
  quoted_text: string;
  quote_hash: string;
  is_stale: boolean;
  color: string;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WriteupRevision {
  id: string;
  writeup_id: string;
  revision_number: number;
  change_note?: string | null;
  content_hash: string;
  markdown_content: string;
  created_at: string;
}

export interface WriteupExportLog {
  id: string;
  writeup_id: string;
  export_format: string;
  redacted_for_client: boolean;
  sha256: string;
  byte_size: number;
  created_at: string;
}

export interface WriteupSummary {
  id: string;
  title: string;
  slug: string;
  status: WriteupStatus;
  severity: WriteupSeverity;
  cvss_score?: number | null;
  cwe_id?: string | null;
  cve_id?: string | null;
  target_scope?: string | null;
  tags: string[];
  prospect_id?: string | null;
  project_id?: string | null;
  engagement_id?: string | null;
  boards_count: number;
  assets_count: number;
  citations_count: number;
  updated_at: string;
  created_at: string;
}

export interface WriteupDetail extends WriteupSummary {
  cvss_vector?: string | null;
  markdown_content: string;
  executive_summary?: string | null;
  findings: WriteupStructuredFinding[];
  boards: WriteupBoard[];
  citations: WriteupCitation[];
  assets: WriteupAsset[];
  export_logs: WriteupExportLog[];
}

export interface RuntimeCurrencyOption {
  code: string;
  name: string;
  symbol: string;
  is_base?: boolean;
}

export interface RuntimeMapZone {
  slug: string;
  zone: string;
  center: [number, number];
  zoom: number;
  bbox: { min_lat: number; min_lon: number; max_lat: number; max_lon: number };
  colonias: string[];
}

export interface RuntimeMapSector {
  id: string;
  label: string;
  stems: string[];
  osm_tags: [string, string][];
}

export interface RuntimeConfig {
  currencies: RuntimeCurrencyOption[];
  currency_config: {
    base_currency: string;
    exchange_pair: { base: string; target: string };
    locale: string;
  };
  map_defaults: {
    default_city: string;
    default_zone: string;
    default_sector: string;
    center: [number, number];
    zoom: number;
    max_search_area_deg: number;
    full_bounds_zone_slug: string;
    tile_url_template: string;
    attribution: string;
  };
  map_zones: RuntimeMapZone[];
  map_sectors: RuntimeMapSector[];
  writeup_defaults: {
    organization_name: string;
    watermark_default: string;
  };
  service_types: Array<{ id: string; name: string; billing?: string; requires_quote?: boolean; requires_auth_doc?: boolean }>;
  payment_methods: Array<{ id: string; name: string }>;
  pipeline_stages: Array<{ id: string; label: string; is_terminal?: boolean; order?: number }>;
}

