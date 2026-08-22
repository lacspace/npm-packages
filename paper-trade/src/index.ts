/**
 * @lacspace/paper-trade
 * A headless paper-trading engine — the simulator core behind StockYatra.
 *
 * Drop it into any app to get a virtual wallet, market/limit/stop orders that
 * fill against live prices, positions, holdings and live mark-to-market P&L.
 * Framework-agnostic, zero dependencies, isomorphic, fully typed.
 */

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "SL";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  qty: number;
  /** Required for LIMIT orders — the worst acceptable fill price. */
  price?: number;
  /** Required for SL (stop) orders — the price that activates the order. */
  triggerPrice?: number;
}

export interface Order extends OrderRequest {
  id: string;
  type: OrderType;
  status: OrderStatus;
  filledPrice?: number;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  time: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
}

export interface Holding extends Position {
  ltp: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
}

export interface PortfolioSummary {
  cash: number;
  invested: number;
  marketValue: number;
  /** cash + market value of open positions. */
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** Total P&L vs the starting cash. */
  totalPnl: number;
  holdings: Holding[];
}

export interface PaperAccountOptions {
  /** Starting virtual cash. */
  cash: number;
  /** Allow negative (short) positions. Default false. */
  allowShort?: boolean;
  /** Millis provider — override for deterministic tests. Default Date.now. */
  now?: () => number;
}

export class PaperAccount {
  private _cash: number;
  private readonly startCash: number;
  private readonly allowShort: boolean;
  private readonly now: () => number;

  private positions = new Map<string, Position>();
  private ltp = new Map<string, number>();
  private _orders: Order[] = [];
  private _trades: Trade[] = [];
  private _realizedPnl = 0;
  private seq = 0;

  constructor(opts: PaperAccountOptions) {
    this._cash = opts.cash;
    this.startCash = opts.cash;
    this.allowShort = opts.allowShort ?? false;
    this.now = opts.now ?? (() => Date.now());
  }

  private id(prefix: string): string {
    return `${prefix}_${++this.seq}_${this.now()}`;
  }

  /* --------------------------- state readers --------------------------- */

  get cash(): number {
    return round2(this._cash);
  }
  get realizedPnl(): number {
    return round2(this._realizedPnl);
  }
  get orders(): readonly Order[] {
    return this._orders;
  }
  get openOrders(): Order[] {
    return this._orders.filter((o) => o.status === "OPEN");
  }
  get trades(): readonly Trade[] {
    return this._trades;
  }

  /** Last known price for a symbol, if any. */
  price(symbol: string): number | undefined {
    return this.ltp.get(symbol);
  }

  /** Current net positions (excludes flat symbols). */
  getPositions(): Position[] {
    return [...this.positions.values()].filter((p) => p.qty !== 0);
  }

  /** Positions enriched with LTP and live P&L. */
  getHoldings(): Holding[] {
    return this.getPositions().map((p) => {
      const ltp = this.ltp.get(p.symbol) ?? p.avgPrice;
      const invested = p.avgPrice * p.qty;
      const current = ltp * p.qty;
      const pnl = current - invested;
      return {
        ...p,
        ltp,
        invested: round2(invested),
        current: round2(current),
        pnl: round2(pnl),
        pnlPercent: invested === 0 ? 0 : round2((pnl / Math.abs(invested)) * 100),
      };
    });
  }

  /** Unrealised P&L across all open positions at last known prices. */
  get unrealizedPnl(): number {
    return round2(this.getHoldings().reduce((s, h) => s + h.pnl, 0));
  }

  /** Total account P&L (realised + unrealised) vs starting cash. */
  get pnl(): number {
    return round2(this._realizedPnl + this.unrealizedPnl);
  }

  summary(): PortfolioSummary {
    const holdings = this.getHoldings();
    const marketValue = holdings.reduce((s, h) => s + h.current, 0);
    const invested = holdings.reduce((s, h) => s + h.invested, 0);
    const unrealizedPnl = holdings.reduce((s, h) => s + h.pnl, 0);
    return {
      cash: round2(this._cash),
      invested: round2(invested),
      marketValue: round2(marketValue),
      equity: round2(this._cash + marketValue),
      unrealizedPnl: round2(unrealizedPnl),
      realizedPnl: round2(this._realizedPnl),
      totalPnl: round2(this._cash + marketValue - this.startCash),
      holdings,
    };
  }

  /* ----------------------------- pricing ------------------------------ */

  /**
   * Feed the latest price(s). Triggers pending LIMIT/SL orders that the new
   * price satisfies, and refreshes mark-to-market P&L.
   */
  mark(prices: Record<string, number> | string, maybePrice?: number): void {
    if (typeof prices === "string") {
      if (maybePrice !== undefined) this.ltp.set(prices, maybePrice);
    } else {
      for (const [sym, px] of Object.entries(prices)) this.ltp.set(sym, px);
    }
    this.processOpenOrders();
  }

  /* ------------------------------ orders ------------------------------ */

  /** Place a market buy. With `price` it becomes a limit buy. */
  buy(symbol: string, o: { qty: number; price?: number; triggerPrice?: number }): Order {
    return this.place({ symbol, side: "BUY", ...o });
  }

  /** Place a market sell. With `price` it becomes a limit sell. */
  sell(symbol: string, o: { qty: number; price?: number; triggerPrice?: number }): Order {
    return this.place({ symbol, side: "SELL", ...o });
  }

