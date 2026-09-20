export type ApiResponse<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export type Id = string;

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";
