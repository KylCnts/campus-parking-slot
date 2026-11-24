export type Role = 'ADMIN' | 'STUDENT' | 'FACULTY'
export type AccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED'
export type Category = 'STUDENT' | 'FACULTY'
export type SpaceStatus = 'AVAILABLE' | 'OCCUPIED' | 'EVENT_RESERVED'
export type SlotType = 'CAR' | 'MOTORCYCLE'
export type TxnStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface UserVehicle {
  id: number
  plate_number: string
  vehicle_type: string
  color: string
  brand_model: string
  category: Category
  is_active: boolean
  created_at: string
}

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  role_display?: string
  id_number: string | null
  department: string
  year_level: string
  contact_number: string
  is_active: boolean
  account_status: AccountStatus
  status_reason: string
  must_change_password?: boolean
  created_at: string
  last_login: string | null
  plate_number: string | null
  vehicles: UserVehicle[]
}

export interface ParkingArea {
  id: number
  name: string
  code: string
  location: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
  total_spaces: number
  available_spaces: number
  occupied_spaces: number
  event_reserved_spaces: number
  maximum?: number
  restricted?: number
  effective_capacity?: number
  occupied?: number
  available?: number
  over_capacity?: number
}

export interface ParkingSpace {
  id: number
  slot_number: string
  area: number
  area_name: string
  area_code: string
  category: Category
  category_display: string
  slot_type: SlotType
  status: SpaceStatus
  notes: string
  created_at: string
  updated_at: string
  current_transaction: { id: number; plate_number: string; owner: string; entry_time: string } | null
}

export interface Vehicle {
  id: number
  plate_number: string
  owner: number | null
  owner_name: string
  owner_display: string
  owner_email: string | null
  owner_id_number: string | null
  owner_department: string | null
  owner_contact: string | null
  owner_active: boolean | null
  owner_role: Role | null
  owner_role_display: string | null
  owner_account_status: AccountStatus | null
  category: Category
  category_display: string
  vehicle_type: string
  vehicle_type_display: string
  color: string
  brand_model: string
  is_active: boolean
  is_parked: boolean
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  vehicle: number
  plate_number: string
  owner: string
  owner_id_number: string | null
  vehicle_type: string
  vehicle_color: string
  space: number
  slot_number: string
  area_name: string
  category: Category
  category_display: string
  entry_time: string
  exit_time: string | null
  status: TxnStatus
  source: 'GATE' | 'SELF'
  estimated_departure: string | null
  extension_count: number
  release_type: string
  release_reason: string
  duration_minutes: number
  entry_recorded_by_name: string | null
  exit_recorded_by_name: string | null
  remarks: string
}

export interface CategoryStats {
  total: number
  available: number
  occupied: number
  event_reserved: number
  availability_pct: number
  occupancy_pct: number
  last_updated: string | null
}

export interface AvailabilitySummary {
  overall: CategoryStats
  student: CategoryStats
  faculty: CategoryStats
  car: CategoryStats
  motorcycle: CategoryStats
  currently_parked: number
  timestamp: string
}

export interface IncidentReport {
  id: number
  kind: string
  kind_display: string
  subject: string
  description: string
  transaction: number | null
  space: number | null
  slot_number: string | null
  plate_number: string
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED'
  admin_response: string
  reported_by: number | null
  reported_by_name: string | null
  resolved_by_name: string | null
  resolved_at: string | null
  created_at: string
}

export interface Notification {
  id: number
  title: string
  message: string
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT'
  link: string
  is_read: boolean
  created_at: string
}

export interface ActivityLog {
  id: number
  user: number | null
  user_name: string
  user_role: Role | null
  action: string
  description: string
  ip_address: string | null
  created_at: string
}

export interface ParkingSettings {
  campus_name: string
  opening_time: string
  closing_time: string
  low_availability_threshold: number
  session_reminder_minutes: number
  session_grace_minutes: number
  allow_cross_category_parking: boolean
  guidelines: string
  updated_at: string
}

export interface MapSpace {
  id: number
  slot_number: string
  slot_type: SlotType
  category: Category
  category_display: string
  area_name: string
  status: SpaceStatus
  map_x: number | null
  map_y: number | null
  map_w: number | null
  map_h: number | null
  updated_at: string
  event_name: string | null
  is_mine: boolean
  my_session_id: number | null
  current_transaction: { id: number; plate_number: string; owner: string; entry_time: string } | null
}

export interface ParkingEvent {
  id: number
  name: string
  description: string
  event_date: string
  start_time: string
  end_time: string
  starts_at: string
  ends_at: string
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'
  revision: number
  space_ids: number[]
  slot_numbers: string[]
  created_by_name: string | null
  published_at: string | null
  cancelled_at: string | null
  released_at: string | null
  notifications_total: number
  notifications_failed: number
}

export interface EventNotification {
  id: number
  event: number
  event_name: string
  recipient_name: string | null
  recipient_email: string
  kind: 'PUBLISHED' | 'UPDATED' | 'CANCELLED'
  revision: number
  subject: string
  status: 'PENDING' | 'SENT' | 'LOGGED' | 'FAILED'
  error: string
  attempts: number
  sent_at: string | null
  created_at: string
}

export interface Verification {
  id: number
  user: number | null
  applicant_name: string
  applicant_email: string
  user_type: string
  id_number: string | null
  department: string | null
  year_level: string | null
  vehicle: { plate_number: string; vehicle_type: string; brand_model: string; color: string } | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  has_image: boolean
  image_deleted_at: string | null
  decided_by_name: string
  decided_at: string | null
  rejection_reason: string
  email_status: string
  submitted_at: string
}

export interface AuditEntry {
  id: number
  actor_name: string
  actor_email: string
  action: string
  target_type: string
  target_id: string
  target_label: string
  previous_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  reason: string
  ip_address: string | null
  created_at: string
}

export interface ParkingSession {
  id: number
  plate_number: string
  vehicle_type: string
  brand_model: string
  vehicle_color: string
  slot_number: string
  area_name: string
  status: TxnStatus
  source: 'GATE' | 'SELF'
  entry_time: string
  exit_time: string | null
  estimated_departure: string | null
  extension_count: number
  release_type: string
  release_display: string
  release_reason: string
  duration_minutes: number
}

export interface Option {
  value: string
  label: string
}

export interface ColorOption extends Option {
  /** CSS color or gradient used for the swatch. */
  swatch: string
}

export interface Meta {
  categories: Option[]
  space_statuses: Option[]
  slot_types: Option[]
  vehicle_types: Option[]
  roles: Option[]
  report_kinds: Option[]
  courses: string[]
  vehicle_colors: ColorOption[]
  user_report_categories: Option[]
}

export type UserReportStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED'

export interface UserReport {
  id: number
  reference: string
  category: string
  category_display: string
  title: string
  description: string
  has_attachment: boolean
  status: UserReportStatus
  status_display: string
  admin_response: string
  handled_by_name: string
  responded_at: string | null
  resolved_at: string | null
  reporter_name: string
  reporter_email: string
  reporter_details: {
    id: number
    role: Role
    role_display: string
    id_number: string | null
    department: string
    contact_number: string
    account_status: AccountStatus
    plate_number: string | null
  } | null
  created_at: string
  updated_at: string
}

export interface UserReportSummary {
  total: number
  submitted: number
  under_review: number
  in_progress: number
  resolved: number
  rejected: number
  pending: number
  ongoing: number
  closed: number
}
