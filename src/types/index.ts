export interface Product {
  id: number;
  code: string;
  name: string;
  stock_qty: number;
  price: number;
  cost_price: number;
  image_file?: string;
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
  staged_by?: string;
  staged_at?: string;
  msg_status: 'SENT' | 'UNSENT' | 'FAILED';
  msg_error?: string;
  is_locked?: boolean;
  locked_by?: string | null;
  items: OrderItem[];
  unmatched_comments?: string[];
  comments?: string[];
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
}
