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

export interface EmailAccount {
  id: string;
  address: string;
  provider: string;
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
  email_id: string;
  email_address?: string;
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
  currency: 'MXN' | 'USD';
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
  expiry_month?: string;
  expiry_year?: string;
  card_number_masked: string;
  card_number_plain?: string;
  cvv_plain?: string;
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
}

export interface PasswordReuseGroup {
  password_masked: string;
  count: number;
  entities: { id: string; name: string; type: string; provider?: string; parent_email?: string }[];
}

export interface SecurityAuditResponse {
  health_score: number;
  total_accounts: number;
  vulnerable_accounts_count: number;
  reused_passwords_count: number;
  weak_passwords_count: number;
  no_2fa_emails_count: number;
  stale_passwords_count: number;
  reuse_groups: PasswordReuseGroup[];
  weak_accounts: { id: string; name: string; type: string; entropy: any }[];
  unprotected_emails: { id: string; address: string; provider: string; platform_count: number }[];
}

export interface EmergencyKitResponse {
  generated_at: string;
  vault_id: string;
  master_salt: string;
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
  | 'demo_creada'
  | 'primer_contacto'
  | 'en_cotizacion'
  | 'respondido'
  | 'tiempo_agotado';

export type ProspectSlaStatus = 'en_tiempo' | 'cumplido' | 'vencido';

export interface Prospect {
  id: string;
  company_name: string;
  contact_name?: string;
  contact_email?: string;
  email_id?: string;
  email_address?: string;
  email_provider?: string;
  specific_alias?: string;
  workflow_type: ProspectWorkflowType;
  status: ProspectStatus;
  demo_url?: string;
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
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}


