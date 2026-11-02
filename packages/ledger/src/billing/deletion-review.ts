import { createHash } from 'node:crypto';
import type { RefundRequestReview } from '@kazuist/contracts';
import type {
  BillingStore,
  LedgerPort,
  RefundRequest,
  DeletionRefundItem,
  DeletionRefundResolution,
} from './store.ts';
import { BillingError } from './service.ts';
import { deletionRefundLimit } from './deletion-refund.ts';

interface ProviderArgs {
  refundRef: string;
  paymentId: string;
  amountKurus: number;
  orderId: string | null;
  subscriptionId: null;
  raw: Record<string, unknown>;
}
interface Deps {
  store: BillingStore;
  ledger: LedgerPort;
  now: () => Date;
  newId: () => string;
  providerRefund: (args: ProviderArgs) => Promise<boolean>;
  invoice: (userId: string, orderId: string, amountKurus: number) => Promise<void>;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const startedReason = 'Yönetici onayıyla sağlayıcı iadesi yürütülüyor.';
const successReason = 'Sağlayıcı iadesi ve defter ters kaydı tamamlandı.';

/** Account-deletion review is deliberately separate from the legacy unknown-payment refund queue. */
export class DeletionRefundReview {
  constructor(private readonly d: Deps) {}
  private async request(id: string, store = this.d.store) {
    const row = await store.getDeletionRefundRequest(id);
    if (!row) throw new BillingError(404, 'refund_request_not_found');
    return row;
  }
  private async view(row: RefundRequest, store = this.d.store): Promise<RefundRequestReview> {
    const items = await store.listDeletionRefundItems(row.id);
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      amountKurus: row.amountKurus,
      decisionReason: row.decisionReason ?? null,
      decidedBy: row.decidedBy ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: (row.createdAt ?? this.d.now()).toISOString(),
      items: items.map(
        ({
          id,
          orderId,
          originalPaidKurus,
          originalCredits,
          unusedCredits,
          approvedAmountKurus,
          providerRefundRef,
          state,
          providerResultRef,
          resolvedBy,
          resolvedAt,
          resolutionReason,
          updatedBy,
          stateReason,
        }) => ({
          id,
          orderId,
          originalPaidKurus,
          originalCredits,
          unusedCredits,
          approvedAmountKurus,
          providerRefundRef,
          state,
          providerResultRef,
          resolvedBy,
          resolvedAt: resolvedAt?.toISOString() ?? null,
          resolutionReason,
          updatedBy,
          stateReason,
        }),
      ),
    };
  }
  private async tx<T>(id: string, fn: (store: BillingStore, ledger: LedgerPort) => Promise<T>): Promise<T> {
    try {
      return await this.d.store.withRefundRequestTransaction(id, this.d.ledger, fn);
    } catch (error) {
      if (error instanceof BillingError) throw error;
      if (error instanceof Error && error.message === 'refund_request_busy')
        throw new BillingError(409, 'refund_request_busy');
      if (error instanceof Error && error.message === 'refund_request_not_found')
        throw new BillingError(404, 'refund_request_not_found');
      throw new BillingError(502, 'refund_request_persistence_failed');
    }
  }
  async list(status: RefundRequest['status'], offset: number) {
    const rows = await this.d.store.listDeletionRefundRequests(status, offset);
    return {
      items: await Promise.all(rows.slice(0, 50).map((row) => this.view(row))),
      nextCursor: rows.length > 50 ? String(offset + 50) : null,
    };
  }
  private async candidates(row: RefundRequest, store: BillingStore, ledger: LedgerPort) {
    const wallet = await store.walletOf(row.userId);
    // In an approval transaction this lock remains held until the decision, items and holds all commit.
    const state = await ledger.run(wallet, (l) => structuredClone(l.wallet(wallet)));
    const orders = await store.listUserOrders(row.userId);
    const candidates = [];
    for (const lot of state.lots) {
      if (lot.source !== 'paket' || lot.closedBy) continue;
      const order = orders.find((o) => lot.originRef === `order:${o.id}`);
      if (!order?.paymentId || order.status !== 'odendi') continue;
      const charge = await store.findCharge(order.paymentId);
      if (!charge || charge.status !== 'basarili' || charge.orderId !== order.id || charge.amountKurus <= 0)
        continue;
      const exposure = await store.refundExposure(order.id);
      candidates.push({
        orderId: order.id,
        originalPaidKurus: charge.amountKurus,
        originalCredits: lot.originalCredits,
        unusedCredits: lot.remainingCredits,
        priorRefundExposureKurus: exposure,
        maxRefundKurus: deletionRefundLimit({
          originalPaidKurus: charge.amountKurus,
          originalCredits: lot.originalCredits,
          unusedCredits: lot.remainingCredits,
          priorRefundExposureKurus: exposure,
        }),
        hasOpenReservation: state.reservations.some(
          (r) => r.status === 'acik' && r.allocations.some((a) => a.lotId === lot.id),
        ),
      });
    }
    return candidates.sort((a, b) => a.orderId.localeCompare(b.orderId));
  }
  async detail(id: string) {
    const row = await this.request(id);
    return { ...(await this.view(row)), candidates: await this.candidates(row, this.d.store, this.d.ledger) };
  }
  async decide(actor: string, key: string, id: string, input: { decision: 'onay' | 'ret'; reason: string }) {
    const decisionHash = hash({ id, ...input });
    const fresh = await this.tx(id, async (store, ledger) => {
      const row = await this.request(id, store);
      if (row.status !== 'bekliyor') {
        if (row.decisionHash === decisionHash) return false;
        throw new BillingError(409, 'refund_request_already_decided');
      }
      if (input.decision === 'ret') {
        if (
          !(await store.decideDeletionRefundRequest(id, {
            status: 'reddedildi',
            amountKurus: 0,
            actorId: actor,
            reason: input.reason,
            key,
            hash: decisionHash,
            at: this.d.now(),
          }))
        )
          throw new BillingError(409, 'refund_request_already_decided');
        return false;
      }
      const candidates = await this.candidates(row, store, ledger);
      if (candidates.some((c) => c.hasOpenReservation))
        throw new BillingError(409, 'refund_request_has_open_reservations');
      const eligible = candidates.filter((c) => c.unusedCredits > 0 && c.maxRefundKurus > 0);
      if (!eligible.length) throw new BillingError(409, 'no_refundable_package_credits');
      const items: DeletionRefundItem[] = eligible.map((c) => {
        const itemId = this.d.newId();
        return {
          id: itemId,
          requestId: id,
          orderId: c.orderId,
          originalPaidKurus: c.originalPaidKurus,
          originalCredits: c.originalCredits,
          unusedCredits: c.unusedCredits,
          approvedAmountKurus: c.maxRefundKurus,
          holdOperationId: `silme_iade:${itemId}`,
          providerRefundRef: `silme:${itemId}`,
          state: 'hazir',
          providerResultRef: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionReason: null,
          updatedBy: actor,
          stateReason: input.reason,
        };
      });
      const amount = items.reduce((n, i) => n + i.approvedAmountKurus, 0);
      if (
        !(await store.decideDeletionRefundRequest(id, {
          status: 'onaylandi',
          amountKurus: amount,
          actorId: actor,
          reason: input.reason,
          key,
          hash: decisionHash,
          at: this.d.now(),
        }))
      )
        throw new BillingError(409, 'refund_request_already_decided');
      // The INSERT trigger checks the still-available credits. Holding happens immediately afterwards
      // under the same wallet lock and transaction, so either every allocation and hold exists or none do.
      await store.insertDeletionRefundItems(items);
      const wallet = await store.walletOf(row.userId);
      await ledger.run(wallet, (l) => {
        for (const item of items)
          l.holdUnusedPackageCredits({
            walletId: wallet,
            operationId: item.holdOperationId,
            originRef: `order:${item.orderId}`,
            now: this.d.now(),
            ttlMs: 10 * 365 * 86_400_000,
          });
      });
      return true;
    });
    if (fresh) return this.execute(actor, id);
    return this.view(await this.request(id));
  }
  private async completeIfReady(store: BillingStore, id: string) {
    const items = await store.listDeletionRefundItems(id);
    if (items.length && items.every((i) => i.state === 'basarili'))
      await store.completeDeletionRefundRequest(
        id,
        items.reduce((n, i) => n + i.approvedAmountKurus, 0),
      );
  }
  private async finishInTransaction(
    store: BillingStore,
    ledger: LedgerPort,
    actor: string,
    id: string,
    itemId: string,
    resolution?: DeletionRefundResolution,
  ) {
    const row = await this.request(id, store);
    const item = (await store.listDeletionRefundItems(id)).find((i) => i.id === itemId);
    if (!item || item.state === 'basarili') return null;
    const payment = await store.findRefund(item.providerRefundRef);
    if (payment?.status !== 'basarili' || payment.amountKurus !== item.approvedAmountKurus)
      throw new BillingError(409, 'refund_payment_not_verified');
    const wallet = await store.walletOf(row.userId);
    await ledger.run(wallet, (l) =>
      l.refundHeld({ walletId: wallet, operationId: item.holdOperationId, now: this.d.now() }),
    );
    if (
      !(await store.setDeletionRefundItemState(
        item.id,
        ['bekliyor'],
        'basarili',
        actor,
        resolution?.reason ?? successReason,
        resolution,
      ))
    )
      throw new BillingError(409, 'refund_item_conflict');
    const order = await store.getOrder(item.orderId);
    if (order && (await store.refundExposure(order.id)) >= item.originalPaidKurus) {
      order.status = 'iade_edildi';
      await store.saveOrder(order);
    }
    await this.completeIfReady(store, id);
    // Durable operational evidence survives a process dying before the external invoice call.
    // The e-Arsiv adapter has no idempotency/requery API, so do not automatically resend invoices.
    await store.alert('silme_iade_fatura_gerekli', {
      requestId: id,
      itemId: item.id,
      userId: row.userId,
      orderId: item.orderId,
      amountKurus: item.approvedAmountKurus,
    });
    return { userId: row.userId, orderId: item.orderId, amount: item.approvedAmountKurus };
  }
  private async finish(actor: string, id: string, itemId: string) {
    const invoice = await this.tx(id, (store, ledger) =>
      this.finishInTransaction(store, ledger, actor, id, itemId),
    );
    if (invoice) await this.d.invoice(invoice.userId, invoice.orderId, invoice.amount);
  }
  async execute(actor: string, id: string) {
    const request = await this.request(id);
    if (request.status === 'tamamlandi') return this.view(request);
    if (request.status !== 'onaylandi') throw new BillingError(409, 'refund_request_not_approved');
    for (const item of await this.d.store.listDeletionRefundItems(id)) {
      const attempt = await this.tx(id, async (store) => {
        const current = (await store.listDeletionRefundItems(id)).find((i) => i.id === item.id);
        if (!current || current.state === 'basarili') return null;
        const payment = await store.findRefund(current.providerRefundRef);
        if (payment?.status === 'basarili') return { item: current, paid: true };
        if (payment?.status === 'bekliyor') return null; // Unknown or in flight: never send twice.
        if (current.state === 'hazir' || current.state === 'basarisiz')
          await store.setDeletionRefundItemState(
            current.id,
            [current.state],
            'bekliyor',
            actor,
            startedReason,
          );
        return { item: current, paid: false };
      });
      if (!attempt) continue;
      if (!attempt.paid) {
        const order = await this.d.store.getOrder(item.orderId);
        if (!order?.paymentId) throw new BillingError(409, 'refund_order_payment_missing');
        try {
          await this.d.providerRefund({
            refundRef: item.providerRefundRef,
            paymentId: order.paymentId,
            amountKurus: item.approvedAmountKurus,
            orderId: item.orderId,
            subscriptionId: null,
            raw: {
              holdOp: item.holdOperationId,
              walletId: await this.d.store.walletOf(request.userId),
              refundRequestItemId: item.id,
              refundRequestId: id,
            },
          });
        } catch {
          const payment = await this.d.store.findRefund(item.providerRefundRef);
          if (payment?.status === 'basarisiz')
            await this.tx(id, (store) =>
              store.setDeletionRefundItemState(
                item.id,
                ['bekliyor'],
                'basarisiz',
                actor,
                'Sağlayıcı kesin başarısızlık bildirdi; onaylı kredi tutması korunuyor.',
              ),
            );
          continue;
        }
      }
      await this.finish(actor, id, item.id);
    }
    return this.view(await this.request(id));
  }
  async resolve(
    actor: string,
    id: string,
    itemId: string,
    input: { outcome: 'basarili' | 'basarisiz'; reason: string; providerResultRef?: string },
  ) {
    const invoice = await this.tx(id, async (store, ledger) => {
      await this.request(id, store);
      const item = (await store.listDeletionRefundItems(id)).find((i) => i.id === itemId);
      if (!item || item.state !== 'bekliyor') throw new BillingError(409, 'refund_item_not_pending');
      const payment = await store.findRefund(item.providerRefundRef);
      if (!payment || payment.status !== 'bekliyor')
        throw new BillingError(409, 'refund_payment_not_pending');
      if (!(await store.setRefundStatus(item.providerRefundRef, ['bekliyor'], input.outcome)))
        throw new BillingError(409, 'refund_payment_conflict');
      if (input.outcome === 'basarili') {
        return this.finishInTransaction(store, ledger, actor, id, itemId, {
          actorId: actor,
          reason: input.reason,
          at: this.d.now(),
          providerResultRef: input.providerResultRef,
        });
      }
      await store.setDeletionRefundItemState(item.id, ['bekliyor'], 'basarisiz', actor, input.reason, {
        actorId: actor,
        reason: input.reason,
        at: this.d.now(),
        providerResultRef: input.providerResultRef,
      });
    });
    if (invoice) await this.d.invoice(invoice.userId, invoice.orderId, invoice.amount);
    return this.view(await this.request(id));
  }
}