  place(req: OrderRequest): Order {
    const type: OrderType =
      req.triggerPrice !== undefined ? "SL" : req.price !== undefined ? "LIMIT" : "MARKET";
    const t = this.now();
    const order: Order = {
      ...req,
      id: this.id("ord"),
      type,
      status: "OPEN",
      createdAt: t,
      updatedAt: t,
    };

    if (req.qty <= 0 || !Number.isFinite(req.qty)) {
      return this.reject(order, "qty must be a positive number");
    }

    this._orders.push(order);

    if (type === "MARKET") {
      const px = this.ltp.get(req.symbol);
      if (px === undefined) {
        return this.reject(order, `no market price for ${req.symbol} — call mark() first`);
      }
      this.fill(order, px);
    } else {
      // LIMIT / SL wait for a qualifying price; try immediately in case it already qualifies.
      this.tryFill(order);
    }
    return order;
  }

  cancel(orderId: string): boolean {
    const o = this._orders.find((x) => x.id === orderId && x.status === "OPEN");
    if (!o) return false;
    o.status = "CANCELLED";
    o.updatedAt = this.now();
    return true;
  }

  /* ---------------------------- fill logic ---------------------------- */

  private processOpenOrders(): void {
    for (const o of this._orders) {
      if (o.status === "OPEN") this.tryFill(o);
    }
  }

  private tryFill(o: Order): void {
    const px = this.ltp.get(o.symbol);
    if (px === undefined) return;

    if (o.type === "LIMIT") {
      const ok = o.side === "BUY" ? px <= o.price! : px >= o.price!;
      if (ok) this.fill(o, o.side === "BUY" ? Math.min(px, o.price!) : Math.max(px, o.price!));
    } else if (o.type === "SL") {
      const triggered = o.side === "BUY" ? px >= o.triggerPrice! : px <= o.triggerPrice!;
      if (triggered) this.fill(o, px);
    }
  }

  private fill(o: Order, price: number): void {
    if (o.side === "BUY") {
      const cost = price * o.qty;
      if (cost > this._cash + 1e-9) {
        this.reject(o, "insufficient cash");
        return;
      }
      this._cash -= cost;
      this.applyBuy(o.symbol, o.qty, price);
    } else {
      const pos = this.positions.get(o.symbol);
      const held = pos?.qty ?? 0;
      if (!this.allowShort && o.qty > held) {
        this.reject(o, `cannot sell ${o.qty} — only ${held} held`);
        return;
      }
      this._cash += price * o.qty;
      this.applySell(o.symbol, o.qty, price);
    }
    o.status = "FILLED";
    o.filledPrice = price;
    o.updatedAt = this.now();
    this._trades.push({
      id: this.id("trd"),
      orderId: o.id,
      symbol: o.symbol,
      side: o.side,
      qty: o.qty,
      price,
      time: o.updatedAt,
    });
  }

  private applyBuy(symbol: string, qty: number, price: number): void {
    const pos = this.positions.get(symbol);
    if (!pos || pos.qty === 0) {
      this.positions.set(symbol, { symbol, qty, avgPrice: price });
      return;
    }
    if (pos.qty > 0) {
      const totalQty = pos.qty + qty;
      pos.avgPrice = (pos.avgPrice * pos.qty + price * qty) / totalQty;
      pos.qty = totalQty;
    } else {
      // covering a short
      this.reduceShort(pos, qty, price);
    }
  }

  private applySell(symbol: string, qty: number, price: number): void {
    const pos = this.positions.get(symbol);
    if (!pos || pos.qty === 0) {
      // opening a short
      this.positions.set(symbol, { symbol, qty: -qty, avgPrice: price });
      return;
    }
    if (pos.qty > 0) {
      const closing = Math.min(qty, pos.qty);
      this._realizedPnl += (price - pos.avgPrice) * closing;
      pos.qty -= closing;
      const remainder = qty - closing;
      if (pos.qty === 0 && remainder > 0) {
        pos.qty = -remainder;
        pos.avgPrice = price;
      }
    } else {
      // adding to a short
      const totalQty = -pos.qty + qty;
      pos.avgPrice = (pos.avgPrice * -pos.qty + price * qty) / totalQty;
      pos.qty = -totalQty;
    }
  }

  private reduceShort(pos: Position, qty: number, price: number): void {
    const shortQty = -pos.qty;
    const closing = Math.min(qty, shortQty);
    this._realizedPnl += (pos.avgPrice - price) * closing;
    pos.qty += closing;
    const remainder = qty - closing;
    if (pos.qty === 0 && remainder > 0) {
      pos.qty = remainder;
      pos.avgPrice = price;
    }
  }

  private reject(o: Order, reason: string): Order {
    o.status = "REJECTED";
    o.reason = reason;
    o.updatedAt = this.now();
    return o;
  }

  /** Serialisable snapshot for persistence. Restore with {@link PaperAccount.restore}. */
  toJSON(): object {
    return {
      cash: this._cash,
      startCash: this.startCash,
      allowShort: this.allowShort,
      realizedPnl: this._realizedPnl,
      positions: [...this.positions.values()],
      ltp: [...this.ltp.entries()],
      orders: this._orders,
      trades: this._trades,
      seq: this.seq,
    };
  }

  static restore(snapshot: ReturnType<PaperAccount["toJSON"]>, now?: () => number): PaperAccount {
    const s = snapshot as ReturnType<PaperAccount["toJSON"]> & {
      cash: number;
      startCash: number;
      allowShort: boolean;
      realizedPnl: number;
      positions: Position[];
      ltp: [string, number][];
      orders: Order[];
      trades: Trade[];
      seq: number;
    };
    const acct = new PaperAccount({ cash: s.startCash, allowShort: s.allowShort, now });
    acct._cash = s.cash;
    acct._realizedPnl = s.realizedPnl;
    acct.positions = new Map(s.positions.map((p) => [p.symbol, p]));
    acct.ltp = new Map(s.ltp);
    acct._orders = s.orders;
    acct._trades = s.trades;
    acct.seq = s.seq;
    return acct;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
