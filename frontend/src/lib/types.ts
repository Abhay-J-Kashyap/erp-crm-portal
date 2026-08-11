/**
 * TYPES MIRRORING THE BACKEND CONTRACT
 * ------------------------------------
 * These are hand-written duplicates of the backend's Prisma types, and
 * that duplication is a real cost: change the API and nothing here
 * breaks until runtime.
 *
 * Ways to remove it, roughly in order of effort:
 *   - a shared types package in a monorepo
 *   - generate an OpenAPI spec from Zod, then generate a typed client
 *   - tRPC, which infers frontend types straight from backend routers
 *
 * For a two-day project, hand-writing them is the right trade. Worth
 * naming in your README as a known limitation rather than pretending
 * it isn't one.
 */

export type Role = "ADMIN" | "SALES" | "WAREHOUSE" | "ACCOUNTS";
export type CustomerType = "RETAIL" | "WHOLESALE" | "DISTRIBUTOR";
export type CustomerStatus = "LEAD" | "ACTIVE" | "INACTIVE";
export type MovementType = "IN" | "OUT";
export type ChallanStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

/** Every successful response uses this envelope (see Part 3). */
export type ApiResponse<T> = {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
};

export type ApiError = {
  success: false;
  message: string;
  errors?: Array<{ field: string; message: string }> | Record<string, unknown>;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export type LoginResponse = { user: User; token: string };

export type Customer = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  customerType: CustomerType;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  status: CustomerStatus;
  followUpDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { challans: number; followUps: number };
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  /**
   * STRING, NOT NUMBER — and this is deliberate.
   * Postgres NUMERIC is serialised as a string so exact decimal digits
   * survive the trip. Typing it `number` here would be a lie that only
   * shows up as NaN in a total. Convert explicitly at the point of use.
   */
  unitPrice: string;
  currentStock: number;
  minStockAlert: number;
  location: string | null;
  isActive: boolean;
  isLowStock?: boolean;
  createdAt: string;
};

export type StockMovement = {
  id: string;
  quantity: number;
  movementType: MovementType;
  reason: string;
  stockAfter: number;
  createdAt: string;
  createdBy?: { id: string; name: string };
  challan?: { id: string; challanNumber: string } | null;
};

export type ChallanItem = {
  id: string;
  productId: string;
  /** Snapshot fields — frozen at creation, see Part 2. */
  productName: string;
  productSku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
};

export type Challan = {
  id: string;
  challanNumber: string;
  status: ChallanStatus;
  totalQuantity: number;
  totalAmount: string;
  remarks: string | null;
  confirmedAt: string | null;
  createdAt: string;
  customer: Pick<Customer, "id" | "name" | "businessName" | "mobile">;
  createdBy?: { id: string; name: string };
  items?: ChallanItem[];
  _count?: { items: number };
};
