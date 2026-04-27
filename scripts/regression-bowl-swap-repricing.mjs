import assert from "node:assert/strict";

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function computePricingDecision(oldTotalRs, newTotalRs) {
  const oldTotal = roundCurrency(Number(oldTotalRs ?? 0));
  const newTotal = roundCurrency(Number(newTotalRs ?? 0));
  const delta = roundCurrency(newTotal - oldTotal);
  return {
    oldTotal,
    newTotal,
    delta,
    shouldAdjustWallet: Math.abs(delta) >= 0.01,
  };
}

function applyDayConfigEditsWithRollback(existingRows, requestedUpdates, rpcErrorMessage = null) {
  const originalById = new Map(existingRows.map((row) => [row.id, row.bowl_slug]));
  const updated = existingRows.map((row) => {
    const found = requestedUpdates.find((u) => u.id === row.id);
    return found ? { ...row, bowl_slug: found.bowl_slug } : row;
  });

  if (!rpcErrorMessage) {
    return { rows: updated, rollbackApplied: false };
  }

  const rolledBack = updated.map((row) => ({
    ...row,
    bowl_slug: originalById.get(row.id) ?? row.bowl_slug,
  }));
  return {
    rows: rolledBack,
    rollbackApplied: true,
    error: rpcErrorMessage,
  };
}

function daySlugFromDate(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()] ?? "mon";
}

function planOrderSyncUpdates(dayConfigs, orders) {
  const configsByDay = new Map();
  for (const cfg of dayConfigs) {
    const key = String(cfg.day_of_week ?? "").toLowerCase();
    const bucket = configsByDay.get(key) ?? [];
    bucket.push(cfg);
    configsByDay.set(key, bucket);
  }

  const updates = [];
  for (const order of orders) {
    const daySlug = daySlugFromDate(order.delivery_date);
    const desired = configsByDay.get(daySlug) ?? [];
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const pairCount = Math.min(desired.length, items.length);
    for (let i = 0; i < pairCount; i += 1) {
      updates.push({
        orderId: order.id,
        itemId: items[i].id,
        bowl_slug: desired[i].bowl_slug,
      });
    }
  }
  return updates;
}

function testNetZeroSwapSkipsWalletAdjustment() {
  const decision = computePricingDecision(1125, 1125.004);
  assert.equal(decision.delta, 0);
  assert.equal(decision.shouldAdjustWallet, false);
}

function testDowngradeFailureRollsBackDayConfigs() {
  const existingRows = [
    { id: "a", bowl_slug: "dragon-glow" },
    { id: "b", bowl_slug: "very-fruity" },
  ];
  const requested = [
    { id: "a", bowl_slug: "very-fruity" },
    { id: "b", bowl_slug: "dragon-glow" },
  ];
  const result = applyDayConfigEditsWithRollback(
    existingRows,
    requested,
    "Wallet balance (0) is less than pricing reduction (125)",
  );
  assert.equal(result.rollbackApplied, true);
  assert.deepEqual(result.rows, existingRows);
}

function testOrderSyncFollowsUpdatedDayMapping() {
  const dayConfigs = [
    { id: "cfg-mon", day_of_week: "mon", bowl_slug: "very-fruity" },
    { id: "cfg-wed", day_of_week: "wed", bowl_slug: "dragon-glow" },
  ];
  const orders = [
    {
      id: "ord-mon",
      delivery_date: "2026-04-27",
      order_items: [{ id: "item-mon", bowl_slug: "dragon-glow" }],
    },
    {
      id: "ord-wed",
      delivery_date: "2026-04-29",
      order_items: [{ id: "item-wed", bowl_slug: "very-fruity" }],
    },
  ];
  const updates = planOrderSyncUpdates(dayConfigs, orders);
  assert.deepEqual(updates, [
    { orderId: "ord-mon", itemId: "item-mon", bowl_slug: "very-fruity" },
    { orderId: "ord-wed", itemId: "item-wed", bowl_slug: "dragon-glow" },
  ]);
}

testNetZeroSwapSkipsWalletAdjustment();
testDowngradeFailureRollsBackDayConfigs();
testOrderSyncFollowsUpdatedDayMapping();

console.log("regression-bowl-swap-repricing: all checks passed");
