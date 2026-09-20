export interface Product {
  id: number;
  code: string;
  name: string;
  stock_qty: number;
  price: number;
  cost_price: number;
  image_file?: string;
  live_id?: string;
}

export interface OrderItem {
  id: number;
  invoice_id: number;
  product_id?: number;
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
  is_packed: boolean;
  item_comment?: string;
  image_file?: string;
}

export type PackingStage = 'UNPICKED' | 'STAGED' | 'DISPATCHED';
export type InvoiceStatus = 'Pending' | 'Paid' | 'Packed' | 'Dispatched' | 'Cancelled';
export type DeliveryZone = 'PP' | 'PROVINCE' | 'UNKNOWN';

export interface Invoice {
  invoice_id: number;
  basket_no?: number | string;
  live_id: string;
  created_at: string;
  facebook_user_id: string;
  facebook_name: string;
  picture_url?: string;
  phone_number: string;
  address: string;
  location_zone: DeliveryZone;
  location_label?: string;
  total_amount: number;
  shipping_fee?: number;
  is_free_ship?: boolean;
  status: InvoiceStatus;
  packing_stage: PackingStage;
  payment_status?: 'Paid' | 'Unpaid' | 'COD';
  staged_by?: string;
  staged_at?: string;
  verified_by?: string;
  verified_at?: string;
  paid_by?: string;
  paid_at?: string;
  payment_method?: string;
  payment_slip_url?: string;
  msg_status: 'SENT' | 'UNSENT' | 'FAILED';
  msg_error?: string;
  is_locked?: boolean;
  locked_by?: string | null;
  lock_timestamp?: number;
  lock_start_time?: number;
  updated_at?: string;
  items: OrderItem[];
  unmatched_comments?: string[];
  comments?: string[];
}

export interface CustomerComment {
  comment_id: string;
  invoice_id?: number;
  live_id: string;
  facebook_user_id: string;
  facebook_name: string;
  comment_text: string;
  created_at: string;
  is_matched?: boolean;
  picture_url?: string;
}

export interface Customer {
  customer_id: number;
  facebook_user_id: string;
  facebook_name: string;
  picture_url?: string;
  phone_number?: string;
  address?: string;
  is_vip: boolean;
  is_blacklist: boolean;
  last_interaction_at?: string;
}

export interface PackerLog {
  log_id: number;
  invoice_id: number;
  packer_name: string;
  items_count: number;
  duration_seconds: number;
  packed_at: string;
  facebook_name?: string;
  total_amount?: number;
}

export interface AppSettings {
  default_shipping_fee: number;
  free_ship_threshold: number;
  bulk_discount_qty: number;
  bulk_discount_amount: number;
  bakong_id: string;
  merchant_name: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  khqr_city?: string;
  khqr_enabled?: boolean;
  exchange_rate: number;
  telegram_token: string;
  telegram_chat_id: string;
  parser_strict_catalog?: boolean;
  parser_allow_standalone?: boolean;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  picture?: {
    data?: {
      url?: string;
    };
  };
}

export interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  status_type?: string;
  permalink_url?: string;
  is_live?: boolean;
  live_status?: string;
}
