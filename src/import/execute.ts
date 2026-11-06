import type { Ledger } from "../ledger/ledger.js";
import type { ImportPlan } from "./plan.js";

export interface ImportOutcome {
  imported: number;
  /** Duplicates plus transfers that were already in Actual. */
  skipped: number;
  /** New transfers between the user's own accounts. */
  transfers: number;
  errors: string[];
}

const isTransfer = (kind: string) =>
  kind === "transfer" || kind === "link" || kind === "adopt";

/** What executing `plan` would do — used for dry runs. */
export function predictOutcome(plan: ImportPlan): ImportOutcome {
  const count = (pred: (kind: string) => boolean) =>
    plan.items.filter((i) => pred(i.action.kind)).length;
  return {
    imported: count((k) => k === "create" || k === "transfer" || k === "link"),
    skipped: count((k) => k === "duplicate" || k === "adopt"),
    transfers: count(isTransfer),
    errors: [],
  };
}

/** Write the plan to the ledger. */
export async function executePlan(
  plan: ImportPlan,
  ledger: Ledger
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = {
    imported: 0,
    skipped: 0,
    transfers: plan.items.filter((i) => isTransfer(i.action.kind)).length,
    errors: [],
  };

  for (const { action, payload } of plan.items) {
    if (action.kind !== "adopt") continue;
    await ledger.updateTransaction(action.existing.id, {
      imported_id: payload.imported_id,
      imported_payee: payload.imported_payee,
      cleared: true,
    });
    outcome.skipped++;
  }

  const toImport = plan.items.filter((i) => i.action.kind !== "adopt");
  const result = await ledger.importTransactions(
    plan.accountId,
    toImport.map((i) => i.payload)
  );
  outcome.imported += result.added.length;
  outcome.skipped += toImport.length - result.added.length;
  outcome.errors.push(...result.errors.map((e) => e.message));

  const links = plan.items.flatMap((i) =>
    i.action.kind === "link"
      ? [{ importedId: i.importedId, counterpart: i.action.counterpart }]
      : []
  );
  if (links.length > 0) {
    const added = new Set(result.added);
    const ids = await ledger.findByImportedIds(
      plan.accountId,
      links.map((l) => l.importedId)
    );
    for (const { importedId, counterpart } of links) {
      const id = ids.get(importedId);
      if (!id || !added.has(id)) continue;
      try {
        await ledger.linkTransfer(
          { id: counterpart.id, account: counterpart.account },
          { id, account: plan.accountId }
        );
      } catch (error) {
        outcome.errors.push(
          `Failed to link transfer ${importedId.slice(0, 8)}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }

  return outcome;
}
