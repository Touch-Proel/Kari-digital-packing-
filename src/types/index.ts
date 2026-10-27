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
  note?: string;
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
  paid_by?: string;
  paid_at?: string;
  payment_method?: string;
  payment_slip_url?: string;
  waybill_image_url?: string;
  tracking_code?: string;
  delivery_carrier?: string;
  dispatched_at?: string;
  dispatched_by?: string;
  msg_status: 'SENT' | 'UNSENT' | 'FAILED';
  msg_error?: string;
  msg_delivery_method?: 'SEND_API' | 'PRIVATE_REPLY' | 'MANUAL_COPIED';
  last_comment_id?: string;
  comment_ids?: string[];
  is_locked?: boolean;
  locked_by?: string | null;
  updated_at?: string;
  items: OrderItem[];
  unmatched_comments?: string[];
  comments?: string[];
  notes?: string[];
  merge_candidates?: Array<{
    invoice_id: number;
    basket_no: number | string;
    live_id: string;
    total_amount: number;
    items_count: number;
    created_at: string;
    status: string;
    staged_by?: string;
  }>;
  is_merged?: boolean;
  merged_into_invoice_id?: number;
  merged_into_basket_no?: number | string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
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
  comments_count?: number;
  reactions_count?: number;
  views_count?: number;
  thumbnail_url?: string;
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

export interface PickingItem {
  code: string;
  product_name: string;
  price: number;
  total_qty: number;
  exists_in_stock?: boolean;
  stock_qty?: number;
  image_url?: string;
}

export interface Customer {
  customer_id: number;
  facebook_user_id: string;
  facebook_name: string;
  picture_url?: string;
  phone_number?: string;
  address?: string;
  location_zone?: DeliveryZone;
  location_label?: string;
  is_zone_locked?: boolean;
  is_vip: boolean;
  is_blacklist: boolean;
  notes?: string;
  tags?: string[];
  last_interaction_at?: string;
  last_remarketed_at?: string;
}

