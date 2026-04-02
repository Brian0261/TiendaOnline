export type DashboardOverview = {
  year: number;
  kpis: {
    salesYear: number;
    ordersYear: number;
    avgTicket: number;
    units: number;
    customers: number;
    deliveredRate: number;
  };
  monthly: {
    sales: Array<{ y: number; m: number; total: number }>;
    orders: Array<{ y: number; m: number; count: number }>;
  };
  topCategories: Array<{ name: string; total: number }>;
  recent: Array<{ id: number; fecha: string; cliente: string; estado: string; total: number }>;
};

export type SalesReport = {
  totalVentas: number;
  pedidosCompletados: number;
  topProductos: Array<{ nombre: string; cantidad: number; total: number }>;
  topMetodosPago: Array<{ nombre: string; cantidad: number }>;
};
